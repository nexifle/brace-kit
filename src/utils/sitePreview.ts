import type { BuilderKind, SlideFile } from '../types/slides.ts';
import { isWebBuilderKind, normalizeBuilderKind } from '../types/slides.ts';
import { composePageHtml, rebuildSiteProjection } from './siteVfs.ts';

export const SITE_PREVIEW_PAGE = 'site-preview.html';

/** Relative extension path + query for the full-page site preview tab. */
export function sitePreviewPath(projectId: string, pagePath: string): string {
  const q = new URLSearchParams({ project: projectId, page: pagePath });
  return `${SITE_PREVIEW_PAGE}?${q.toString()}`;
}

export function parseSitePreviewSearch(
  search: string,
): { projectId: string; pagePath: string } | null {
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const projectId = params.get('project')?.trim() ?? '';
  if (!projectId) return null;
  const pagePath = params.get('page')?.trim() || '/';
  return { projectId, pagePath };
}

const SKIP_HREF_RE = /^(javascript:|mailto:|tel:|https?:|\/\/|#)/i;

/** Normalize a site page path: strip query/hash, collapse trailing slash except `/`. */
export function normalizeSitePagePath(path: string): string {
  const trimmed = path.trim();
  const noHash = trimmed.split('#')[0] ?? trimmed;
  const noQuery = noHash.split('?')[0] ?? noHash;
  if (!noQuery || noQuery === '/') return '/';
  return noQuery.replace(/\/+$/, '') || '/';
}

/** Fragment id from `#overview` or `/plants#overview`, or null. */
export function sitePreviewHash(href: string): string | null {
  const hashIndex = href.indexOf('#');
  if (hashIndex < 0) return null;
  const raw = href.slice(hashIndex + 1);
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function isHashOnlyHref(href: string): boolean {
  return href.trim().startsWith('#');
}

/**
 * Map an `<a href>` from preview HTML to a virtual site path, or null to
 * leave the click to the browser (external, hash-only, javascript:, etc.).
 */
export function resolveSitePreviewHref(
  href: string,
  currentPagePath: string,
): string | null {
  const raw = href.trim();
  if (!raw || SKIP_HREF_RE.test(raw)) return null;

  let pathname: string;
  if (raw.startsWith('/')) {
    pathname = raw;
  } else {
    const base = normalizeSitePagePath(currentPagePath);
    const dir = base === '/' ? '/' : `${base}/`;
    try {
      pathname = new URL(raw, `https://preview.local${dir}`).pathname;
    } catch {
      return null;
    }
  }
  return normalizeSitePagePath(pathname);
}

export function matchSitePageIndex(
  pages: { path: string; htmlPath: string }[],
  requested: string,
): number {
  const want = normalizeSitePagePath(requested);
  const byPath = pages.findIndex((p) => normalizeSitePagePath(p.path) === want);
  if (byPath >= 0) return byPath;
  return pages.findIndex((p) => normalizeSitePagePath(p.htmlPath) === want);
}

/**
 * Preview srcdoc is an opaque nested sandbox (manifest CSP has no
 * allow-same-origin), so the frame cannot attach click listeners via
 * contentDocument. Inject a script that postMessages navigate to parent.
 */
export function withSitePreviewNavInterceptor(html: string, pagePath: string): string {
  const pathJson = JSON.stringify(pagePath);
  const script = `<script data-bk-preview-nav>
(function () {
  var currentPagePath = ${pathJson};
  function skipHref(href) {
    return !href || /^(javascript:|mailto:|tel:|https?:|\\/\\/)/i.test(href);
  }
  function normalize(path) {
    var noHash = String(path).split("#")[0];
    var noQuery = noHash.split("?")[0].trim();
    if (!noQuery || noQuery === "/") return "/";
    return noQuery.replace(/\\/+$/, "") || "/";
  }
  function resolve(href, current) {
    var raw = String(href || "").trim();
    if (skipHref(raw) || raw.charAt(0) === "#") return null;
    var pathname;
    if (raw.charAt(0) === "/") pathname = raw;
    else {
      var base = normalize(current);
      var dir = base === "/" ? "/" : base + "/";
      try { pathname = new URL(raw, "https://preview.local" + dir).pathname; }
      catch (e) { return null; }
    }
    return normalize(pathname);
  }
  function scrollToHash(hash) {
    if (!hash) return;
    var id = hash;
    try { id = decodeURIComponent(hash); } catch (e) {}
    var target = document.getElementById(id) || document.getElementsByName(id)[0];
    if (target && target.scrollIntoView) target.scrollIntoView();
  }
  function stop(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }
  function intercept(e) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target;
    if (!el || !el.closest) return;
    var a = el.closest("a");
    if (!a) return;
    var stored = a.getAttribute("data-bk-preview-path");
    if (stored) {
      stop(e);
      parent.postMessage({ type: "navigate", path: stored, fromSitePreview: true }, "*");
      return;
    }
    var href = a.getAttribute("href") || "";
    var hashAttr = a.getAttribute("data-bk-preview-hash");
    if (hashAttr || href.charAt(0) === "#") {
      stop(e);
      scrollToHash(hashAttr || href.slice(1));
      return;
    }
    var path = resolve(href, currentPagePath);
    if (!path) return;
    stop(e);
    parent.postMessage({ type: "navigate", path: path, fromSitePreview: true }, "*");
  }
  function rewrite() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.getAttribute("data-bk-preview-path") || a.getAttribute("data-bk-preview-hash")) continue;
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) === "#" && href.length > 1) {
        a.setAttribute("data-bk-preview-hash", href.slice(1));
        a.setAttribute("href", "#");
        continue;
      }
      var path = resolve(href, currentPagePath);
      if (!path) continue;
      a.setAttribute("data-bk-preview-path", path);
      a.setAttribute("href", "#");
    }
  }
  document.addEventListener("click", intercept, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", rewrite);
  } else {
    rewrite();
  }
})();
</script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${script}</body>`);
  return html + script;
}

export function composeSitePreviewDocument(
  files: SlideFile[],
  kind: BuilderKind | undefined,
  pagePath: string,
): { html: string; title: string } | null {
  const normalized = normalizeBuilderKind(kind);
  if (!isWebBuilderKind(normalized)) return null;
  const site = rebuildSiteProjection(files, normalized);
  const pages = site.pages.filter((p) => files.some((f) => f.path === p.htmlPath));
  if (pages.length === 0) return null;
  const page =
    pages.find((p) => p.path === pagePath) ??
    pages.find((p) => p.path === '/') ??
    pages.find((p) => p.htmlPath === site.home) ??
    pages[0];
  return {
    html: composePageHtml(files, page, site),
    title: page.title || site.title,
  };
}
