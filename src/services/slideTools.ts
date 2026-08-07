// ==================== Slide agent tool schemas ====================
//
// MCPTool-compatible definitions for the slide creator's agent sessions,
// matching PRD Appendix A (`ask`) and Appendix C (`apply_patch`), plus the
// read/orient tools (`list_files`, `read_file`) and the plan finish signal
// (`submit_plan`).
//
// Invariant (FR-11b): `apply_patch` is the ONLY tool in this public set that
// can mutate VFS files. `list_files` / `read_file` are read-only; `ask` is
// HITL (suspends the session); `submit_plan` declares the plan phase complete.
// Any future VFS-mutating helper must route through `apply_patch`, never fork
// its own write tool.

import type { MCPTool, ProviderConfig } from '../types/index.ts';
import type { SlidePatchPhase } from './applyPatchHarness.ts';

// Re-export for phase runners that type their tool-enablement params.
export type { SlidePatchPhase };

// ==================== External research tool ====================
//
// `google_search` is NOT part of the slide tool allowlist — it is injected on
// top of the plan phase (and, when the caller opts in, build/edit) exactly when
// the user enables Google Search in Settings (FR-10 / PRD US-013). It reuses the
// shared background `MCP_CALL_TOOL` path that routes built-in tools to
// `handleGoogleSearch`, mirroring main chat. The definition here is identical to
// the background's GOOGLE_SEARCH_TOOL so the model sees a consistent schema.

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

// ==================== Individual tool definitions ====================

const LIST_FILES_TOOL: MCPTool = {
  name: 'list_files',
  description:
    'List files in the project workspace virtual filesystem. Pass an absolute path prefix to scope the listing (e.g. "/slides" or "/"); omitting returns the workspace root. Read-only.',
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

const READ_FILE_TOOL: MCPTool = {
  name: 'read_file',
  description:
    'Read a single file from the project virtual filesystem by absolute path (e.g. "/slides/01.html"). Prefer reading before update_file when the current contents may be stale. Read-only.',
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
    'Create, update, or delete ONE project file per call (sole write tool). ' +
    'Pass flat arguments — NOT nested under "operation": ' +
    '{ "type": "create_file", "path": "/brief.md", "diff": "+# Title\\n+body\\n" }. ' +
    'create_file: full new file; every content line in diff starts with "+". ' +
    'update_file: V4A hunks with "@@" and " "/"+"/"-" lines; read_file first. ' +
    'delete_file: path only (omit diff). Prefer small focused patches.',
  inputSchema: {
    type: 'object',
    // Flat schema matches how models call function tools (and OpenAI operation
    // fields). Nested `{ operation: { ... } }` is still accepted by the parser.
    properties: {
      type: {
        type: 'string',
        enum: ['create_file', 'update_file', 'delete_file'],
        description:
          'create_file = new path (fails if exists); update_file = patch existing; delete_file = remove path.',
      },
      path: {
        type: 'string',
        description: 'Absolute project path, e.g. /slides/01.html or /brief.md',
      },
      diff: {
        type: 'string',
        description:
          'V4A diff body. create_file: one "+" line per file line, e.g. "+line one\\n+line two\\n". ' +
          'update_file: "@@" sections with context (" "), additions ("+"), deletions ("-"). ' +
          'Omit for delete_file.',
      },
    },
    required: ['type', 'path'],
  },
};

const ASK_TOOL: MCPTool = {
  name: 'ask',
  description:
    'Ask the user a question and wait for their answer. Use when clarification is needed (canvas, slide count, audience, style, brand). User response is the tool result. Suspends the session until answered.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: { type: 'array', items: { type: 'string' } },
      field: {
        type: 'string',
        description: 'canvas | slide_count | audience | topic | style | brand | other',
      },
    },
    required: ['question'],
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

// ==================== Tool set access ====================

/** All slide creator tools, keyed by name. `apply_patch` is the sole mutator. */
export const SLIDE_BUILTIN_TOOLS: Record<string, MCPTool> = {
  list_files: LIST_FILES_TOOL,
  read_file: READ_FILE_TOOL,
  apply_patch: APPLY_PATCH_TOOL,
  ask: ASK_TOOL,
  submit_plan: SUBMIT_PLAN_TOOL,
};

/** The full public tool set for the slide creator. */
export function getAllSlideTools(): MCPTool[] {
  return Object.values(SLIDE_BUILTIN_TOOLS);
}

/** True if `name` is a slide tool that mutates the VFS (currently only apply_patch). */
export function isSlideVfsMutator(name: string): boolean {
  return name === 'apply_patch';
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
 * Resolve the allowlisted set of slide tool NAMES for a phase.
 *
 * - plan:  read tools + apply_patch + ask + submit_plan
 * - build: read tools + apply_patch (no ask / no submit_plan)
 * - edit:  read tools + apply_patch (follow-ups are pure patches)
 * - main:  read-only tools only (orchestrator may orient but never mutate)
 *
 * When `enableGoogleSearch` is passed true (US-028), `google_search` is appended
 * for plan — and for build/edit when the caller opts in — matching main chat's
 * behaviour of offering the tool for non-Gemini providers. It is always injected
 * AFTER the slide tools so `google_search` stays external to the apply_patch
 * allowlist.
 */
export function getToolsForPhaseNames(
  phase: SlidePatchPhase,
  options?: { enableGoogleSearch?: boolean }
): string[] {
  const base: string[] = (() => {
    switch (phase) {
      case 'plan':
        return ['list_files', 'read_file', 'apply_patch', 'ask', 'submit_plan'];
      case 'build':
        return ['list_files', 'read_file', 'apply_patch'];
      case 'edit':
        return ['list_files', 'read_file', 'apply_patch'];
      case 'main':
      default:
        return ['list_files', 'read_file'];
    }
  })();

  if (options?.enableGoogleSearch && phase !== 'main') {
    base.push('google_search');
  }
  return base;
}

/**
 * Resolve the allowlisted MCPTool definitions for a phase.
 * Mirrors `getToolsForPhaseNames` but returns resolved schemas.
 */
export function getToolsForPhase(
  phase: SlidePatchPhase,
  options?: { enableGoogleSearch?: boolean }
): MCPTool[] {
  const toolNames = getToolsForPhaseNames(phase, options);
  return toolNames.map((name) =>
    name === 'google_search'
      ? GOOGLE_SEARCH_TOOL
      : SLIDE_BUILTIN_TOOLS[name]
  ).filter((tool): tool is MCPTool => Boolean(tool));
}
