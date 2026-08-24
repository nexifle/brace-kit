// ==================== Slide agent tool schemas ====================
//
// MCPTool-compatible definitions for the slide creator's agent sessions,
// matching PRD Appendix A (`ask`) and Appendix C (`apply_patch`), plus the
// read/orient tools (`list_files`, `read_file`) and the plan finish signal
// (`submit_plan`).
//
// Invariant (FR-11b): VFS mutation is centralized and explicit. `apply_patch`
// is the primary mutator (create/update/delete/rename). `reorder_slides` is a
// second, tightly-scoped mutator that ONLY renames `/slides/*.{html,css}` via
// `reorderSlideFiles` — it never writes arbitrary paths, never traverses, and
// never mutates the input array. `list_files` / `read_file` are read-only;
// `ask` is HITL (suspends the session); `submit_plan` declares the plan phase
// complete. Any future VFS-mutating helper must route through `apply_patch` or
// be added as an explicit, allowlist-bounded exception like `reorder_slides` —
// never fork an unbounded write tool.

import type { MCPTool, ProviderConfig } from '../types/index.ts';
import type { SlidePatchPhase } from './applyPatchHarness.ts';

// Re-export for phase runners that type their tool-enablement params.
export type { SlidePatchPhase };

// ==================== External research tools ====================
//
// `google_search` and `web_search` (Grok) are NOT part of the slide tool
// allowlist — they are injected on top of the plan phase (and, when the caller
// opts in, build/edit) exactly when the user enables them. They reuse the
// shared background `MCP_CALL_TOOL` path that routes built-in tools to their
// handlers, mirroring main chat. The definitions here are identical to the
// background's GOOGLE_SEARCH_TOOL / GROK_WEB_SEARCH_TOOL so the model sees a
// consistent schema.

const GOOGLE_SEARCH_TOOL: MCPTool = {
  name: 'google_search',
  description:
    'Search the web using Google. Use this to find current information, news, facts, or any topic that requires up-to-date web search results.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to look up on the web',
      },
    },
    required: ['query'],
  },
};

const GROK_WEB_SEARCH_TOOL: MCPTool = {
  name: 'web_search',
  description:
    'Search the web for up-to-date information. Returns a synthesized answer with source citations. Use for current events, recent docs, or any time-dependent facts.',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to perform.',
      },
      allowed_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional list of domains to restrict the search to.',
      },
    },
    required: ['query'],
  },
};

// ==================== Individual tool definitions ====================

const LIST_FILES_TOOL: MCPTool = {
  name: 'list_files',
  description:
    'List files in the project. Pass an absolute path prefix to scope the listing (e.g. "/slides" or "/"); omitting returns the workspace root. Read-only.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description:
          'Absolute project path prefix to list under, e.g. "/slides" or "/". Omit or use "/" for the whole workspace.',
      },
    },
  },
};

const LOAD_SKILL_TOOL: MCPTool = {
  name: 'load_skill',
  description:
    'Load a packed phase skill document into this session (SKILL.md or a catalog references/*.md). ' +
    'Not a project file — use read_file for VFS paths like /brief.md. Call SKILL.md once before the first write. ' +
    'Load each name at most once while its result remains in context; duplicates return an already-loaded notice (no body). ' +
    'After context compaction you may load again. Read-only.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description:
          'Catalog id: "SKILL.md" or "references/<file>.md" (e.g. "references/brief-template.md").',
      },
    },
    required: ['name'],
  },
};

const READ_FILE_TOOL: MCPTool = {
  name: 'read_file',
  description:
    'Read a single file from the project by absolute path (e.g. "/slides/01.html"). Prefer reading before update_file when the current contents may be stale. Read-only.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Absolute project path of the file to read, e.g. "/slides/01.html".',
      },
    },
    required: ['path'],
  },
};

