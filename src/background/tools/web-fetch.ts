/**
 * Pure helpers for the web_fetch tool (URL policy, SSRF, HTML→markdown).
 * Network I/O lives in the handler.
 */

export const MAX_URL_LENGTH = 2_000;
export const MAX_REDIRECTS = 10;
export const MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
export const MAX_MARKDOWN_LENGTH = 100_000;
export const FETCH_TIMEOUT_MS = 60_000;
export const USER_AGENT = 'Mozilla/5.0 (compatible; BraceKit/1.0)';
export const ACCEPT_HEADER =
  'text/markdown,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.google.com',
  '169.254.169.254',
]);

export type UrlPolicyError =
  | { kind: 'too_long'; max: number }
  | { kind: 'invalid' }
  | { kind: 'unsupported_scheme'; scheme: string }
  | { kind: 'credentials' }
  | { kind: 'single_label'; host: string }
  | { kind: 'ssrf'; host: string }
  | { kind: 'dns'; host: string };

export function isExplicitLocalHost(host: string): boolean {
  let h = host.trim().replace(/\.+$/, '').toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  h = h.split('%')[0] ?? h;
  if (h === 'localhost') return true;
  const ip = parseIp(h);
  return ip ? isLoopbackAddr(ip) : false;
}

export function parseAndNormalizeUrl(raw: string): { url: URL } | { error: UrlPolicyError } {
  if (raw.length > MAX_URL_LENGTH) return { error: { kind: 'too_long', max: MAX_URL_LENGTH } };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: { kind: 'invalid' } };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: { kind: 'unsupported_scheme', scheme: parsed.protocol.replace(':', '') } };
  }

  if (parsed.username || parsed.password) {
    return { error: { kind: 'credentials' } };
  }

  const host = parsed.hostname;
  if (host && host.split('.').filter(Boolean).length < 2 && !isExplicitLocalHost(host)) {
    return { error: { kind: 'single_label', host } };
  }

  upgradeToHttps(parsed);

  const ssrf = checkSsrfLiteral(parsed);
  if (ssrf) return { error: ssrf };

  return { url: parsed };
}

export function upgradeToHttps(url: URL): void {
  if (url.protocol !== 'http:') return;
  if (isExplicitLocalHost(url.hostname)) return;
  url.protocol = 'https:';
}

export function checkSsrfLiteral(url: URL): UrlPolicyError | null {
  const host = url.hostname;
  const lowered = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (METADATA_HOSTS.has(lowered)) {
    return { kind: 'ssrf', host };
  }
  // v1: never allow loopback / private IP literals.
  if (isExplicitLocalHost(host)) {
    return { kind: 'ssrf', host };
  }
  const ip = parseIp(lowered);
  if (ip && isNonPublicIp(ip)) {
    return { kind: 'ssrf', host };
  }
  return null;
}

export function sameHost(a: URL, b: URL): boolean {
  return a.hostname === b.hostname;
}

/** Block if any resolved address is non-public. Empty/unparseable list is a DNS failure. */
export function checkResolvedIps(host: string, ips: string[]): UrlPolicyError | null {
  const parsed = ips
    .map((raw) => parseIp(raw.replace(/^\[|\]$/g, '')))
    .filter((ip): ip is NonNullable<typeof ip> => ip !== null);
  if (parsed.length === 0) {
    return { kind: 'dns', host };
  }
  for (const ip of parsed) {
    if (isNonPublicIp(ip)) {
      return { kind: 'ssrf', host };
    }
  }
  return null;
}

export function hostIsIpLiteral(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '');
  return parseIp(h) !== null;
}

type DohAnswer = { Answer?: Array<{ type?: number; data?: string }> };

/**
 * Resolve A/AAAA via Cloudflare DNS-over-HTTPS. Fail closed on network/parse errors.
 * Does not pin the later TCP peer (fetch cannot); still blocks names that currently
 * resolve to private/metadata addresses.
 */
