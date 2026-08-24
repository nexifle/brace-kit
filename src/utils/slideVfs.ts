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

// ==================== Deck.json code ownership ====================

/** Meta overrides for {@link syncDeckJson}; an omitted key preserves the current value. */
export interface DeckMeta {
  /** Override title. Omit to preserve the existing deck.json title (default 'Untitled deck'). */
  title?: string;
  /** Override canvas. Omit to preserve the existing deck.json canvas. */
  canvas?: SlideCanvas;
  /** Override description. Omit to preserve the existing deck.json description. */
  description?: string;
}

/** Ids of every existing slide HTML file (basename minus `.html`), flat paths only. */
export function collectSlideIds(files: SlideFile[]): string[] {
  const map = slidesToMap(files);
  const ids: string[] = [];
  for (const path of map.keys()) {
    if (!path.startsWith('/slides/') || !path.endsWith(SLIDE_HTML_EXT)) continue;
    const id = path.slice('/slides/'.length, -SLIDE_HTML_EXT.length);
    if (id.length === 0 || id.includes('/')) continue;
    ids.push(id);
  }
  return ids;
}

/**
 * Numeric-aware string compare (natsort): maximal digit-runs compare as numbers,
 * non-digit runs as strings, and a number sorts before a string on a mismatch.
 * Gives `01 < 02 < 10` and `step-1 < step-2 < step-10`.
 */
