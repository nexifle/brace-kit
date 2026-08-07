import type { SlideActivityEvent } from '../../types/slides.ts';
import { SLIDE_PHASE_STATUS_COPY, DEFAULT_SLIDE_AGENT_MAX_ROUNDS } from '../../types/index.ts';
import { useSlideStore } from '../../store/slideStore.ts';

/* ==================================================================== */
/* Pure derivations (presentational — no store wiring needed)           */
/* ==================================================================== */

/** Tool-like event kinds whose `label` reads as "what the agent did last". */
const TOOL_LIKE_TYPES: Record<string, true> = {
  tool_started: true,
  tool_finished: true,
  file_written: true,
  file_deleted: true,
  ask_started: true,
  ask_answered: true,
};

/** Highest model round seen in the activity feed (fallback for the unwired agentRound). */
function latestRound(activity: SlideActivityEvent[]): number {
  let round = 0;
  for (const ev of activity) {
    if (typeof ev.round === 'number' && ev.round > round) round = ev.round;
  }
  return round;
}

/** Label of the most recent tool-like row (e.g. "Updating /slides/01.html"). */
export function lastToolActivityLabel(activity: SlideActivityEvent[]): string | null {
  for (let i = activity.length - 1; i >= 0; i--) {
    const ev = activity[i];
    if (TOOL_LIKE_TYPES[ev.type]) return ev.label;
  }
  return null;
}

/* ==================================================================== */
/* PhaseHeader (PRD Amendment A.6 — chat rail region 1, sticky)         */
/* ==================================================================== */

/**
 * Sticky phase chrome that always answers "what is happening now":
 *   - title from SLIDE_PHASE_STATUS_COPY / A.6 copy
 *   - `Round {n}/{max}` while running (or connecting copy before round 1)
 *   - `Waiting for your answer` while waiting_user
 *   - Stop control while running; Cancel control while waiting_user
 *   - optional muted `Last: {label}` from the latest tool activity
 * Rendered at the TOP of both the wide ChatRail and narrow ChatDock scroll
 * areas (outside the scroll region) so it stays pinned while the transcript
 * and activity feed scroll beneath it. Returns null when no project is open.
 */
export function PhaseHeader({ onStop }: { onStop: () => void }) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const phase = useSlideStore((s) => s.phase);
  const sessionStatus = useSlideStore((s) => s.sessionStatus);
  const agentRound = useSlideStore((s) => s.agentRound);
  const agentMaxRounds = useSlideStore((s) => s.agentMaxRounds);
  const activity = useSlideStore((s) => s.activity);

  if (!activeProject) return null;

  const running = sessionStatus === 'running';
  const waiting = sessionStatus === 'waiting_user';
  const title = SLIDE_PHASE_STATUS_COPY[phase];
  const round = latestRound(activity) || agentRound || 0;
  const max = agentMaxRounds > 0 ? agentMaxRounds : DEFAULT_SLIDE_AGENT_MAX_ROUNDS;
  const lastLabel = lastToolActivityLabel(activity);

  // Live subline: the single most important thing happening right now.
  let subline: string | null = null;
  if (running) {
    subline = round > 0 ? `Round ${round}/${max}` : 'Connecting to model…';
  } else if (waiting) {
    subline = 'Waiting for your answer';
  } else if (phase === 'plan_ready') {
    subline = 'Brief & design ready';
  } else if (sessionStatus === 'stopped') {
    subline = 'Generation stopped';
  } else if (sessionStatus === 'error') {
    subline = 'Something went wrong';
  } else if (phase === 'ready') {
    subline = 'Deck ready';
  }

  return (
    <div className="shrink-0 border-b border-border/70 bg-background/85 px-3 py-2.5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {/* Status node — small live pulse for running/waiting, quiet grounded dot otherwise. */}
          <span
            aria-hidden
            className={`relative mt-px h-2 w-2 shrink-0 rounded-full ${
              running
                ? 'bg-primary'
                : waiting
                  ? 'bg-amber-400'
                  : phase === 'ready' || phase === 'plan_ready'
                    ? 'bg-success'
                    : sessionStatus === 'error'
                      ? 'bg-destructive'
                      : 'bg-muted-foreground/40'
            } ${running || waiting ? 'animate-pulse motion-reduce:animate-none' : ''}`}
          />

          <div className="min-w-0">
            <p className="truncate text-2xs font-semibold uppercase tracking-[0.14em] text-foreground">
              {title}
            </p>
            {subline && (
              <p
                role="status"
                className="truncate text-2xs text-muted-foreground"
                title={subline}
              >
                {subline}
              </p>
            )}
          </div>
        </div>

        {running ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/85 text-destructive-foreground shadow-sm transition-colors duration-150 hover:bg-destructive active:scale-95"
            title="Stop generating"
            aria-label="Stop generating"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
        ) : waiting ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 text-2xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/10"
            title="Cancel and stop waiting"
            aria-label="Cancel and stop waiting"
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
            <span className="hidden min-[400px]:inline">Cancel</span>
          </button>
        ) : null}
      </div>

      {lastLabel && (running || waiting) && (
        <p className="mt-1.5 truncate text-2xs text-muted-foreground/70" title={lastLabel}>
          <span className="text-muted-foreground/50">Last:&nbsp;</span>
          {lastLabel}
        </p>
      )}
    </div>
  );
}
