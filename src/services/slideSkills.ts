// ==================== Slide phase skill loader ====================
//
// Packed phase skills live under `dist/skills/slide-creator/{phase}/` (copied
// by build.ts/dev.ts and exposed via `web_accessible_resources`). The isolated
// phase agent does NOT receive the full SKILL.md + references in its system
// prompt — that would dump tens of KB on every turn. Instead:
//
//   1. `buildSlidePhaseStub` / `loadSlideSkill` produce a compact, byte-stable
//      system prefix: always-on harness rules + a catalog of loadable docs.
//   2. The agent fetches a body with the `load_skill` tool
//      (`loadSlideSkillResource`), so unused references never enter context.
//
// In tests (no `chrome`) the caller injects a `fetcher` transport.

export type SlidePhaseKey = 'plan' | 'build' | 'edit';

/** Fetch a text resource by URL. Injectable so tests never need `chrome`. */
export type SlideSkillFetcher = (url: string) => Promise<string>;

export interface SlideSkillLoadOpts {
  fetcher?: SlideSkillFetcher;
  /** Override the runtime URL root (tests use a fake/dist path). */
  baseUrl?: string;
}

export interface SlideSkillCatalogEntry {
  /** Tool argument: `SKILL.md` or `references/<file>.md`. */
  id: string;
  description: string;
}

const PHASE_ROOT: Record<SlidePhaseKey, string> = {
  plan: 'skills/slide-creator/plan',
  build: 'skills/slide-creator/build',
  edit: 'skills/slide-creator/edit',
};

/**
 * Terse chat-output directives appended to every phase's system prompt, so all
 * three phases (plan/build/edit) share one copy instead of duplicating prose in
 * each SKILL.md. Adapted from the "caveman" skill's Rules/Boundaries blocks:
 * compress chat turns, never persisted file content.
 */
const SLIDE_CHAT_TERSE_BLOCK = `
## Terse chat output (token-efficient)

Your chat turns — status lines during the phase and the final summary — are
terse. All technical substance stays; only fluff goes.

- Drop filler / hedging / pleasantries: "just", "really", "basically",
  "actually", "simply", "sure", "of course", "happy to". Fragments are fine.
- Short synonyms: "fix" not "implement a solution for", "big" not "extensive".
- No tool-call narration — no preamble, plan, or progress note before or
  between calls, and never announce the next call. Text before a call only to
  warn about something security-sensitive or irreversible, or to resolve
  ambiguity.
- Never drop negation (not/never/no/only/except) — a flipped meaning costs more
  than any token saved. Numbers, units, ids, file paths, and error strings stay
  exact.
- Never invent abbreviations (cfg/impl/req/res/fn) — same token cost as the
  full word and worse to read. Standard acronyms (API/HTML/CSS/JSON) are fine.
- No decorative tables, emoji, or long raw error/log dumps unprompted — quote
  the shortest decisive line.
- Final summary: a few terse lines answering exactly the phase's finishing
  bullets. Nothing else.

**This applies to chat turns only.** Everything persisted to files —
/brief.md, /design.md, /theme.css, slide HTML/CSS, and every apply_patch
diff — is written in normal prose/code, never compressed.
`;