const APPLY_PATCH_TOOL: MCPTool = {
  name: 'apply_patch',
  description:
    'Create, update, delete, or rename ONE project file per call (sole write tool). ' +
    'Pass flat arguments — NOT nested under "operation": ' +
    '{ "type": "create_file", "path": "/brief.md", "diff": "+# Title\\n+body\\n" }. ' +
    'create_file: full new file; every content line in diff starts with "+". ' +
    'update_file: V4A hunks with "@@" and " "/"+"/"-" lines; read_file first. ' +
    'delete_file: path only (omit diff). ' +
    'rename_file: path + newPath (omit diff); renames one file in place — prefer the reorder_slides tool for reordering slides. ' +
    'Prefer small focused patches.',
  inputSchema: {
    type: 'object',
    // Flat schema matches how models call function tools (and OpenAI operation
    // fields). Nested `{ operation: { ... } }` is still accepted by the parser.
    properties: {
      type: {
        type: 'string',
        enum: ['create_file', 'update_file', 'delete_file', 'rename_file'],
        description:
          'create_file = new path (fails if exists); update_file = patch existing; delete_file = remove path; rename_file = move path to newPath.',
      },
      path: {
        type: 'string',
        description: 'Absolute project path, e.g. /slides/01.html or /brief.md',
      },
      newPath: {
        type: 'string',
        description:
          'Target absolute path for rename_file (e.g. /slides/04.html). Omit for other ops.',
      },
      diff: {
        type: 'string',
        description:
          'V4A diff body. create_file: one "+" line per file line, e.g. "+line one\\n+line two\\n". ' +
          'update_file: "@@" sections with context (" "), additions ("+"), deletions ("-"). ' +
          'Omit for delete_file / rename_file.',
      },
    },
    required: ['type', 'path'],
  },
};

const ASK_TOOL: MCPTool = {
  name: 'ask',
  description:
    'Ask the user one or more questions and wait for their answers. Use when clarification is needed (canvas, slide count, audience, style, brand). Each question may offer options (provide "options"); set "multiple": true to let the user pick several options, and "freeText": true to also let the user type their own answer. User responses are the tool result. Suspends the session until answered.',
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description:
          'One or more questions to ask at once. Each item: { question, options?, multiple?, freeText?, field? }.',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question text.' },
            options: {
              type: 'array',
              items: { type: 'string' },
              description: 'Selectable choices. Omit for a free-text-only answer.',
            },
            multiple: {
              type: 'boolean',
              description: 'When true with options, the user may select several (multi-select).',
            },
            freeText: {
              type: 'boolean',
              description:
                'When true with options, also show a free-text input so the user can add their own answer.',
            },
            field: {
              type: 'string',
              description: 'canvas | slide_count | audience | topic | style | brand | other',
            },
          },
          required: ['question'],
        },
      },
      question: {
        type: 'string',
        description: 'Legacy single-question form. Prefer "questions" for multiple at once.',
      },
      options: { type: 'array', items: { type: 'string' } },
      multiple: { type: 'boolean' },
      freeText: { type: 'boolean' },
      field: {
        type: 'string',
        description: 'canvas | slide_count | audience | topic | style | brand | other',
      },
    },
  },
};

const SUBMIT_PLAN_TOOL: MCPTool = {
  name: 'submit_plan',
  description:
    'Declare the plan phase complete once /brief.md and /design.md have been written and any needed clarification has been answered. Call this only when both files are present and consistent with the user direction.',
  inputSchema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'Short summary of the plan for the user-facing review panel.',
      },
      canvas: {
        type: 'string',
        description: 'Chosen canvas preset key (e.g. "16:9", "4:5", "9:16", "1:1"), if not already decided.',
      },
    },
  },
};

const REORDER_SLIDES_TOOL: MCPTool = {
  name: 'reorder_slides',
  description:
    'Reorder the deck. Pass "order": the current slide ids listed in the desired final sequence. The harness renames the slide files to sequential ids (01,02,03,...) to match, shifting affected slides in place — use this to insert a slide mid-deck or change slide order WITHOUT deleting and recreating slides. Create a new slide first with create_file under any non-colliding id (e.g. "zz"), then include that id in "order".',
  inputSchema: {
    type: 'object',
    properties: {
      order: {
        type: 'array',
        items: { type: 'string' },
        description: 'Current slide ids in desired final order.',
      },
    },
    required: ['order'],
  },
};

// ==================== Tool set access ====================

/** All slide creator tools, keyed by name. `apply_patch` is the sole mutator. */
export const SLIDE_BUILTIN_TOOLS: Record<string, MCPTool> = {
  list_files: LIST_FILES_TOOL,
  read_file: READ_FILE_TOOL,
  load_skill: LOAD_SKILL_TOOL,
  apply_patch: APPLY_PATCH_TOOL,
  reorder_slides: REORDER_SLIDES_TOOL,
  ask: ASK_TOOL,
  submit_plan: SUBMIT_PLAN_TOOL,
};

