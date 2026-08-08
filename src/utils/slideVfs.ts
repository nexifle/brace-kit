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
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SLIDE_CANVAS_PRESETS, value)
  );
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

// ==================== Deck.json contract validation ====================

/** A single deck.json contract violation (structural/shape only). */
export interface DeckJsonIssue {
  /** Machine tag, e.g. 'INVALID_CANVAS'. */
  code: string;
  /** Human-readable, model-/user-facing, actionable. */
  message: string;
  /**
   * 'error' = the deck.json is malformed/wrong and the write must be rejected
   * (unknown fields, forbidden aspect, wrong canvas value, bad slideOrder shape).
   * 'warning' = incomplete-but-progressible (missing canvas/slideOrder) that the
   * build agent finalizes later; the write is allowed but surfaced.
   */
  severity: 'error' | 'warning';
}

/** Result of validating /deck.json: valid iff `issues` is empty. */
export interface DeckJsonValidation {
  ok: boolean;
  issues: DeckJsonIssue[];
}

/**
 * Validate `/deck.json` against the deck-file-contract (structural shape only).
 *
 * Checks are deliberately structural — none depend on other VFS files — so they
 * never fire as false positives during the build phase's incremental order
 * where deck.json is planned first and slides are added later. Referential
 * checks (theme path exists, slideOrder ids have backing HTML) are excluded:
 * the projection already degrades those gracefully.
 *
 * Only FORMAT-critical required values are gated as hard errors: `canvas` (must
 * be a colon preset) and `slideOrder` (must be an array of ids). Extra top-level
 * keys and the deprecated `aspect` key are ADVISORY warnings — the projection
 * ignores them, so they never block a write. `title` and `theme` presence is
 * intentionally NOT gated — the projection degrades their absence gracefully
 * ("Untitled deck" / unstyled) and theme-less decks are an accepted, existing
 * behavior.
 */
export function validateDeckJson(files: SlideFile[]): DeckJsonValidation {
  const deckJson = getSlideFile(files, '/deck.json');
  if (!deckJson) {
    return {
      ok: false,
      issues: [
        {
          code: 'MISSING_DECK',
          severity: 'error',
          message: 'deck.json is missing — create it with title, canvas, theme, and slideOrder.',
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(deckJson.content);
  } catch {
    return {
      ok: false,
      issues: [{ code: 'INVALID_JSON', severity: 'error', message: 'deck.json is not valid JSON.' }],
    };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      issues: [{ code: 'NOT_OBJECT', severity: 'error', message: 'deck.json must be a JSON object.' }],
    };
  }

  const issues: DeckJsonIssue[] = [];
  const obj = parsed as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(obj, 'aspect')) {
    issues.push({
      code: 'ASPECT_FORBIDDEN',
      // Advisory only: the projection ignores `aspect`. Extra keys are allowed
      // as long as the required values are correct — never a hard rejection.
      severity: 'warning',
      message:
        "The 'aspect' key is ignored — model the ratio with the 'canvas' preset key and remove 'aspect'.",
    });
  }
  // The contract names these keys, but the agent MAY add more top-level fields
  // (the projection ignores unknown keys) as long as the required values are
  // correct. Unknown keys are advisory, never a hard rejection.
  const allowed = new Set(['title', 'description', 'canvas', 'theme', 'slideOrder']);
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k) && k !== 'aspect');
  if (unknown.length > 0) {
    issues.push({
      code: 'UNKNOWN_FIELD',
      severity: 'warning',
      message: `deck.json has extra fields the projection ignores: ${unknown.join(', ')}. Keep the required title, description, canvas, theme, slideOrder correct.`,
    });
  }
  if (!isSlideCanvas(obj.canvas)) {
    const hasCanvas = obj.canvas !== undefined;
    issues.push({
      code: 'INVALID_CANVAS',
      // Present-but-wrong canvas is a hard error; a missing canvas is a warning
      // (the projection degrades to 16:9 and the agent may set it later).
      severity: hasCanvas ? 'error' : 'warning',
      message: hasCanvas
        ? `canvas must be one of '16:9','4:5','9:16','1:1' (got ${JSON.stringify(obj.canvas)}).`
        : "canvas is required and must be one of '16:9','4:5','9:16','1:1'.",
    });
  }
  if (!Array.isArray(obj.slideOrder)) {
    issues.push({
      code: 'INVALID_SLIDE_ORDER',
      // Present-but-not-an-array is a hard error; a missing slideOrder is a warning
      // (the build agent writes the full order when it finalizes the deck).
      severity: obj.slideOrder !== undefined ? 'error' : 'warning',
      message: "slideOrder is required and must be an array of slide ids (e.g. ['01','02']).",
    });
  } else {
    const bad = obj.slideOrder.some((id) => typeof id !== 'string' || id.length === 0);
    if (bad) {
      issues.push({
        code: 'INVALID_SLIDE_ORDER_ENTRY',
        severity: 'error',
        message: "slideOrder entries must be non-empty strings (e.g. '01').",
      });
    }
  }
  // `theme` must be an absolute file path (e.g. `/theme.css`) that the
  // projection can resolve against the VFS — never a bare token like `"dark"`.
  // A MISSING theme stays valid (unstyled deck degrades gracefully); a PRESENT
  // but non-path theme is a hard contract violation (build/projection can't
  // consume it). This gate stops a plan phase from landing a deck.json the
  // build phase would reject.
  if (
    obj.theme !== undefined &&
    (typeof obj.theme !== 'string' ||
      obj.theme.length === 0 ||
      !obj.theme.startsWith('/'))
  ) {
    issues.push({
      code: 'INVALID_THEME',
      severity: 'error',
      message: `theme must be an absolute file path like '/theme.css' (got ${JSON.stringify(obj.theme)}).`,
    });
  }

  return { ok: issues.length === 0, issues };
}

