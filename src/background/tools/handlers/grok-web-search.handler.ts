/**
 * Grok Web Search Tool Handler
 *
 * Ports grok-build's `WebSearchClient::search()` (Rust → TypeScript):
 * builds a `/responses` request with a single hosted `web_search` tool,
 * sends it as a separate non-streaming call, and extracts the synthesized
 * answer text + URL-citation annotations.
 *
 * Reuses the same OAuth access token the Grok (OAuth) provider already
 * obtains via `getGrokAccessToken()` — no separate API key is required.
 */

import type { ToolResult, ToolExecutionContext } from '../index';
import { getGrokAccessToken } from '../../../utils/grokOAuth.ts';

// The xAI CLI chat proxy rejects unknown/outdated Grok CLI versions with
// HTTP 426. These identity headers must match what `formatResponses` sends
// for the main chat request, or the proxy will reject the search call.
const XAI_CLI_VERSION = '0.2.120';

export interface GrokWebSearchArgs {
  query?: string;
  allowed_domains?: string[];
}

interface Annotation {
  type?: string;
  url_citation?: {
    url?: string;
    title?: string;
  };
}

interface OutputContentPart {
  type?: string;
  text?: string;
  annotations?: Annotation[];
}

interface OutputItem {
  type?: string;
  content?: OutputContentPart[];
}

interface ResponsesApiPayload {
  output_text?: string;
  output?: OutputItem[];
}

/**
 * Build the Grok CLI identity headers for the chat proxy. Mirrors the header
 * block in `formatResponses()` so the main chat request and the search
 * request stay in sync on `XAI_CLI_VERSION` / `x-grok-client-version`, etc.
 */
function grokChatProxyHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  headers['X-XAI-Token-Auth'] = 'xai-grok-cli';
  headers['x-grok-client-version'] = XAI_CLI_VERSION;
  headers['User-Agent'] = `xai-grok-workspace/${XAI_CLI_VERSION}`;
  headers['x-grok-client-identifier'] = 'grok-shell';
  headers['x-authenticateresponse'] = 'authenticate-response';
  return headers;
}

/**
 * Build the `/responses` request body for a single web search.
 *
 * Faithful port of grok-build's `build_request_json`: exactly one tool
 * (the hosted `web_search`), `store:false`, and fixed generation params.
 * `allowed_domains` is placed in `tools[0].filters.allowed_domains` (matching
 * the async-openai `WebSearchToolFilters` shape); `excluded_domains` is left
 * out for v1 since the model-facing input only carries `allowed_domains`.
 */
function buildRequestBody(
  query: string,
  model: string,
  allowedDomains?: string[]
): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  if (allowedDomains && allowedDomains.length > 0) {
    filters.allowed_domains = allowedDomains;
  }
  const tool: Record<string, unknown> = { type: 'web_search' };
  if (Object.keys(filters).length > 0) {
    tool.filters = filters;
  }
  return {
    model,
    input: query,
    tools: [tool],
    store: false,
    temperature: 0.1,
    top_p: 0.95,
    max_output_tokens: 8192,
  };
}

/**
 * Extract deduplicated `(title, url)` citation pairs from a Responses-API
 * payload. Walks `output[].content[].annotations[]` for `url_citation`
 * annotations, preserving first-seen order. Ports `extract_citation_pairs`.
 */
function extractCitations(data: ResponsesApiPayload): Array<{ title: string; url: string }> {
  const pairs: Array<{ title: string; url: string }> = [];
  const output = data.output;
  if (!Array.isArray(output)) return pairs;

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    if (item.type !== 'message') continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const annotations = part.annotations;
      if (!Array.isArray(annotations)) continue;
      for (const annotation of annotations) {
        if (!annotation || annotation.type !== 'url_citation') continue;
        const citation = annotation.url_citation;
        const url = citation?.url;
        if (!url) continue;
        const title = citation?.title ?? '';
        pairs.push({ title, url });
      }
    }
  }

  // Dedupe by URL, preserving first-seen order (matches grok-build's HashSet retain).
  const seen = new Set<string>();
  return pairs.filter(({ url }) => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

/**
 * Extract the synthesized answer text. Prefers the top-level `output_text`
 * convenience field; otherwise joins `output_text` content parts (mirrors
 * `extractResponsesText` / `response.output_text()`).
 */
function extractOutputText(data: ResponsesApiPayload): string {
  const direct = data.output_text;
  if (typeof direct === 'string' && direct.length > 0) return direct;

  const output = data.output;
  if (!Array.isArray(output)) return '';

  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    if (item.type !== 'message') continue;
    const content = item.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      if (part.type === 'output_text' && typeof part.text === 'string') {
        texts.push(part.text);
      }
    }
  }
  return texts.join('');
}

/**
 * Get a user-friendly error message from a non-OK API response.
 * Mirrors the pattern used by `google-search.handler.ts`.
 */