/** The full public tool set for the slide creator. */
export function getAllSlideTools(): MCPTool[] {
  return Object.values(SLIDE_BUILTIN_TOOLS);
}

/** True if `name` is a slide tool that mutates the VFS (apply_patch + reorder_slides). */
export function isSlideVfsMutator(name: string): boolean {
  return name === 'apply_patch' || name === 'reorder_slides';
}

/**
 * Whether `google_search` should be offered to a slide agent session for the
 * given provider, mirroring main chat's gate: only for non-Gemini providers, and
 * only when the user enabled the Google Search tool AND supplied an API key.
 * Gemini models get search via native grounding (`enableGoogleSearch`), not the
 * tool-call path (US-028).
 */
export function shouldEnableGoogleSearch(
  providerConfig: Pick<ProviderConfig, 'providerId' | 'format'> & {
    enableGoogleSearchTool?: boolean;
    googleSearchApiKey?: string;
  }
): boolean {
  const isGemini =
    providerConfig.providerId === 'gemini' || providerConfig.format === 'gemini';
  return Boolean(
    !isGemini &&
      providerConfig.enableGoogleSearchTool &&
      providerConfig.googleSearchApiKey
  );
}

/**
 * Whether the Grok `web_search` tool should be offered to a slide agent session,
 * mirroring main chat's gate: only for the `grok` provider when function calling
 * is supported. The tool reuses the Grok OAuth access token — no separate API key.
 */
export function shouldEnableGrokWebSearch(
  providerConfig: Pick<ProviderConfig, 'providerId'>
): boolean {
  return providerConfig.providerId === 'grok';
}

/**
 * Resolve the allowlisted set of slide tool NAMES for a phase.
 *
 * - plan:  read tools + load_skill + apply_patch + ask + submit_plan
 * - build: read tools + load_skill + apply_patch + reorder_slides (no ask / no submit_plan)
 * - edit:  read tools + load_skill + apply_patch + reorder_slides (follow-ups are pure patches)
 * - main:  read-only VFS tools only (orchestrator may orient but never mutate)
 *
 * When `enableGoogleSearch` is passed true (US-028), `google_search` is appended
 * for plan — and for build/edit when the caller opts in — matching main chat's
 * behaviour of offering the tool for non-Gemini providers. When
 * `enableGrokWebSearch` is passed true, `web_search` is appended for plan and
 * build/edit. Both are always injected AFTER the slide tools so they stay
 * external to the apply_patch allowlist.
 */
export function getToolsForPhaseNames(
  phase: SlidePatchPhase,
  options?: { enableGoogleSearch?: boolean; enableGrokWebSearch?: boolean }
): string[] {
  const base: string[] = (() => {
    switch (phase) {
      case 'plan':
        return ['list_files', 'read_file', 'load_skill', 'apply_patch', 'ask', 'submit_plan'];
      case 'build':
        return ['list_files', 'read_file', 'load_skill', 'apply_patch', 'reorder_slides'];
      case 'edit':
        return ['list_files', 'read_file', 'load_skill', 'apply_patch', 'reorder_slides'];
      case 'main':
      default:
        return ['list_files', 'read_file'];
    }
  })();

  if (phase !== 'main') {
    if (options?.enableGoogleSearch) base.push('google_search');
    if (options?.enableGrokWebSearch) base.push('web_search');
  }
  return base;
}

/**
 * Resolve the allowlisted MCPTool definitions for a phase.
 * Mirrors `getToolsForPhaseNames` but returns resolved schemas.
 */
export function getToolsForPhase(
  phase: SlidePatchPhase,
  options?: { enableGoogleSearch?: boolean; enableGrokWebSearch?: boolean }
): MCPTool[] {
  const toolNames = getToolsForPhaseNames(phase, options);
  return toolNames.map((name) =>
    name === 'google_search'
      ? GOOGLE_SEARCH_TOOL
      : name === 'web_search'
        ? GROK_WEB_SEARCH_TOOL
        : SLIDE_BUILTIN_TOOLS[name]
  ).filter((tool): tool is MCPTool => Boolean(tool));
}
