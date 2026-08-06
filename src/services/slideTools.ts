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

import type { MCPTool } from '../types/index.ts';
import type { SlidePatchPhase } from './applyPatchHarness.ts';

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
    'Create, update, or delete a file in the project workspace using a structured patch. Prefer small focused updates. Read the file before update_file when unsure of current contents. One operation per call. This is the only tool that can change project files.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['create_file', 'update_file', 'delete_file'],
          },
          path: {
            type: 'string',
            description: 'Absolute project path, e.g. /slides/01.html',
          },
          diff: {
            type: 'string',
            description:
              'V4A-style diff. Required for create_file and update_file. Omit for delete_file.',
          },
        },
        required: ['type', 'path'],
      },
    },
    required: ['operation'],
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
 * Resolve the allowlisted set of slide tool NAMES for a phase.
 *
 * - plan:  read tools + apply_patch + ask + submit_plan
 * - build: read tools + apply_patch (no ask / no submit_plan)
 * - edit:  read tools + apply_patch (follow-ups are pure patches)
 * - main:  read-only tools only (orchestrator may orient but never mutate)
 */
export function getToolsForPhaseNames(phase: SlidePatchPhase): string[] {
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
}

/**
 * Resolve the allowlisted MCPTool definitions for a phase.
 * Mirrors `getToolsForPhaseNames` but returns resolved schemas.
 */
export function getToolsForPhase(phase: SlidePatchPhase): MCPTool[] {
  return getToolsForPhaseNames(phase)
    .map((name) => SLIDE_BUILTIN_TOOLS[name])
    .filter((tool): tool is MCPTool => Boolean(tool));
}
