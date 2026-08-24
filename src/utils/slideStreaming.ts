import type {
  SlideActivityEvent,
  SlideSessionStatus,
} from '../types/slides.ts';

/**
 * Whether the live streaming assistant bubble should currently be visible
 * (US-039, PRD Amendment A.8).
 *
 * The bubble is shown while a model round is actively generating. We treat an
 * OPEN `model_round_started` activity row (status 'running', nothing emitted
 * after it) as the live window — that is exactly "model round in progress with
 * no tools yet" from A.8, and it also covers the streaming case because
 * `streamingText` only grows while the round's row is still open.
 *
 * The instant the round commits — a `tool_started`/`file_written` row pushed by
 * the dispatcher, or the `model_round_completed` row closed by
 * `onRoundComplete` on a clean turn / suspend / error / stop — the last row
 * changes and the bubble hides, so it "clears/commits when the turn ends"
 * instead of lingering on the accumulated `streamingText` buffer (which the
 * store does NOT clear between rounds of the same phase).
 */
export function isStreamingAgentActive(
  sessionStatus: SlideSessionStatus,
  activity: SlideActivityEvent[],
): boolean {
  if (sessionStatus !== 'running') return false;
  const last = activity[activity.length - 1];
  return (
    !!last &&
    last.type === 'model_round_started' &&
    last.status === 'running'
  );
}
