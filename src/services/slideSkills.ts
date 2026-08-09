// ==================== Slide phase skill loader ====================
//
// Loads the phase-skill markdown written in US-014/US-019/US-023 from the
// packed extension's `dist/skills` tree at runtime and concatenates the skill's
// `references/*` files into one system prompt for the isolated phase sub-agent.
//
// The skills are copied verbatim by build.ts/dev.ts (`copyDirTree('src/skills',
// 'dist/skills')`) and exposed via manifest `web_accessible_resources`, so this
// loader fetches `chrome.runtime.getURL('skills/slide-creator/{phase}/SKILL.md')`
// plus each `references/*.md` the SKILL.md references, and folds them into a
// single prompt string. In tests (no `chrome`) the caller injects a
// `fetcher` transport; see {@link SlideSkillFetcher}.

export type SlidePhaseKey = 'plan' | 'build' | 'edit';

/** Fetch a text resource by URL. Injectable so tests never need `chrome`. */
export type SlideSkillFetcher = (url: string) => Promise<string>;

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
function baseUrlOf(
  opts: { baseUrl?: string; fetcher?: SlideSkillFetcher },
  root: string
): string {
  if (opts.baseUrl) return opts.baseUrl;
  if (opts.fetcher) return `${'skills'}://${root}`;
  return chromeSkillUrl(root);
}

/**
 * Load the full system prompt for a slide phase: the raw `SKILL.md` + all
 * `references/*` files it mentions, concatenated with clear delimiters so the
 * sub-agent can distinguish the skill body from any template/palette.
 *
 * Fetches via an injected `fetcher` (defaults to `fetch(...).then(r => r.text())`
 * on `chrome.runtime.getURL` resources). Missing reference files are skipped
 * non-fatally — the skill body alone is enough to run a phase.
 */
export async function loadSlideSkill(
  phase: SlidePhaseKey,
  opts: {
    fetcher?: SlideSkillFetcher;
    /** Override the runtime URL root (tests use a fake/dist path). */
    baseUrl?: string;
  } = {}
): Promise<string> {
  const root = PHASE_ROOT[phase];
  const base = baseUrlOf(opts, root);
  const fetcher: SlideSkillFetcher =
    opts.fetcher ??
    ((url) =>
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch skill resource: ${url} (${r.status})`);
        return r.text();
      }));

  const url = (rel: string) => `${base}/${rel}`;

  const skillText = await fetcher(url('SKILL.md'));

  // Collect every `references/<file>.md` the skill body mentions and load it.
  const refNames = [...skillText.matchAll(/(?:`|\b)references\/([A-Za-z0-9._-]+\.md)/g)].map(
    (m) => m[1]
  );

  const seen = new Set<string>();
  const refParts: string[] = [];
  for (const name of refNames) {
    if (seen.has(name)) continue;
    seen.add(name);
    try {
      const text = await fetcher(url(`references/${name}`));
      refParts.push(`\n\n--- references/${name} ---\n${text}`);
    } catch {
      // A missing `references/*` file is non-fatal — the skill prose can still
      // command the phase. Silently skip rather than crash the loader.
    }
  }

  return skillText + refParts.join('') + SLIDE_CHAT_TERSE_BLOCK;
}