/**
 * web_fetch — GET a public URL and return markdown/text to the model.
 */

import type { ToolExecutionContext, ToolResult } from '../index';
import {
  ACCEPT_HEADER,
  FETCH_TIMEOUT_MS,
  FetchTextCache,
  MAX_CONTENT_LENGTH,
  MAX_REDIRECTS,
  USER_AGENT,
  checkResolvedIps,
  checkSsrfLiteral,
  hostIsIpLiteral,
  htmlToMarkdown,
  isHtmlMime,
  parseAndNormalizeUrl,
  policyErrorMessage,
  readBodyCapped,
  resolveHostDoH,
  sameHost,
  shouldInlineAsText,
  stripBase64DataUris,
  truncateMarkdown,
} from '../web-fetch';

const cache = new FetchTextCache();

function ok(text: string): ToolResult {
  return { content: [{ text }] };
}

export async function handleWebFetch(
  args: Record<string, unknown> | undefined,
  _context?: ToolExecutionContext,
): Promise<ToolResult> {
  return runWebFetch(args, globalThis.fetch.bind(globalThis));
}

export type WebFetchRunOptions = {
  resolveHost?: (
    host: string,
    fetchImpl: typeof fetch,
    signal: AbortSignal,
  ) => Promise<string[]>;
  now?: () => number;
};

/** Testable fetch implementation. Always returns a ToolResult (never throws). */
export async function runWebFetch(
  args: Record<string, unknown> | undefined,
  fetchImpl: typeof fetch,
  options?: WebFetchRunOptions,
): Promise<ToolResult> {
  const raw = typeof args?.url === 'string' ? args.url.trim() : '';
  if (!raw) {
    return ok('Error: url parameter is required');
  }

  const parsed = parseAndNormalizeUrl(raw);
  if ('error' in parsed) {
    return ok(policyErrorMessage(parsed.error));
  }

  const startUrl = parsed.url;
  const cacheKey = startUrl.toString();
  const cached = cache.get(cacheKey);
  if (cached) return ok(cached);

  const now = options?.now ?? Date.now;
  const deadline = now() + FETCH_TIMEOUT_MS;
  const resolveHost = options?.resolveHost ?? resolveHostDoH;

  try {
    const result = await fetchWithSameHostRedirects(
      startUrl,
      fetchImpl,
      resolveHost,
      deadline,
      now,
    );
    if ('message' in result) {
      return ok(result.message);
    }

    const { body, contentType, finalUrl, status } = result;

    if (status >= 400) {
      return ok(`Error fetching URL ${finalUrl}: HTTP ${status}`);
    }

    if (!shouldInlineAsText(contentType)) {
      return ok(
        `Error: unsupported content type ${contentType.split(';')[0]?.trim() || contentType} from ${finalUrl}. ` +
          'web_fetch returns HTML/markdown and text only — attach binary files instead.',
      );
    }

    const decoder = new TextDecoder('utf-8', { fatal: false });
    let text = decoder.decode(body);
    if (isHtmlMime(contentType)) {
      text = htmlToMarkdown(text);
    } else {
      text = stripBase64DataUris(text);
    }

    const out = truncateMarkdown(text);
    cache.set(cacheKey, out);
    return ok(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'timeout' || msg.includes('aborted') || msg.includes('AbortError')) {
      return ok(`Error fetching URL ${startUrl}: timed out`);
    }
    return ok(`Error fetching URL ${startUrl}: ${msg}`);
  }
}

type HopOk = { body: Uint8Array; contentType: string; finalUrl: string; status: number };
type HopMsg = { message: string };

function remainingMs(deadline: number, now: () => number): number {
  return Math.max(0, deadline - now());
}

async function checkHostResolved(
  url: URL,
  fetchImpl: typeof fetch,
  resolveHost: NonNullable<WebFetchRunOptions['resolveHost']>,
  signal: AbortSignal,
): Promise<HopMsg | null> {
  const literal = checkSsrfLiteral(url);
  if (literal) return { message: policyErrorMessage(literal) };
  if (hostIsIpLiteral(url.hostname)) return null;
  const ips = await resolveHost(url.hostname, fetchImpl, signal);
  const blocked = checkResolvedIps(url.hostname, ips);
  if (blocked) return { message: policyErrorMessage(blocked) };
  return null;
}

async function fetchWithSameHostRedirects(
  start: URL,
  fetchImpl: typeof fetch,
  resolveHost: NonNullable<WebFetchRunOptions['resolveHost']>,
  deadline: number,
  now: () => number,
): Promise<HopOk | HopMsg> {
  let current = new URL(start.toString());
  let hops = 0;

  while (true) {
    const left = remainingMs(deadline, now);
    if (left <= 0) return { message: `Error fetching URL ${current}: timed out` };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), left);
    try {
      const ssrf = await checkHostResolved(current, fetchImpl, resolveHost, controller.signal);
      if (ssrf) return ssrf;

      const resp = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: ACCEPT_HEADER,
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (resp.status >= 300 && resp.status < 400) {
        hops += 1;
        if (hops > MAX_REDIRECTS) {
          return { message: `Error: too many redirects (max ${MAX_REDIRECTS})` };
        }
        const location = resp.headers.get('location');
        if (!location) {
          return {
            message: `Error fetching URL ${current}: HTTP ${resp.status} redirect with no Location`,
          };
        }
        let nextRaw: URL;
        try {
          nextRaw = new URL(location, current);
        } catch {
          return { message: `Error: invalid redirect URL: ${location}` };
        }
        if (!sameHost(current, nextRaw)) {
          return {
            message: `Error: cross-host redirect from ${current.hostname} to ${nextRaw.toString()}. Make a new web_fetch call with the redirect URL if needed.`,
          };
        }
        const next = parseAndNormalizeUrl(nextRaw.toString());
        if ('error' in next) return { message: policyErrorMessage(next.error) };
        current = next.url;
        continue;
      }

      const contentType = resp.headers.get('content-type') || 'text/html';
      const declared = resp.headers.get('content-length');
      if (declared && Number(declared) > MAX_CONTENT_LENGTH) {
        return {
          message: `Error: response body exceeds maximum size of ${MAX_CONTENT_LENGTH} bytes`,
        };
      }

      const capped = await readBodyCapped(resp, MAX_CONTENT_LENGTH);
      if (!capped.ok) {
        return {
          message: `Error: response body exceeds maximum size of ${MAX_CONTENT_LENGTH} bytes`,
        };
      }

      return {
        body: capped.body,
        contentType,
        finalUrl: resp.url || current.toString(),
        status: resp.status,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