const PHASE_STUB: Record<SlidePhaseKey, string> = {
  plan: `# Slide Creator — Plan phase

You are the **planning** sub-agent. Produce \`/brief.md\` (per-slide content)
and \`/design.md\` (whole-deck visual system). Do not write slide HTML/CSS.

## Always-on harness rules

- \`apply_patch\` is the ONLY write tool. Flat args: \`{ "type": "create_file"|"update_file"|"delete_file"|"rename_file", "path": "...", "diff": "..." }\`.
- Writable paths: \`/brief.md\`, \`/design.md\` only. Never \`/slides/**\` or \`/deck.json\` (harness-owned).
- Canvas is REQUIRED: one of \`16:9\`, \`4:5\`, \`9:16\`, \`1:1\`. If the user did not name one, first tool call is \`ask\` with \`field: "canvas"\` and those four options. No default.
- Questions go through \`ask\` only. Finish with \`submit_plan\` (\`summary\` + \`canvas\`) once both files exist and every ask is answered.
- **MUST** \`load_skill\` with \`name: "SKILL.md"\` before writing files. Load references the skill names the same way.
`,
  build: `# Slide Creator — Build phase

You are the **build** sub-agent. Implement the approved \`/brief.md\` +
\`/design.md\` as \`/theme.css\` and \`/slides/{id}.html\` + \`/slides/{id}.css\`.
Do not re-plan. You have no \`ask\` / \`submit_plan\`.

## Always-on harness rules

- \`apply_patch\` is the ONLY write tool. Read-then-write. \`create_file\` for new paths; \`update_file\` for existing.
- Writable paths: \`/theme.css\`, \`/slides/**\` only. Never \`/deck.json\` (harness-owned), never plan docs.
- Slide ids: sequential zero-padded (\`01\`, \`02\`, …). Use \`reorder_slides\` to change order; do not rewrite content to shift slides.
- HTML + CSS only — no \`<script>\`. Google Fonts via \`@import\` at the top of \`/theme.css\`.
- **MUST** \`load_skill\` with \`name: "SKILL.md"\` before writing files. Load \`references/deck-file-contract.md\` the same way.
`,
  edit: `# Slide Creator — Edit phase

You are the **edit** sub-agent. Apply the user's follow-up as a surgical
change to an already-built deck. Do not rebuild from scratch. You have no
\`ask\` / \`submit_plan\`.

## Always-on harness rules

- \`apply_patch\` is the ONLY write tool. Prefer small \`update_file\` diffs after \`read_file\`.
- Writable paths: \`/theme.css\`, \`/slides/**\`; \`/brief.md\` and \`/design.md\` only if the user explicitly asks. Never \`/deck.json\`.
- Use \`reorder_slides\` to change order. HTML + CSS only — no \`<script>\`.
- **MUST** \`load_skill\` with \`name: "SKILL.md"\` before writing files.
`,
};

/** Browser default source for a packed skill resource. */
function chromeSkillUrl(root: string): string {
  return chrome.runtime.getURL(root);
}

/**
 * Resolve the base URL: an explicit `baseUrl` wins; a supplied `fetcher` implies
 * a test/injected transport so we fall back to a chrome-free scheme string
 * (the fetcher is responsible for mapping it); otherwise use the real packed
 * resource URL (which requires `chrome`).
 */
function baseUrlOf(opts: SlideSkillLoadOpts, root: string): string {
  if (opts.baseUrl) return opts.baseUrl;
  if (opts.fetcher) return `${'skills'}://${root}`;
  return chromeSkillUrl(root);
}

