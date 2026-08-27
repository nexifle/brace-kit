import type { BuilderKind, SiteManifest, SitePage, SlideFile } from '../types/slides.ts';
import { isWebBuilderKind, normalizeBuilderKind } from '../types/slides.ts';
import {
  getSlideFile,
  safeSlidePath,
  slidesToMap,
  upsertSlideFile,
} from './slideVfs.ts';

export const SITE_JSON_PATH = '/site.json';
export const PAGES_PREFIX = '/pages/';
export const LAYOUTS_PREFIX = '/layouts/';
export const SCRIPTS_PREFIX = '/scripts/';

export function projectKind(project: { kind?: unknown }): BuilderKind {
  return normalizeBuilderKind(project.kind);
}

function slugFromHtmlPath(htmlPath: string): string {
  const base = htmlPath.replace(/^\/pages\//, '').replace(/\.html$/i, '');
  return base || 'index';
}

function urlPathFromSlug(slug: string): string {
  if (slug === 'index' || slug === 'home') return '/';
  return `/${slug.replace(/^\/+/, '')}`;
}

/** Web analog of verifyDeck: at least one `/pages/*.html`. */
export function verifySite(files: SlideFile[]): { ok: boolean; issues: string[] } {
  const n = collectPageHtmlPaths(files).length;
  if (n > 0) return { ok: true, issues: [] };
  return {
    ok: false,
    issues: ['No /pages/*.html files — a site needs at least one page.'],
  };
}

export function collectPageHtmlPaths(files: SlideFile[]): string[] {
  return files
    .map((f) => f.path)
    .filter((p) => p.startsWith(PAGES_PREFIX) && p.endsWith('.html'))
    .sort();
}

export function parseSiteJson(content: string | undefined): Partial<SiteManifest> | null {
  if (!content) return null;
  try {
    const p: unknown = JSON.parse(content);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    return p as Partial<SiteManifest>;
  } catch {
    return null;
  }
}

export function rebuildSiteProjection(
  files: SlideFile[],
  _kind: BuilderKind = 'site',
): SiteManifest {
  const webKind = 'site' as const;
  const raw = parseSiteJson(getSlideFile(files, SITE_JSON_PATH)?.content);
  const htmlPaths = collectPageHtmlPaths(files);
  const fromDisk: SitePage[] = htmlPaths.map((htmlPath) => {
    const id = slugFromHtmlPath(htmlPath);
    return { id, path: urlPathFromSlug(id), htmlPath };
  });

  let pages: SitePage[] = [];
  if (raw?.pages && Array.isArray(raw.pages) && raw.pages.length > 0) {
    const byPath = new Map(fromDisk.map((p) => [p.htmlPath, p]));
    pages = raw.pages
      .filter((p): p is SitePage => !!p && typeof p === 'object' && typeof p.htmlPath === 'string')
      .map((p) => {
        const disk = byPath.get(p.htmlPath);
        return {
          id: typeof p.id === 'string' ? p.id : disk?.id ?? slugFromHtmlPath(p.htmlPath),
          path: typeof p.path === 'string' ? p.path : disk?.path ?? '/',
          htmlPath: p.htmlPath,
          title: typeof p.title === 'string' ? p.title : undefined,
        };
      });
    for (const disk of fromDisk) {
      if (!pages.some((p) => p.htmlPath === disk.htmlPath)) pages.push(disk);
    }
  } else {
    pages = fromDisk;
  }

  const theme = files.some((f) => f.path === '/theme.css') ? '/theme.css' : raw?.theme;
  const layout = files.some((f) => f.path === '/layouts/base.html')
    ? '/layouts/base.html'
    : typeof raw?.layout === 'string'
      ? raw.layout
      : undefined;
  const scripts = files
    .map((f) => f.path)
    .filter((p) => p.startsWith(SCRIPTS_PREFIX) && p.endsWith('.js'));

  const title =
    typeof raw?.title === 'string' && raw.title.length > 0
      ? raw.title
      : 'Untitled site';
  const home =
    typeof raw?.home === 'string' && raw.home.length > 0
      ? raw.home
      : pages[0]?.htmlPath ?? '/pages/index.html';

  return {
    kind: webKind,
    title,
    home,
    pages,
    ...(layout ? { layout } : {}),
    ...(theme ? { theme } : {}),
    ...(scripts.length > 0 ? { scripts } : {}),
  };
}

export function syncSiteJson(files: SlideFile[], kind: BuilderKind, title?: string): SlideFile[] {
  if (!isWebBuilderKind(kind)) return files;
  const site = rebuildSiteProjection(files, kind);
  if (title) site.title = title;
  return upsertSlideFile(files, SITE_JSON_PATH, JSON.stringify(site, null, 2));
}

/** Wrap page HTML with theme, layout, and VFS scripts for document-mode preview. */
export function composePageHtml(files: SlideFile[], page: SitePage, site: SiteManifest): string {
  const pageFile = getSlideFile(files, page.htmlPath);
  let body = pageFile?.content ?? `<p>Missing ${page.htmlPath}</p>`;

  const layoutPath = site.layout;
  if (layoutPath) {
    const layout = getSlideFile(files, layoutPath)?.content;
    if (layout && layout.includes('{{content}}')) {
      body = layout.replace('{{content}}', body);
    } else if (layout && !/^\s*</.test(body)) {
      body = layout + body;
    }
  }

  const isFullDoc = /<html[\s>]/i.test(body);
  const theme = site.theme ? getSlideFile(files, site.theme)?.content ?? '' : '';
  const themeTag = theme ? `<style data-builder-theme>\n${theme}\n</style>` : '';

  const scriptTags: string[] = [];
  for (const path of site.scripts ?? []) {
    const js = getSlideFile(files, path)?.content;
    if (!js) continue;
    scriptTags.push(`<script data-builder-script="${path}">\n${js}\n</script>`);
  }

  if (isFullDoc) {
    let html = body;
    if (themeTag) {
      html = html.replace(/<\/head>/i, `${themeTag}</head>`);
      if (!/<\/head>/i.test(html)) html = themeTag + html;
    }
    if (scriptTags.length) {
      html = html.replace(/<\/body>/i, `${scriptTags.join('\n')}</body>`);
      if (!/<\/body>/i.test(html)) html += scriptTags.join('\n');
    }
    return html;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(page.title || site.title)}</title>
  ${themeTag}
</head>
<body>
${body}
${scriptTags.join('\n')}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function rewriteVfsUrls(html: string, files: SlideFile[]): string {
  return html.replace(
    /(?:src|href)=["'](\/[^"']+)["']/gi,
    (full, path: string) => {
      const safe = safeSlidePath(path);
      if (!safe) return full;
      const file = getSlideFile(files, safe);
      if (!file) return full;
      if (safe.endsWith('.css')) {
        return full.replace(path, `data:text/css;base64,${btoa(file.content)}`);
      }
      if (safe.endsWith('.js')) {
        return full.replace(path, `data:text/javascript;base64,${btoa(unescape(encodeURIComponent(file.content)))}`);
      }
      return full;
    },
  );
}

export function filesForSiteZip(files: SlideFile[]): SlideFile[] {
  const keep = files.filter((f) => {
    const p = f.path;
    return (
      p.startsWith(PAGES_PREFIX) ||
      p.startsWith(LAYOUTS_PREFIX) ||
      p.startsWith(SCRIPTS_PREFIX) ||
      p === '/theme.css' ||
      p === SITE_JSON_PATH ||
      p.startsWith('/uploads/')
    );
  });
  return keep;
}

export { slidesToMap };