async function getFriendlyErrorMessage(response: Response, prefix: string): Promise<string> {
  const status = response.status;
  let details = '';
  try {
    const errorText = await response.text();
    try {
      const errJson = JSON.parse(errorText) as Record<string, unknown>;
      const errorObj = errJson.error as Record<string, unknown> | undefined;
      details =
        (errorObj?.message as string | undefined) ||
        (errJson.message as string | undefined) ||
        (typeof errJson.error === 'string' ? errJson.error : null) ||
        errorText;
    } catch {
      details = errorText;
    }
  } catch {
    details = response.statusText;
  }

  if (!details || details.length > 500) {
    details = response.statusText || 'Unknown error';
  }

  let statusPrefix = `${prefix} (${status})`;
  if (status === 401) statusPrefix = 'Grok OAuth token expired (401)';
  else if (status === 403) statusPrefix = 'Permission Denied (403)';
  else if (status === 404) statusPrefix = 'Not Found (404)';
  else if (status === 426) statusPrefix = 'Grok CLI version rejected (426)';
  else if (status === 429) statusPrefix = 'Rate Limit Exceeded (429)';
  else if (status >= 500) statusPrefix = 'Provider Server Error (' + status + ')';

  return `${statusPrefix}: ${details}`;
}

/**
 * Perform a single Responses-API search call. Returns the parsed payload
 * or throws on non-2xx (after reading the error body).
 */
async function sendSearchRequest(
  url: string,
  headers: Record<string, string>,
  body: Record<string, unknown>
): Promise<ResponsesApiPayload> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await getFriendlyErrorMessage(response, 'Grok Web Search Error');
    const err = new Error(error) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  return (await response.json()) as ResponsesApiPayload;
}

/**
 * Handle Grok web_search tool execution.
 *
 * @param args - Tool arguments (`query`, optional `allowed_domains`)
 * @param context - Execution context carrying the Grok OAuth bearer + model + apiUrl
 * @returns Tool result with synthesized answer + a `Sources:` list
 */
export async function handleGrokWebSearch(
  args: GrokWebSearchArgs | undefined,
  context: ToolExecutionContext | undefined
): Promise<ToolResult> {
  const query = args?.query ?? '';

  if (!query) {
    return { content: [{ text: 'Error: query parameter is required' }] };
  }

  const model = context?.grokModel || 'grok-4.6';
  const baseUrl = context?.grokApiUrl || 'https://cli-chat-proxy.grok.com/v1';
  const url = `${baseUrl.replace(/\/+$/, '')}/responses`;

  const body = buildRequestBody(query, model, args?.allowed_domains);

  // Resolve a live OAuth bearer. Prefer the context value (already refreshed
  // by the chat.service path); fall back to getGrokAccessToken() which itself
  // does lead-time refresh.
  const resolveToken = async (): Promise<string> => {
    if (context?.grokAccessToken) return context.grokAccessToken;
    return await getGrokAccessToken();
  };

  try {
    let token = await resolveToken();
    let headers = grokChatProxyHeaders(token);

    try {
      const data = await sendSearchRequest(url, headers, body);
      return formatSearchResult(data);
    } catch (e) {
      // 401 → token expired mid-search: refresh once and retry a single time
      // (mirrors grok-build's 401 handling — getGrokAccessToken refreshes with
      // single-flight dedup, so concurrent calls share one refresh).
      if ((e as Error & { status?: number }).status === 401) {
        // Force a refresh by clearing any stale cached token and re-resolving.
        // getGrokAccessToken checks expiry against GROK_REFRESH_LEAD_MS; if the
        // 401 happened anyway (clock skew / proxy-side expiry), we refresh by
        // calling it again — the single-flight refresh ensures one network call.
        token = await getGrokAccessToken();
        headers = grokChatProxyHeaders(token);
        const data = await sendSearchRequest(url, headers, body);
        return formatSearchResult(data);
      }
      throw e;
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('Grok OAuth: not connected')) {
      return {
        content: [
          {
            text: 'Grok sign-in required. Open Settings → AI Provider → Grok to connect.',
          },
        ],
      };
    }
    return { content: [{ text: `Grok Web Search Error: ${msg}` }] };
  }
}

/**
 * Format the parsed Responses-API payload into a tool result: synthesized
 * answer text followed by a Markdown `Sources:` list (mirroring how
 * `google_search.handler` appends sources).
 */
function formatSearchResult(data: ResponsesApiPayload): ToolResult {
  const text = extractOutputText(data) || 'No search results found.';
  const citations = extractCitations(data);

  let result = text;
  if (citations.length > 0) {
    const sources = citations
      .map((c, i) => `[${i + 1}] ${c.title ? c.title + ' - ' : ''}${c.url}`)
      .join('\n');
    result += `\n\nSources:\n${sources}`;
  }

  return { content: [{ text: result }] };
}