export function naturalCompare(a: string, b: string): number {
  const tokenize = (s: string): string[] => Array.from(s.match(/\d+|\D+/g) ?? [s]);
  const at = tokenize(a);
  const bt = tokenize(b);
  const len = Math.max(at.length, bt.length);
  for (let i = 0; i < len; i++) {
    const x = at[i];
    const y = bt[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xn = /^\d+$/.test(x) ? Number(x) : Number.NaN;
    const yn = /^\d+$/.test(y) ? Number(y) : Number.NaN;
    if (!Number.isNaN(xn) && !Number.isNaN(yn)) {
      if (xn !== yn) return xn - yn;
    } else if (!Number.isNaN(xn)) {
      return -1; // number sorts before string
    } else if (!Number.isNaN(yn)) {
      return 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

// ==================== Reorder ====================

/** Result of {@link reorderSlideFiles}: reordered files, or a recover error. */
export interface ReorderSlidesResult {
  ok: boolean;
  error?: string;
  /** New files array when ok; the input array is never mutated. */
  files?: SlideFile[];
  /** Slides whose id actually changed (old id → new id), html-canonical. */
  renames?: Array<{ from: string; to: string }>;
}

/**
 * Split a slide basename (or `/slides/…` tail) into its id + extension when it
 * is a slide file. Ids may contain dots (`foo.bar.html` → id `foo.bar`) but
 * never a slash — mirroring {@link collectSlideIds}. Returns null for non-slide
 * files.
 */
function slideIdAndExt(basename: string): { id: string; ext: string } | null {
  for (const ext of [SLIDE_HTML_EXT, SLIDE_CSS_EXT]) {
    if (basename.endsWith(ext)) {
      const id = basename.slice(0, -ext.length);
      if (id.length > 0 && !id.includes('/')) return { id, ext };
    }
  }
  return null;
}

/**
 * Renumber slide files so their natural-sorted ids match `order` (the current
 * ids in the desired final sequence). Target ids are sequential zero-padded
 * (`01`, `02`, … `10`, `11`, …) matching the build/edit skills convention. This
 * is how a mid-deck insert / reorder is done WITHOUT deleting and recreating
 * slides: files are renamed in place, so content is preserved by construction.
 *
 * Every slide `.html`/`.css` is first staged to a unique temp path (vacating
 * its original path), then written to its final path — so a bijection like
 * `03→04` while `04→05` never clobbers an in-flight value, and an orphan `.css`
 * (no matching `.html`) never blocks a slide renamed onto its path. Slide
 * renames always win; an orphan is preserved only when no slide claims its
 * path. Non-slide files (`/theme.css`, `/deck.json`, `/brief.md`,
 * `/design.md`) are left untouched. Returns a new array; never mutates
 * `files`.
 */
export function reorderSlideFiles(
  files: SlideFile[],
  order: unknown,
): ReorderSlidesResult {
  const currentIds = collectSlideIds(files);

  if (!Array.isArray(order) || order.length === 0) {
    return {
      ok: false,
      error: `Error: reorder_slides requires a non-empty "order" array of current slide ids. Current ids: [${currentIds.join(', ')}]`,
    };
  }
  if (order.some((id) => typeof id !== 'string' || id.length === 0)) {
    return {
      ok: false,
      error: `Error: reorder_slides "order" must contain only non-empty string ids. Current ids: [${currentIds.join(', ')}]`,
    };
  }

  const orderSet = new Set(order);
  const currentSet = new Set(currentIds);
  if (orderSet.size !== order.length) {
    return {
      ok: false,
      error: `Error: reorder_slides "order" contains duplicate ids. Current ids: [${currentIds.join(', ')}]`,
    };
  }
  const missing = currentIds.filter((id) => !orderSet.has(id));
  const extra = order.filter((id) => !currentSet.has(id));
  if (missing.length > 0 || extra.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`missing ${missing.join(', ')}`);
    if (extra.length > 0) parts.push(`unknown ${extra.join(', ')}`);
    return {
      ok: false,
      error: `Error: reorder_slides "order" must be a permutation of current slide ids (${parts.join('; ')}). Current ids: [${currentIds.join(', ')}]`,
    };
  }

  // Target ids: sequential zero-padded to the width of the deck size.
  const width = Math.max(2, String(order.length).length);
  const newIdFor = new Map<string, string>();
  order.forEach((id, i) => newIdFor.set(id, String(i + 1).padStart(width, '0')));

  // Phase 1: stage every slide html/css to a unique temp path, vacating all
  // original slide paths so no in-flight value is clobbered. Non-slide files
  // pass through untouched.
  const map = slidesToMap(files);
  const tempPrefix = '/slides/.reorder-tmp-';
  const staged = new Map<string, string>();
  for (const [path, content] of map) {
    const basename = path.startsWith('/slides/') ? path.slice('/slides/'.length) : path;
    const parsed = slideIdAndExt(basename);
    if (!parsed) {
      staged.set(path, content);
      continue;
    }
    staged.set(`${tempPrefix}${parsed.id}${parsed.ext}`, content);
  }

  // Phase 2a: place slide renames at their final paths (slides always win their
  // target path over an orphan). Record html slides whose id changed.
  const resultMap = new Map<string, string>();
  const renames: Array<{ from: string; to: string }> = [];
  for (const [path, content] of staged) {
    if (!path.startsWith(tempPrefix)) continue;
    const parsed = slideIdAndExt(path.slice(tempPrefix.length));
    if (!parsed) continue;
    const newId = newIdFor.get(parsed.id);
    if (newId === undefined) continue; // orphan — restored in phase 2b
    resultMap.set(`/slides/${newId}${parsed.ext}`, content);
    if (parsed.ext === SLIDE_HTML_EXT && parsed.id !== newId) {
      renames.push({ from: parsed.id, to: newId });
    }
  }

  // Phase 2b: restore non-slide files and orphan slide files — an orphan keeps
  // its original path only when no slide rename claimed it.
  for (const [path, content] of staged) {
    if (!path.startsWith(tempPrefix)) {
      resultMap.set(path, content);
      continue;
    }
    const parsed = slideIdAndExt(path.slice(tempPrefix.length));
    if (!parsed) continue;
    const newId = newIdFor.get(parsed.id);
    if (newId !== undefined) continue; // already placed in 2a
    const original = `/slides/${parsed.id}${parsed.ext}`;
    if (!resultMap.has(original)) resultMap.set(original, content);
  }

  return { ok: true, files: slideMapToFiles(resultMap), renames };
}

/**
 * Regenerate `/deck.json` deterministically from the actual VFS slide files.
 * `slideOrder` = natural-sorted ids of every `/slides/*.html` (a slide's id is its
 * basename minus `.html` — same round-trip {@link slideHtmlPath} uses, so ANY
 * basename the agent chooses is a valid id); `theme` = `/theme.css` when present;
 * `title`/`canvas`/`description` come from `meta` when given, else are preserved
 * from the current deck.json (defaults when absent or unparseable). Always emits
 * valid JSON — a malformed or legacy hand-written deck.json self-heals. Returns a
 * new array; never mutates `files`.
 */
export function syncDeckJson(files: SlideFile[], meta?: DeckMeta): SlideFile[] {
  const map = slidesToMap(files);

  const slideOrder = collectSlideIds(files).sort(naturalCompare);

  let current: Record<string, unknown> = {};
  const deckJson = map.get('/deck.json');
  if (deckJson) {
    try {
      const p: unknown = JSON.parse(deckJson);
      if (p && typeof p === 'object' && !Array.isArray(p)) current = p as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const title =
    meta?.title ?? (typeof current.title === 'string' && current.title.length > 0
      ? current.title
      : 'Untitled deck');
  const description =
    meta?.description ??
    (typeof current.description === 'string' && current.description.length > 0
      ? current.description
      : undefined);
  const canvas = meta?.canvas ?? (isSlideCanvas(current.canvas) ? current.canvas : undefined);
  const theme = map.has('/theme.css') ? '/theme.css' : undefined;

  const deck: Record<string, unknown> = { title, slideOrder };
  if (description !== undefined) deck.description = description;
  if (canvas !== undefined) deck.canvas = canvas;
  if (theme !== undefined) deck.theme = theme;

  return upsertSlideFile(files, '/deck.json', JSON.stringify(deck, null, 2));
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
  const html = rewriteUploadSrcs(map.get(slide.htmlPath) ?? '', files);
  const blocks = styles
    .map((css) => `<style>\n${rewriteUploadSrcs(css, files)}\n</style>`)
    .join('\n');
  return blocks ? `${blocks}\n${html}` : html;
}

/**
 * Inline `/uploads/…` src/href/url() references to the stored file contents
 * (data URLs for images) so sandbox innerHTML can display user attachments.
 */
export function rewriteUploadSrcs(html: string, files: SlideFile[]): string {
  const prefix = '/uploads/';
  const map = new Map<string, string>();
  for (const f of files) {
    const p = safeSlidePath(f.path) ?? f.path;
    if (p.startsWith(prefix) && p.length > prefix.length) map.set(p, f.content);
  }
  if (map.size === 0) return html;

  let out = html;
  for (const [path, content] of map) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attrRe = new RegExp(`((?:src|href)\\s*=\\s*)(['"])${escaped}\\2`, 'gi');
    out = out.replace(attrRe, (_m, prefixAttr: string, quote: string) => `${prefixAttr}${quote}${content}${quote}`);
    const urlRe = new RegExp(`url\\(\\s*(['"]?)${escaped}\\1\\s*\\)`, 'gi');
    out = out.replace(urlRe, (_m, quote: string) => `url(${quote}${content}${quote})`);
  }
  return out;
}