export async function resolveHostDoH(
  host: string,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<string[]> {
  const ips: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`;
    const resp = await fetchImpl(url, {
      method: 'GET',
      signal,
      headers: { Accept: 'application/dns-json' },
    });
    if (!resp.ok) continue;
    const json = (await resp.json()) as DohAnswer;
    for (const ans of json.Answer ?? []) {
      // type 1 = A, 28 = AAAA. Ignore CNAME (5) and other chain records —
      // their `data` is a hostname; treating it as an IP false-positives SSRF.
      if ((ans.type === 1 || ans.type === 28) && typeof ans.data === 'string' && ans.data) {
        ips.push(ans.data);
      }
    }
  }
  return ips;
}

/** Read a response body, aborting once it exceeds `max` bytes. */
export async function readBodyCapped(
  resp: Response,
  max: number,
): Promise<{ ok: true; body: Uint8Array } | { ok: false; tooLarge: true }> {
  if (!resp.body) {
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.byteLength > max) return { ok: false, tooLarge: true };
    return { ok: true, body: buf };
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return { ok: false, tooLarge: true };
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: out };
}

export function policyErrorMessage(err: UrlPolicyError): string {
  switch (err.kind) {
    case 'too_long':
      return `Error: URL exceeds maximum length of ${err.max} characters`;
    case 'invalid':
      return 'Error: invalid URL';
    case 'unsupported_scheme':
      return `Error: unsupported URL scheme: ${err.scheme} (only http/https allowed)`;
    case 'credentials':
      return 'Error: URLs with embedded credentials are not allowed';
    case 'single_label':
      return `Error: hostname must have at least two dot-separated parts, got: ${err.host}`;
    case 'ssrf':
      return `Error: SSRF blocked: ${err.host} is a private/internal or metadata address`;
    case 'dns':
      return `Error: DNS resolution failed for ${err.host}`;
  }
}

// ---------- IP / SSRF ----------

type Ip = { v: 4; n: number } | { v: 6; hi: bigint; lo: bigint; mappedV4?: number };

function parseIp(host: string): Ip | null {
  const v4 = parseIpv4(host);
  if (v4 !== null) return { v: 4, n: v4 };
  return parseIpv6(host);
}

function parseIpv4(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

function parseIpv6(host: string): Ip | null {
  if (!host.includes(':')) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  if (mapped) {
    const v4 = parseIpv4(mapped[1]!);
    if (v4 === null) return null;
    return { v: 6, hi: 0n, lo: 0n, mappedV4: v4 };
  }
  const halves = host.split('::');
  if (halves.length > 2) return null;
  const parseGroup = (s: string) => s.split(':').filter(Boolean);
  let head = parseGroup(halves[0] ?? '');
  let tail = halves.length === 2 ? parseGroup(halves[1] ?? '') : [];
  if (head.concat(tail).some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  if (halves.length === 2) head = head.concat(Array(missing).fill('0'));
  const groups = head.concat(tail);
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  const hi =
    (BigInt(nums[0]!) << 48n) |
    (BigInt(nums[1]!) << 32n) |
    (BigInt(nums[2]!) << 16n) |
    BigInt(nums[3]!);
  const lo =
    (BigInt(nums[4]!) << 48n) |
    (BigInt(nums[5]!) << 32n) |
    (BigInt(nums[6]!) << 16n) |
    BigInt(nums[7]!);
  const mappedV4 = mappedV4FromV6(hi, lo);
  return mappedV4 !== undefined
    ? { v: 6, hi, lo, mappedV4 }
    : { v: 6, hi, lo };
}

/** ::ffff:0:0/96 — IPv4-mapped IPv6 (hex or dotted). */
function mappedV4FromV6(hi: bigint, lo: bigint): number | undefined {
  if (hi !== 0n) return undefined;
  if ((lo >> 32n) !== 0xffffn) return undefined;
  return Number(lo & 0xffffffffn) >>> 0;
}

function ipv4InCidr(ip: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ip & mask) === (base & mask);
}

export function isNonPublicIp(ip: Ip): boolean {
  if (ip.v === 4) return isNonPublicIpv4(ip.n);
  if (ip.mappedV4 !== undefined) return isNonPublicIpv4(ip.mappedV4);
  return isNonPublicIpv6(ip);
}

function isNonPublicIpv4(ip: number): boolean {
  const oct = (ip >>> 24) & 0xff;
  if (oct === 127) return true; // loopback
  if (oct === 10) return true;
  if (oct === 0) return true;
  if (ipv4InCidr(ip, 0xac100000, 12)) return true; // 172.16/12
  if (ipv4InCidr(ip, 0xc0a80000, 16)) return true; // 192.168/16
  if (ipv4InCidr(ip, 0xa9fe0000, 16)) return true; // 169.254/16
  if (ipv4InCidr(ip, 0x64400000, 10)) return true; // 100.64/10 CGNAT
  if (ipv4InCidr(ip, 0xc0000000, 24)) return true; // 192.0.0.0/24
  if (ipv4InCidr(ip, 0xc0000200, 24)) return true; // TEST-NET-1
  if (ipv4InCidr(ip, 0xc6120000, 15)) return true; // 198.18/15
  if (ipv4InCidr(ip, 0xc6336400, 24)) return true; // TEST-NET-2
  if (ipv4InCidr(ip, 0xcb007100, 24)) return true; // TEST-NET-3
  if (ipv4InCidr(ip, 0xe0000000, 4)) return true; // multicast
  if (ipv4InCidr(ip, 0xf0000000, 4)) return true; // 240/4
  if (ip === 0xffffffff) return true;
  return false;
}

function isLoopbackAddr(ip: Ip): boolean {
  if (ip.v === 4) return ((ip.n >>> 24) & 0xff) === 127;
  const mapped = ip.mappedV4 ?? mappedV4FromV6(ip.hi, ip.lo);
  if (mapped !== undefined) return ((mapped >>> 24) & 0xff) === 127;
  return ip.hi === 0n && ip.lo === 1n; // ::1
}

function isNonPublicIpv6(ip: Extract<Ip, { v: 6 }>): boolean {
  const mapped = ip.mappedV4 ?? mappedV4FromV6(ip.hi, ip.lo);
  if (mapped !== undefined) return isNonPublicIpv4(mapped);
  if (ip.hi === 0n && ip.lo === 1n) return true; // ::1
  if (ip.hi === 0n && ip.lo === 0n) return true; // ::
  // fe80::/10 link-local
  if ((ip.hi >> 54n) === 0x3fan) return true;
  // fc00::/7 unique local
  if ((ip.hi >> 57n) === 0x7en) return true;
  // ff00::/8 multicast
  if ((ip.hi >> 56n) === 0xffn) return true;
  return false;
}

// ---------- MIME / truncation ----------

export function mimeOf(contentType: string): string {
  return (contentType.split(';')[0] ?? contentType).trim().toLowerCase();
}

export function isHtmlMime(contentType: string): boolean {
  const m = mimeOf(contentType);
  return m.includes('text/html') || m.includes('application/xhtml');
}

const TEXTISH_MIME = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/ecmascript',
  'application/x-javascript',
  'application/xhtml+xml',
  'application/rss+xml',
  'application/atom+xml',
  'application/soap+xml',
  'application/xslt+xml',
  'application/mathml+xml',
  'application/svg+xml',
  'application/x-www-form-urlencoded',
  'application/graphql',
  'application/ld+json',
  'application/schema+json',
  'application/vnd.api+json',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
]);

/** True when the body should be returned as text/markdown (not rejected as binary). */
export function shouldInlineAsText(contentType: string): boolean {
  if (isHtmlMime(contentType)) return true;
  const mime = mimeOf(contentType);
  if (mime.startsWith('text/')) return true;
  return TEXTISH_MIME.has(mime);
}

export function truncateMarkdown(content: string, max = MAX_MARKDOWN_LENGTH): string {
  if (content.length <= max) return content;
  const shown = content.slice(0, max);
  return `${shown}\n\n[web_fetch content truncated: showing ${max} of ${content.length} chars]`;
}

export function stripBase64DataUris(content: string): string {
  return content.replace(/data:[a-z0-9.+/-]+;base64,[a-z0-9+/=\s]+/gi, '[omitted data URI]');
}

export function htmlToMarkdown(html: string): string {
  let s = html.replace(/<(script|style|noscript|svg|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<(script|style|noscript|svg|iframe|object|embed)\b[^>]*\/?>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');

  s = s.replace(/<pre\b[^>]*><code\b[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_m, inner) => {
    return `\n\`\`\`\n${decodeEntities(stripTags(inner)).trimEnd()}\n\`\`\`\n`;
  });
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner) => {
    return `\n\`\`\`\n${decodeEntities(stripTags(inner)).trimEnd()}\n\`\`\`\n`;
  });
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner) => {
    return `\`${decodeEntities(stripTags(inner))}\``;
  });

  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n, inner) => {
    return `\n${'#'.repeat(Number(n))} ${inline(inner)}\n`;
  });
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href, inner) => {
    return `[${inline(inner)}](${href})`;
  });
  s = s.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, (_m, alt) => (alt ? `![${alt}]()` : ''));
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => `**${inline(inner)}**`);
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, inner) => `*${inline(inner)}*`);
  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => `- ${inline(inner)}\n`);
  s = s.replace(/<\/(p|div|br|tr|table|ul|ol)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = stripBase64DataUris(s);
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inline(inner: string): string {
  return decodeEntities(stripTags(inner)).replace(/\s+/g, ' ').trim();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));
}

export type FetchCacheEntry = { text: string; expiresAt: number };

export class FetchTextCache {
  private map = new Map<string, FetchCacheEntry>();
  constructor(
    private ttlMs = 15 * 60 * 1000,
    private maxEntries = 128,
  ) {}

  get(key: string, now = Date.now()): string | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= now) {
      this.map.delete(key);
      return undefined;
    }
    return hit.text;
  }

  set(key: string, text: string, now = Date.now()): void {
    if (this.map.size >= this.maxEntries) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { text, expiresAt: now + this.ttlMs });
  }
}
