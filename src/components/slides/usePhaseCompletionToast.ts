import { useEffect, useRef } from 'react';
import { useSlideStore } from '../../store/slideStore.ts';
import type { SlideActivityEvent } from '../../types/slides.ts';
import { useToast } from '../ui/index.ts';

/** A.12 exact success copy for a finished edit phase. This is the US-046 /
 * Amendment A.12 toast copy ("Edits applied"), deliberately separate from the
 * A.5 *activity-row* label (`Updates applied`) — the two surfaces have different
 * normative copy. */
export const EDIT_COMPLETED_COPY = 'Edits applied';

/** The subset of a `SlideActivityEvent` the toast copy needs. */
export type PhaseCompletedToastEvent = Pick<
  SlideActivityEvent,
  'type' | 'phase' | 'label'
>;

/**
 * Pure completion-toast copy for a terminal success row (US-046 / A.12).
 * Returns the toast title to show, or null for rows that don't represent a
 * build/edit success:
 *   - build → the row's exact A.12 label (`Deck ready — {n} slides`)
 *   - edit → `EDIT_COMPLETED_COPY` (A.12's "Edits applied")
 *   - plan / anything else → null (plan completion surfaces via PlanReview,
 *     not a toast)
 */
export function completionToastFor(
  ev: PhaseCompletedToastEvent,
): string | null {
  if (ev.type !== 'phase_completed') return null;
  if (ev.phase === 'build') return ev.label;
  if (ev.phase === 'edit') return EDIT_COMPLETED_COPY;
  return null;
}

/**
 * Unique-per-arrival key for a `phase_completed` row.
 *
 * The emitter reuses `${phase}_phase_completed_${seq}` ids across repeated runs
 * of the same phase in one project (each run resets its per-run `seq`), so
 * `ev.id` alone is NOT enough to tell two completions apart — a second build or
 * edit with the same tool-row count produces a colliding id and must still
 * toast. Epoch-ms `ts` disambiguates: two separate phases finishing in the same
 * millisecond is unreachable for agent runs (they take seconds).
 */
export function toastDedupKey(ev: Pick<SlideActivityEvent, 'id' | 'ts'>): string {
  return `${ev.id}:${ev.ts}`;
}

interface ProjectToastState {
  /** phase_completed event ids already surfaced for this project. */
  seen: Set<string>;
  /** True once the pre-existing feed has been marked seen (no remount re-toast). */
  bootstrapped: boolean;
}

/**
 * US-046 / Amendment A.12 — fire a success toast when a build or edit phase
 * finishes.
 *
 * The completion signal is derived from the activity feed's `phase_completed`
 * row (the same canonical event the feed UI renders), so no new plumbing is
 * needed through the DI'd orchestrator. The build row already carries the exact
 * A.12 label (`Deck ready — {n} slides` — reused verbatim); edit uses the
 * A.12 copy above.
 *
 * Surfacing is idempotent per *arrival* per project (dedup key = `id:ts`, so a
 * repeat run of the same phase that reuses a colliding emitter id still toasts):
 *   - the first observation of a project's feed *bootstraps* every pre-existing
 *     `phase_completed` as seen (so a remount / HMR never re-toasts history);
 *   - only newly-appended rows fire.
 * Activity resets to `[]` on every project switch (`setActiveProjectData` /
 * `setActiveProject(null)`), and the seen-set is keyed by project id, so toasts
 * never leak across projects.
 */
export function usePhaseCompletionToast(): void {
  const activity = useSlideStore((s) => s.activity);
  const projectId = useSlideStore((s) => s.activeProject?.id);
  const { success } = useToast();
  const stateByProjectRef = useRef<Map<string, ProjectToastState>>(new Map());

  useEffect(() => {
    if (!projectId) return;

    let st = stateByProjectRef.current.get(projectId);
    if (!st) {
      st = { seen: new Set(), bootstrapped: false };
      stateByProjectRef.current.set(projectId, st);
    }

    if (!st.bootstrapped) {
      // First look at this project's feed: treat everything already present as
      // seen so we only toast events that appear after this point.
      for (const ev of activity) {
        if (ev.type === 'phase_completed') st.seen.add(toastDedupKey(ev));
      }
      st.bootstrapped = true;
      return;
    }

    for (const ev of activity) {
      if (ev.type !== 'phase_completed') continue;
      const key = toastDedupKey(ev);
      if (st.seen.has(key)) continue;
      st.seen.add(key);
      const copy = completionToastFor(ev);
      if (copy) success(copy);
    }
  }, [activity, projectId, success]);
}
