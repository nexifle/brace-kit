// ==================== Parent-side Image Inlining ====================
// FR-17 / US-010: external images must be inlined to data URLs in the PARENT
// before the slide HTML is sent to the sandbox for render/capture. This keeps
// html-to-image capture CORS-clean (no tainted canvas from cross-origin img).
//
// The sandbox never performs network I/O (FR-18); all fetching happens here via
// the extension/UI context's `fetch` (with `crossOrigin: 'anonymous'` semantics).
//
// Inlining is best-effort and non-fatal: any URL that fails to fetch, or that is
// not an external http(s) URL, is left untouched so the slide layout stays intact.

/** True for absolute http(s) URLs (incl. protocol-relative `//host/...`). */
export function isExternalImageUrl(src: string): boolean {
  const trimmed = src.trim();
  return /^https?:\/\//i.test(trimmed) || /^\/\//.test(trimmed);
}

const BASE64_CHUNK = 0x8000;

/** `btoa`-encode an ArrayBuffer/Uint8Array without blowing the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += BASE64_CHUNK) {
    result += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + BASE64_CHUNK)) as number[]);
  }
  return btoa(result);
}

/** Best-effort MIME guess from a URL path extension (used when blob.type is empty). */
export function inferMimeType(url: string): string {
  const noQuery = url.split(/[?#]/)[0] ?? '';
  const ext = noQuery.slice(noQuery.lastIndexOf('.') + 1).toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'svg':
      return 'image/svg+xml';
    case 'bmp':
      return 'image/bmp';
    default:
      return '';
  }
}

/** Convert a Blob to a `data:<mime>;base64,...` string (no FileReader needed). */
export async function blobToDataUrl(
  blob: Blob,
  fallbackMime = '',
): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const mime = blob.type || fallbackMime;
  return `data:${mime || 'application/octet-stream'};base64,${bytesToBase64(buf)}`;
}

export type ImageFetcher = typeof globalThis.fetch;

/** Fetch a single external image URL to a data URL, returning src on any failure. */
export async function inlineImage(
  src: string,
  fetchImpl: ImageFetcher = globalThis.fetch,
): Promise<string> {
  if (!isExternalImageUrl(src)) return src;
  try {
    const res = await fetchImpl(src, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
    });
    if (!res.ok) return src;
    const blob = await res.blob();
    return await blobToDataUrl(blob, inferMimeType(src));
  } catch {
    return src;
  }
}

/** Apply an async replacer to every non-overlapping regex match, rebuilding the string. */
export async function replaceAllAsync(
  text: string,
  regex: RegExp,
  replacer: (match: string) => Promise<string>,
): Promise<string> {
  const matches: Array<{ index: number; original: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ index: m.index, original: m[0] });
    if (m[0].length === 0) regex.lastIndex += 1;
  }
  const replacements = await Promise.all(matches.map((mm) => replacer(mm.original)));
  let result = '';
  let cursor = 0;
  matches.forEach((mm, i) => {
    result += text.slice(cursor, mm.index) + replacements[i];
    cursor = mm.index + mm.original.length;
  });
  return result + text.slice(cursor);
}

/** Match a whole `<img ...>` tag so we can rewrite its src in place. */
const IMG_TAG_RE = /<img\b[^>]*>/gi;
/** `src`, followed by `"` or `'`, then the URL. */
const SRC_ATTR_RE = /src\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
/** CSS `url(...)` with optional surrounding quotes. */
const CSS_URL_RE = /url\(\s*(?:(["'])([\s\S]*?)\1|([^'"()\s]+))\s*\)/gi;

async function inlineImgTag(tag: string, fetchImpl: ImageFetcher): Promise<string> {
  const match = SRC_ATTR_RE.exec(tag);
  const src = match?.[1] ?? match?.[2];
  if (!src || !isExternalImageUrl(src)) return tag;
  const inlined = await inlineImage(src, fetchImpl);
  if (inlined === src) return tag;
  return tag.replace(SRC_ATTR_RE, (_all, _dq, _sq) => `src="${inlined}"`);
}

async function inlineCssUrl(cssUrl: string, fetchImpl: ImageFetcher): Promise<string> {
  const inner = cssUrl.replace(/^url\s*\(/i, '').replace(/\s*\)$/i, '').trim();
  const url = inner.replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
  if (!url || !isExternalImageUrl(url)) return cssUrl;
  const inlined = await inlineImage(url, fetchImpl);
  return inlined === url ? cssUrl : `url("${inlined}")`;
}

export interface InlineImagesOptions {
  /** Custom fetch (injection point for tests / a proxied fetcher). Defaults to global fetch. */
  fetch?: ImageFetcher;
  /** Inline external URLs found inside CSS `url(...)` too. Default true. */
  includeCss?: boolean;
}

/**
 * Rewrite every external `<img src>` (and, by default, `url(...)` in inline
 * style/CSS) in `html` into data URLs. Non-fatal: unreachable or non-external
 * references are left as-is. Runs in the parent context only.
 */
export async function inlineAllImages(
  html: string,
  options: InlineImagesOptions = {},
): Promise<string> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let result = await replaceAllAsync(html, IMG_TAG_RE, (tag) => inlineImgTag(tag, fetchImpl));
  if (options.includeCss !== false) {
    result = await replaceAllAsync(result, CSS_URL_RE, (css) => inlineCssUrl(css, fetchImpl));
  }
  return result;
}
