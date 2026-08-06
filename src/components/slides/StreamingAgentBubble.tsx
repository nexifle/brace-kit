import { useEffect, useRef, useState } from 'react';
import { Bot, Brain, ChevronRight } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';
import { LoadingDots } from '../ui/LoadingDots.tsx';
import { isStreamingAgentActive } from '../../utils/slideStreaming.ts';

/**
 * Live streaming assistant bubble (US-039, PRD Amendment A.8).
 *
 * Shows an "Agent" bubble while a model round is actively generating:
 *  - `streamingText` non-empty          → live text + caret
 *  - empty after connect (round started, no text/tool yet) → "Thinking…" dots
 *  - `streamingReasoning` non-empty     → collapsible "Thinking" section above
 *
 * Gating: the bubble is shown only while the LATEST activity row is an OPEN
 * `model_round_started` (status 'running'). The instant the round commits — a
 * `tool_started` row, or a `model_round_completed` on a clean turn — the last
 * row changes and the bubble hides, so it "clears/commits when the turn ends"
 * instead of lingering on the accumulated `streamingText` buffer (which the
 * store does NOT clear between rounds of the same phase).
 */
export function StreamingAgentBubble() {
  const streamingText = useSlideStore((s) => s.streamingText);
  const streamingReasoning = useSlideStore((s) => s.streamingReasoning);
  const sessionStatus = useSlideStore((s) => s.sessionStatus);
  const activity = useSlideStore((s) => s.activity);
  const [reasonOpen, setReasonOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const prevLive = useRef(false);
  // streamingText is NOT cleared between rounds of the same phase, so without a
  // per-round slice the bubble would show the PREVIOUS round's leftover text the
  // instant a new round opens (A.8 #2 wants "empty stream -> Thinking dots"
  // until this round actually emits). Capture the buffer as a prior-rounds
  // prefix whenever a new round opens (or the buffer shrank, e.g. a clear on
  // ask-resume), and render only the text past it.
  const [roundBoundary, setRoundBoundary] = useState<{
    round: number;
    prefix: string;
  } | null>(null);

  // A live model round is one whose `model_round_started` row is still open.
  const liveRound = isStreamingAgentActive(sessionStatus, activity);
  const thisRound = activity[activity.length - 1]?.round ?? 0;

  // Bring the newly-appeared bubble into view once per round (don't fight a
  // user mid-scroll by re-aiming on every token).
  useEffect(() => {
    if (liveRound && !prevLive.current) {
      rootRef.current?.scrollIntoView({ block: 'nearest' });
    }
    prevLive.current = liveRound;
  }, [liveRound]);

  // Track the round-boundary prefix: re-baseline when a new round opens or the
  // buffer shrank (cleared on ask resume / new phase). Return the SAME object
  // when unchanged so the state update bails out instead of re-rendering on
  // every streaming append.
  useEffect(() => {
    if (!liveRound) {
      setRoundBoundary(null);
      return;
    }
    setRoundBoundary((b) =>
      b && b.round === thisRound && streamingText.length >= b.prefix.length
        ? b
        : { round: thisRound, prefix: streamingText },
    );
  }, [liveRound, thisRound, streamingText]);

  if (!liveRound) return null;
  const roundText =
    roundBoundary && roundBoundary.round === thisRound
      ? streamingText.slice(roundBoundary.prefix.length)
      : '';
  const hasText = roundText.length > 0;

  return (
    <div
      ref={rootRef}
      data-streaming-agent="true"
      className="flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none"
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
        title="Agent"
        aria-label="Agent"
      >
        <Bot size={12} />
      </span>

      <div className="min-w-0 flex-1 rounded-lg rounded-bl-sm border border-border bg-muted/30 px-3 py-2">
        {streamingReasoning && (
          <div className="mb-1.5">
            <button
              type="button"
              onClick={() => setReasonOpen((o) => !o)}
              aria-expanded={reasonOpen}
              className="flex items-center gap-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Brain size={11} />
              Thinking
              <ChevronRight
                size={11}
                className={`text-muted-foreground/60 transition-transform duration-200 ${
                  reasonOpen ? 'rotate-90' : ''
                }`}
              />
            </button>
            {reasonOpen && (
              <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground animate-in fade-in duration-150 motion-reduce:animate-none">
                {streamingReasoning}
              </div>
            )}
          </div>
        )}

        {hasText ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
            {roundText}
            <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-[2px] animate-pulse rounded bg-primary/70 motion-reduce:animate-none" />
          </p>
        ) : (
          <LoadingDots />
        )}
      </div>
    </div>
  );
}
