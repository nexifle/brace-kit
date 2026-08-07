import {
  SLIDE_CANVAS_PRESETS,
  type Slide,
  type SlideCanvas,
  type SlideDeck,
  type SlideFile,
} from '../types/index.ts';


// ==================== Path Rules ====================

/**
 * VFS paths are POSIX-style, rooted at `/`, and must never escape the project.
 * Every mutation goes through {@link safeSlidePath} so a patch cannot read or
 * write outside the deck workspace.
 */

/** Normalize a raw path to a canonical absolute form (`/slides/01.html`). */
export function normalizeSlidePath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return '';
  let p = input.trim();
  if (p.length === 0) return '';
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/[/]+/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Validate a path: root-relative, single leading slash, no blank/`.`/`..`
 * segments, no backslashes or null bytes. The root `/` itself is a directory,
 * never a file, so it is rejected.
 */
export function isValidSlidePath(input: string): boolean {
  const p = normalizeSlidePath(input);
  if (!p || p === '/') return false;
  const segments = p.slice(1).split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') return false;
    if (seg.includes('\\') || seg.includes('\0')) return false;
  }
  return true;
}

/**
 * Return the canonical safe path for `input`, or `null` if the path is
 * invalid / tries to escape the workspace. Never trust a raw model-supplied
 * path without going through this.
 */
export function safeSlidePath(input: string): string | null {
  const p = normalizeSlidePath(input);
  return isValidSlidePath(p) ? p : null;
}

// ==================== Size Caps ====================

/**
 * Max bytes for a single project file. Guards storage quota and keeps tool
 * messages small. Enforced before applying any patch; the limit is 512 KiB.
 */
export const MAX_SLIDE_FILE_BYTES = 512 * 1024;

/**
 * Soft cap on total project VFS size across all files (2 MiB). Exceeding this
 * is not an error for a single write, but project list/hydration cheaply
 * checks it to surface storage pressure.
 */
export const MAX_SLIDE_VFS_BYTES = 2 * 1024 * 1024;

/** True when UTF-8 encoding `content` exceeds the per-file size cap. */
export function isSlideFileOverLimit(content: string): boolean {
  return new TextEncoder().encode(content).byteLength > MAX_SLIDE_FILE_BYTES;
}

// ==================== File Map Helpers ====================

/**
 * Project files are modeled as a `SlideFile[]` on `SlideProject` (persisted).
 * These helpers convert to/from a lookup map and return **new** arrays so
 * immutability is preserved for the Zustand store.
 */
export function slidesToMap(files: SlideFile[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    map.set(safeSlidePath(file.path) ?? file.path, file.content);
  }
  return map;
}

export function slideMapToFiles(map: Map<string, string>): SlideFile[] {
  const files: SlideFile[] = [];
  for (const [path, content] of map) files.push({ path, content });
  return files;
}

export function getSlideFile(files: SlideFile[], path: string): SlideFile | undefined {
  const p = safeSlidePath(path);
  if (!p) return undefined;
  return files.find((f) => f.path === p);
}

/** Insert or replace `path`, returning a new array. Rejects unsafe paths by no-op. */
export function upsertSlideFile(files: SlideFile[], path: string, content: string): SlideFile[] {
  const p = safeSlidePath(path);
  if (!p) return files;
  const next = files.filter((f) => f.path !== p);
  next.push({ path: p, content });
  return next;
}

/** Remove `path`, returning a new array. */
export function removeSlideFile(files: SlideFile[], path: string): SlideFile[] {
  const p = safeSlidePath(path);
  if (!p) return files;
  return files.filter((f) => f.path !== p);
}

// ==================== Deck Projection ====================

export const SLIDE_HTML_EXT = '.html';
export const SLIDE_CSS_EXT = '.css';

/** Canonical slide HTML path for a slide id, e.g. `01` -> `/slides/01.html`. */
export function slideHtmlPath(id: string): string {
  return `/slides/${id}${SLIDE_HTML_EXT}`;
}

export function isSlideCanvas(value: unknown): value is SlideCanvas {
  return typeof value === 'string' && value in SLIDE_CANVAS_PRESETS;
}

/**
 * Rebuild a `SlideDeck` from the on-disk VFS. Reads `/deck.json`, then filters
 * `slideOrder` to ids that actually have a slide HTML file so the UI never
 * renders a ghost slide. Degrades to an empty deck when deck.json is missing
 * or malformed.
 */
export function rebuildDeckProjection(files: SlideFile[]): SlideDeck {
  const map = slidesToMap(files);

  let raw: Partial<SlideDeck> = {};
  const deckJson = map.get('/deck.json');
  if (deckJson) {
    try {
      const parsed = JSON.parse(deckJson);
      if (parsed && typeof parsed === 'object') raw = parsed;
    } catch {
      raw = {};
    }
  }

  const canvas: SlideCanvas | null = isSlideCanvas(raw.canvas) ? raw.canvas : null;


  const slideOrder: string[] = Array.isArray(raw.slideOrder)
    ? raw.slideOrder
        .filter((id): id is string => typeof id === 'string' && Boolean(id))
        .filter((id) => map.has(slideHtmlPath(id)))
    : [];

  const theme =
    typeof raw.theme === 'string' && raw.theme.length > 0
      ? (map.has(raw.theme) ? raw.theme : undefined)
      : undefined;

  return {
    title: typeof raw.title === 'string' ? raw.title : 'Untitled deck',
    description: typeof raw.description === 'string' ? raw.description : undefined,
    canvas,
    theme,
    slideOrder,
  };
}

/** Number of projectable slides (deck.json slideOrder ∩ existing HTML). */
export function deckSlideCount(files: SlideFile[]): number {
  return rebuildDeckProjection(files).slideOrder.length;
}


/**
 * Resolve the ordered `Slide[]` (with html/css paths) that the projection
 * references, skipping ids with no backing HTML file. The deck UI consumes the
 * returned list to render/navigate/export.
 */
export function projectDeckSlides(files: SlideFile[], deck: SlideDeck): Slide[] {
  const map = slidesToMap(files);
  const slides: Slide[] = [];
  for (const id of deck.slideOrder) {
    const htmlPath = slideHtmlPath(id);
    if (!map.has(htmlPath)) continue;
    const cssPath = `/slides/${id}${SLIDE_CSS_EXT}`;
    slides.push({
      id,
      htmlPath,
      cssPath: map.has(cssPath) ? cssPath : undefined,
    });
  }
  return slides;
}

// ==================== Preview Composition (US-021) ====================

/**
 * Compose the full HTML fragment the sandbox preview should render for a single
 * slide: the deck's shared theme CSS plus the slide's own CSS (if any) inlined
 * as `<style>` blocks, followed by the slide's markup. The sandbox sets this as
 * `#stage` innerHTML, so the styles MUST be part of the fragment — there is no
 * separate style-sheet injection across the postMessage boundary.
 *
 * Missing pieces degrade gracefully: no theme -> no shared styles, no slide css
 * -> per-slide styles absent, and a missing backing HTML file -> empty body.
 */
export function composeSlideHtml(files: SlideFile[], slide: Slide, deck: SlideDeck): string {
  const map = slidesToMap(files);
  const styles: string[] = [];
  if (deck.theme) {
    const theme = map.get(deck.theme);
    if (theme) styles.push(theme);
  }
  if (slide.cssPath) {
    const css = map.get(slide.cssPath);
    if (css) styles.push(css);
  }
  const html = map.get(slide.htmlPath) ?? '';
  const blocks = styles
    .map((css) => `<style>\n${css}\n</style>`)
    .join('\n');
  return blocks ? `${blocks}\n${html}` : html;
}
