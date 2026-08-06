// ==================== apply_patch harness (sole VFS mutator) ====================
//
// The Codex-style `apply_patch` harness. This is the ONLY module allowed to
// create / update / delete project files in the slide VFS. Every mutation:
//
//   1. passes through `safeSlidePath` (no traversal)
//   2. passes the phase allowlist (plan/build/edit/main)
//   3. passes per-file size caps
//   4. dispatches onto the V4A apply diff from `src/utils/applyDiff.ts`
//
// Operations mirror the PRD Appendix C portable function tool:
// `create_file` | `update_file` | `delete_file`. Each call returns a Codex-style
// `{ status: "completed" | "failed", output }` so a model can recover from
// failures. Atomicity is per-operation (FR-30): multiple apply_patch calls in
// one turn are applied sequentially, each with its own result.

import type { SlideFile } from '../types/index.ts';
import {
  MAX_SLIDE_FILE_BYTES,
  getSlideFile,
  isSlideFileOverLimit,
  removeSlideFile,
  safeSlidePath,
  upsertSlideFile,
} from '../utils/slideVfs.ts';
import { applyDiff } from '../utils/applyDiff.ts';

// ==================== Operation types ====================

/** A single `apply_patch` operation, as defined in PRD Appendix C. */
export type SlidePatchOperation =
  | { type: 'create_file'; path: string; diff: string }
  | { type: 'update_file'; path: string; diff: string }
  | { type: 'delete_file'; path: string };

/** Phases that gate which paths a patch is allowed to touch. */
export type SlidePatchPhase = 'plan' | 'build' | 'edit' | 'main';

/** Result of a harness operation, shaped for model recovery (Codex-compatible). */
export type ApplyPatchResult =
  | { status: 'completed'; output: string; files: SlideFile[] }
  | { status: 'failed'; output: string };

// ==================== Phase allowlists ====================

const ALLOWED_DECK_META = '/deck.json';
const ALLOWED_PLAN_FILES: string[] = ['/brief.md', '/design.md', ALLOWED_DECK_META];
const ALLOWED_BUILD_PREFIXES: string[] = ['/slides/', '/theme.css', ALLOWED_DECK_META];
const ALLOWED_EDIT_FILES: string[] = ['/brief.md', '/design.md'];

/**
 * True when `path` (already safe) is within `pattern`, where pattern is either a
 * literal path or a `/slides/` prefix directory.
 */
function pathAllowed(path: string, patterns: readonly string[]): boolean {
  return patterns.some((p) =>
    p.endsWith('/') ? path.startsWith(p) : path === p,
  );
}

/** Resolve the set of paths `phase` may patch. */
export function allowlistForPhase(phase: SlidePatchPhase): readonly string[] {
  switch (phase) {
    case 'plan':
      return ALLOWED_PLAN_FILES;
    case 'build':
      return ALLOWED_BUILD_PREFIXES;
    case 'edit':
      return [...ALLOWED_BUILD_PREFIXES, ...ALLOWED_EDIT_FILES];
    case 'main':
    default:
      return [];
  }
}

// ==================== Harness ====================

/**
 * Apply a single patch operation to the VFS `files` under `phase`.
 *
 * Returns a Codex-style result. On success the caller should persist the
 * returned `files` array (new reference — the input array is not mutated).
 */
export function applyPatchOperation(
  files: SlideFile[],
  phase: SlidePatchPhase,
  operation: SlidePatchOperation,
): ApplyPatchResult {
  const path = safeSlidePath(operation.path);
  if (!path) {
    return { status: 'failed', output: `Error: Invalid path: ${operation.path}` };
  }

  if (!pathAllowed(path, allowlistForPhase(phase))) {
    return {
      status: 'failed',
      output: `Error: Path not allowed in ${phase} phase: ${path}`,
    };
  }

  switch (operation.type) {
    case 'create_file':
      return createFile(files, path, operation.diff);
    case 'update_file':
      return updateFile(files, path, operation.diff);
    case 'delete_file':
      return deleteFile(files, path);
    default:
      return { status: 'failed', output: `Error: Unknown operation type` };
  }
}

function createFile(
  files: SlideFile[],
  path: string,
  diff: string | undefined,
): ApplyPatchResult {
  if (typeof diff !== 'string' || diff.length === 0) {
    return { status: 'failed', output: `Error: diff is required for create_file: ${path}` };
  }
  if (getSlideFile(files, path)) {
    return {
      status: 'failed',
      output: `Error: File already exists: ${path}. Use update_file instead to modify it.`,
    };
  }

  const result = applyDiff('', diff);
  if (!result.ok) {
    return {
      status: 'failed',
      output: `Error: Failed to apply create_file patch to ${path}: ${result.error}`,
    };
  }

  const content = result.text;
  if (isSlideFileOverLimit(content)) {
    return {
      status: 'failed',
      output: `Error: File over ${MAX_SLIDE_FILE_BYTES} byte limit: ${path}`,
    };
  }

  return {
    status: 'completed',
    output: `Created ${path}`,
    files: upsertSlideFile(files, path, content),
  };
}

function updateFile(
  files: SlideFile[],
  path: string,
  diff: string | undefined,
): ApplyPatchResult {
  if (typeof diff !== 'string' || diff.length === 0) {
    return { status: 'failed', output: `Error: diff is required for update_file: ${path}` };
  }
  const current = getSlideFile(files, path);
  if (!current) {
    return {
      status: 'failed',
      output: `Error: File not found: ${path}. Use create_file to add it first.`,
    };
  }

  const result = applyDiff(current.content, diff);
  if (!result.ok) {
    return {
      status: 'failed',
      output: `Error: Invalid Context while applying patch to ${path}: ${result.error}`,
    };
  }

  const content = result.text;
  if (isSlideFileOverLimit(content)) {
    return {
      status: 'failed',
      output: `Error: File over ${MAX_SLIDE_FILE_BYTES} byte limit: ${path}`,
    };
  }

  return {
    status: 'completed',
    output: `Updated ${path}`,
    files: upsertSlideFile(files, path, content),
  };
}

function deleteFile(files: SlideFile[], path: string): ApplyPatchResult {
  if (!getSlideFile(files, path)) {
    return {
      status: 'failed',
      output: `Error: File not found: ${path}`,
    };
  }
  return {
    status: 'completed',
    output: `Deleted ${path}`,
    files: removeSlideFile(files, path),
  };
}
