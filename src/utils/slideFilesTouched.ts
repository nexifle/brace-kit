import type { Slide, SlideActivityEvent } from '../types/slides.ts';


/**
 * A file the agent touched in the current phase run (Amendment A.9 file
 * change strip): the VFS path plus the patch op that produced it.
 */
export interface SlideFileTouch {
  /** Absolute VFS path, e.g. `/slides/01.html`. */
  path: string;
  /** The `apply_patch` operation type that wrote/deleted this path. */
  op: 'create_file' | 'update_file' | 'delete_file' | 'rename_file';
}

/** Strip glyph for a patch op (A.9): `+` create, `~` update/rename, `-` delete. */
export function slideTouchSymbol(op: SlideFileTouch['op']): '+' | '~' | '-' {
  switch (op) {
    case 'create_file':
      return '+';
    case 'delete_file':
      return '-';
    case 'update_file':
    case 'rename_file':
    default:
      return '~';
  }
}

/**
 * Pure plan-run summary for the PlanReview header (A.11: "Created /brief.md ·
 * Created /design.md · N steps"). Slices the same post-`phase_started` window
 * as `collectFilesTouched`, collecting the created files in first-touch order
 * (deduped) plus the number of tool steps the plan agent actually ran.
 */
export interface SlidePlanSummary {
  /** Absolute VFS paths created this plan run, in first-touch order. */
  createdPaths: string[];
  /** Count of `tool_started` events in the plan run. */
  steps: number;
}

/** Tool/agent-step event types that count toward "N steps" (A.11). */
const PLAN_STEP_TYPES: Partial<Record<SlideActivityEvent['type'], true>> = {
  tool_started: true,
};

export function collectPlanSummary(activity: SlideActivityEvent[]): SlidePlanSummary {
  // Find the index just past the latest `phase_started` marker (start of this run).
  let start = 0;
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].type === 'phase_started') {
      start = i + 1;
      break;
    }
  }

  const seen = new Set<string>();
  const createdPaths: string[] = [];
  let steps = 0;
  for (let i = start; i < activity.length; i++) {
    const ev = activity[i];
    if (PLAN_STEP_TYPES[ev.type]) steps++;
    if (ev.type === 'file_written' && ev.patchOp === 'create_file' && ev.path && !seen.has(ev.path)) {
      seen.add(ev.path);
      createdPaths.push(ev.path);
    }
  }
  return { createdPaths, steps };
}

/**
 * Derive the current phase run's touched files from the activity feed.
 * The activity feed is append-only across the session (never cleared between
 * phases), so a run's strip is the slice AFTER the most recent `phase_started`
 * marker — which also matches A.9's "visible until next phase start clears it"
 * without any store reset. A `file_written`/`file_deleted` event carries the
 * `path` + `patchOp` the emitter already records, so this is pure derivation
 * (no parallel bookkeeping for the store to keep in sync).
 *
 * Order = first touch; duplicate paths collapse to the first write.
 */
export function collectFilesTouched(activity: SlideActivityEvent[]): SlideFileTouch[] {
  // Find the index just past the latest `phase_started` marker (start of this run).
  let start = 0;
  for (let i = activity.length - 1; i >= 0; i--) {
    if (activity[i].type === 'phase_started') {
      start = i;
      break;
    }
  }

  const seen = new Set<string>();
  const touches: SlideFileTouch[] = [];
  for (let i = start; i < activity.length; i++) {
    const ev = activity[i];
    if (!ev.path) continue;
    if (ev.type !== 'file_written' && ev.type !== 'file_deleted') continue;
    if (seen.has(ev.path)) continue;
    seen.add(ev.path);
    // Defensive op fallback: file_deleted is always a delete; a written file
    // without an explicit op label degrades to `update` (the common case).
    const op: SlideFileTouch['op'] =
      ev.patchOp ?? (ev.type === 'file_deleted' ? 'delete_file' : 'update_file');
    touches.push({ path: ev.path, op });
  }
  return touches;
}

/** Map a VFS path to the deck slide index whose HTML or CSS path matches it. */
export function slideIndexForTouch(
  touch: Pick<SlideFileTouch, 'path'> | { path: string },
  slides: Slide[],
): number {
  return slides.findIndex(
    (s) => s.htmlPath === touch.path || s.cssPath === touch.path,
  );
}

