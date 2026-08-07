import type { SlideActivityEvent } from '../types/slides.ts';

/**
 * A file the agent touched in the current phase run (Amendment A.9 file
 * change strip): the VFS path plus the patch op that produced it.
 */
export interface SlideFileTouch {
  /** Absolute VFS path, e.g. `/slides/01.html`. */
  path: string;
  /** The `apply_patch` operation type that wrote/deleted this path. */
  op: 'create_file' | 'update_file' | 'delete_file';
}

/** Strip glyph for a patch op (A.9): `+` create, `~` update, `-` delete. */
export function slideTouchSymbol(op: SlideFileTouch['op']): '+' | '~' | '-' {
  switch (op) {
    case 'create_file':
      return '+';
    case 'delete_file':
      return '-';
    case 'update_file':
    default:
      return '~';
  }
}

/**
 * Derive the current phase run's touched files from the activity feed.
 *
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