function fetcherOf(opts: SlideSkillLoadOpts): SlideSkillFetcher {
  return (
    opts.fetcher ??
    ((url) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch skill resource: ${url} (${r.status})`);
        return r.text();
      }))
  );
}

function urlOf(opts: SlideSkillLoadOpts, phase: SlidePhaseKey, rel: string): string {
  const base = baseUrlOf(opts, PHASE_ROOT[phase]);
  return `${base}/${rel}`;
}

const REF_MENTION = /(?:`|\b)references\/([A-Za-z0-9._-]+\.md)/g;

function mentionedRefs(skillText: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of skillText.matchAll(REF_MENTION)) {
    const name = `references/${m[1]}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function parseFrontmatter(text: string): { name?: string; description?: string } {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const block = m[1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  return { ...(name ? { name } : {}), ...(description ? { description } : {}) };
}

function firstHeading(text: string): string {
  const m = text.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? '';
}

/**
 * Canonical resource id for `load_skill`. Rejects traversal / URLs / other
 * phases. Accepts `SKILL.md`, `skill`, the YAML `name`, and `references/*.md`.
 */
export function normalizeSlideSkillName(
  name: string,
  catalogIds?: ReadonlySet<string>,
  frontmatterName?: string,
): string | null {
  const raw = name.trim();
  if (!raw) return null;
  const n = raw.replace(/^\/+/, '');
  if (n.includes('..') || n.includes('\\') || n.includes('://') || n.includes('\\0')) {
    return null;
  }
  if (n === 'SKILL.md' || n === 'skill' || (frontmatterName && n === frontmatterName)) {
    return 'SKILL.md';
  }
  if (/^references\/[A-Za-z0-9._-]+\.md$/.test(n)) return n;
  if (catalogIds?.has(n)) return n;
  return null;
}

/**
 * Catalog of loadable docs for one phase: SKILL.md plus every `references/*.md`
 * mentioned in the skill body. Missing reference files are still listed (the
 * skill named them) with a filename fallback description.
 */
export async function listSlideSkillCatalog(
  phase: SlidePhaseKey,
  opts: SlideSkillLoadOpts = {},
): Promise<SlideSkillCatalogEntry[]> {
  const fetchText = fetcherOf(opts);
  const skillText = await fetchText(urlOf(opts, phase, 'SKILL.md'));
  const fm = parseFrontmatter(skillText);
  const entries: SlideSkillCatalogEntry[] = [
    {
      id: 'SKILL.md',
      description: fm.description || `${phase} phase skill`,
    },
  ];
  for (const id of mentionedRefs(skillText)) {
    let description = id.replace(/^references\//, '').replace(/\.md$/, '');
    try {
      const text = await fetchText(urlOf(opts, phase, id));
      description = firstHeading(text) || description;
    } catch {
      // Missing ref is non-fatal for the catalog; load_skill will error later.
    }
    entries.push({ id, description });
  }
  return entries;
}

/**
 * Load one packed skill resource. Unknown / traversal names return an Error
 * string (tool-result style) rather than throwing, so a bad model call cannot
 * crash the session. Missing SKILL.md still throws from the fetcher when the
 * catalog is built; a missing single resource here is an error string.
 */
export async function loadSlideSkillResource(
  phase: SlidePhaseKey,
  name: string,
  opts: SlideSkillLoadOpts = {},
): Promise<string> {
  const fetchText = fetcherOf(opts);
  let skillText: string | undefined;
  let catalogIds: Set<string> | undefined;
  let frontmatterName: string | undefined;
  try {
    skillText = await fetchText(urlOf(opts, phase, 'SKILL.md'));
    const fm = parseFrontmatter(skillText);
    frontmatterName = fm.name;
    catalogIds = new Set(['SKILL.md', ...mentionedRefs(skillText)]);
  } catch {
    catalogIds = new Set(['SKILL.md']);
  }

  const id = normalizeSlideSkillName(name, catalogIds, frontmatterName);
  if (!id) {
    return `Error: load_skill unknown name: ${name}. Use SKILL.md or a catalog references/*.md id.`;
  }
  if (catalogIds && !catalogIds.has(id)) {
    return `Error: load_skill name not in this phase catalog: ${id}`;
  }
  if (id === 'SKILL.md' && skillText !== undefined) return skillText;
  try {
    return await fetchText(urlOf(opts, phase, id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Error: load_skill failed for ${id}: ${msg}`;
  }
}

/** Compact always-on system prefix + catalog. Byte-stable for prompt caching. */
export function buildSlidePhaseStub(
  phase: SlidePhaseKey,
  catalog: SlideSkillCatalogEntry[],
): string {
  const lines = catalog.map((e) => `- \`${e.id}\` — ${e.description}`);
  const catalogBlock = `
## Skill catalog (this phase only)

Call \`load_skill\` with \`{ "name": "<id>" }\` to fetch a document. Do not
assume reference bodies are already in context. Loaded text arrives as the
tool result (not the system prompt).

${lines.join('\n')}
`;
  return PHASE_STUB[phase] + catalogBlock + SLIDE_CHAT_TERSE_BLOCK;
}

/**
 * Load the compact system prompt for a slide phase (stub + catalog + terse
 * chat). Does **not** concatenate SKILL.md or reference bodies.
 */
export async function loadSlideSkill(
  phase: SlidePhaseKey,
  opts: SlideSkillLoadOpts = {},
): Promise<string> {
  const catalog = await listSlideSkillCatalog(phase, opts);
  return buildSlidePhaseStub(phase, catalog);
}