/** True when any issue is a hard (blocking) contract violation. */
export function hasHardDeckJsonErrors(validation: DeckJsonValidation): boolean {
  return validation.issues.some((i) => i.severity === 'error');
}

/** Join issues into a short bullet block, e.g. "- canvas: must be one of ...". */
export function formatDeckJsonIssues(issues: DeckJsonIssue[]): string {
  return issues.map((i) => `- ${i.message}`).join('\n');
}

/**
 * Deterministic post-build/edit self-check that a deck is renderable (Phase 1
 * verification loop). Complements {@link validateDeckJson} by adding the
 * referential checks the validator deliberately excludes: dangling slideOrder
 * ids (no backing HTML), forbidden slide JavaScript, and a missing theme or
 * per-slide CSS.
 *
 * Hard issues set `ok:false` and drive the corrective round. Per-slide CSS and
 * theme are SOFT warnings only — the projection and {@link composeSlideHtml}
 * already degrade their absence gracefully (unstyled but renderable), so they
 * never flip `ok`. A dangling id (slide with no HTML at all), zero slides,
 * slide JavaScript, or a deck.json hard violation is hard.
 */
export function verifyDeck(files: SlideFile[]): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  let hard = false;
  const map = slidesToMap(files);

  // 1. deck.json contract — hard violations are authoritative.
  const v = validateDeckJson(files);
  const deckHard = v.issues.filter((i) => i.severity === 'error');
  if (deckHard.length > 0) {
    hard = true;
    issues.push('deck.json contract violations:\n' + formatDeckJsonIssues(deckHard));
  }

  // Raw slideOrder + theme from deck.json (NOT the ghost-filtered projection).
  let slideOrder: string[] = [];
  let theme: string | undefined;
  const deckJson = map.get('/deck.json');
  if (deckJson) {
    try {
      const parsed = JSON.parse(deckJson) as { slideOrder?: unknown; theme?: unknown };
      if (Array.isArray(parsed?.slideOrder)) {
        slideOrder = parsed.slideOrder.filter(
          (id): id is string => typeof id === 'string' && Boolean(id),
        );
      }
      if (typeof parsed?.theme === 'string') theme = parsed.theme;
    } catch {
      // INVALID_JSON already reported by validateDeckJson.
    }
  }

  // 2. At least one slide.
  if (slideOrder.length === 0) {
    hard = true;
    issues.push('deck.json slideOrder is empty — a renderable deck needs at least one slide.');
  }

  // 3. No dangling ids (missing HTML is hard), and no slide JavaScript.
  for (const id of slideOrder) {
    const htmlPath = slideHtmlPath(id);
    const cssPath = `/slides/${id}${SLIDE_CSS_EXT}`;
    if (!map.has(htmlPath)) {
      hard = true;
      issues.push(`Slide ${id} is in slideOrder but has no HTML at ${htmlPath}.`);
    }
    if (!map.has(cssPath)) {
      issues.push(`Slide ${id} is in slideOrder but has no CSS at ${cssPath}.`);
    }
    const html = map.get(htmlPath);
    if (html && html.includes('<script')) {
      hard = true;
      issues.push(`Slide ${id} contains a <script> tag — slide JavaScript is forbidden.`);
    }
  }

  // 4. Soft: theme referenced by deck.json must exist.
  if (theme && !map.has(theme)) {
    issues.push(`deck.json theme references ${theme}, which is missing.`);
  }

  return { ok: !hard, issues };
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
