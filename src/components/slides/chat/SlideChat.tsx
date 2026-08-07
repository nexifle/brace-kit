import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, Presentation } from 'lucide-react';
import { useSlideStore } from '../../../store/slideStore.ts';
import { useStore } from '../../../store/index.ts';
import { buildSlideChatItems, type SlideChatItem } from '../../../utils/slideChatItems.ts';
import { slideIndexForTouch } from '../../../utils/slideFilesTouched.ts';

import { AskPrompt } from '../AskPrompt.tsx';
import { PlanReview } from '../PlanReview.tsx';
import {
  AgentActionRow,
  AgentErrorLine,
  AgentFileCard,
  AgentGroup,
  AgentPhaseEyebrow,
  AgentProse,
  AgentReasoningRow,
  AgentTurnFooter,
  ChatUserBubble,
} from './chatRows.tsx';

const NEAR_BOTTOM_PX = 80;

function itemKey(item: SlideChatItem, index: number): string {
  // Activity emitters reuse phase/round ids across repeated runs of the same
  // phase; suffix with list index so React keys stay unique in the stream.
  switch (item.type) {
    case 'ask_card':
      return `ask_card_${index}`;
    case 'plan_card':
      return `plan_card_${index}`;
    case 'group':
      return `${item.id}_${index}`;
    default:
      return 'id' in item ? `${item.id}_${index}` : `idx_${index}`;
  }
}


function EmptyChat({ onChip }: { onChip?: (text: string) => void }) {
  const chips = [
    'Pitch deck for a B2B SaaS launch',
    'Quarterly business review, 8 slides',
    'Product roadmap presentation',
  ];
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10 px-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
        <Presentation size={22} />
      </div>
      <p className="text-sm font-semibold text-foreground">No deck yet</p>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
        Describe your deck. Every agent step stays in this chat.
      </p>
      {onChip ? (
        <div className="flex flex-col gap-1.5 w-full max-w-[280px] mt-1">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChip(c)}
              className="rounded-full border border-border/70 bg-card/40 px-3 py-1.5 text-left text-[12px] text-muted-foreground hover:border-primary/30 hover:text-foreground transition-colors"
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SlideChat({
  onBuild,
  onAnswer,
  onFillComposer,
  onRetry,
  blocked,
}: {
  onBuild: () => void;
  onAnswer: (projectId: string, answer: string) => void;
  onFillComposer?: (text: string) => void;
  /** Re-run the failed plan/build with original context (no "continue" turn). */
  onRetry?: () => void;
  blocked?: boolean;
}) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const messages = useSlideStore((s) => s.messages);
  const activity = useSlideStore((s) => s.activity);
  const streamingText = useSlideStore((s) => s.streamingText);
  const streamingReasoning = useSlideStore((s) => s.streamingReasoning);
  const sessionStatus = useSlideStore((s) => s.sessionStatus);
  const phase = useSlideStore((s) => s.phase);
  const pendingAsk = useSlideStore((s) => s.pendingAsk);
  const busy = useSlideStore((s) => s.busy);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const selectSlide = useSlideStore((s) => s.selectSlide);
  const modelLabel = useStore((s) => s.providerConfig.model || s.providerConfig.providerId || '');

  const items = useMemo(
    () =>
      buildSlideChatItems({
        messages,
        activity,
        streamingText,
        streamingReasoning,
        sessionStatus,
        phase,
        pendingAsk: !!pendingAsk,
        modelLabel: modelLabel || undefined,
      }),
    [
      messages,
      activity,
      streamingText,
      streamingReasoning,
      sessionStatus,
      phase,
      pendingAsk,
      modelLabel,
    ],
  );


  const scrollerRef = useRef<HTMLDivElement>(null);
  /** When false, user scrolled away — do not fight their scroll position. */
  const stickBottomRef = useRef(true);
  const isProgrammaticScrollRef = useRef(false);
  const prevScrollTopRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || !stickBottomRef.current) return;
    isProgrammaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    prevScrollTopRef.current = el.scrollTop;
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current = false;
    });
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      const near = dist <= NEAR_BOTTOM_PX;
      const scrollingUp = el.scrollTop < prevScrollTopRef.current;
      prevScrollTopRef.current = el.scrollTop;

      if (near) {
        stickBottomRef.current = true;
        setShowJump(false);
      } else if (scrollingUp) {
        stickBottomRef.current = false;
        setShowJump(true);
      } else {
        setShowJump(true);
      }
    };

    // Wheel intent fires before layout scroll; unstick immediately so a
    // concurrent stream tick cannot pin scrollTop back to the bottom mid-gesture.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        stickBottomRef.current = false;
        setShowJump(true);
      }
    };
    const onTouchStart = () => {
      prevScrollTopRef.current = el.scrollTop;
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [items, streamingText, streamingReasoning, scrollToBottom]);

  const jumpLatest = () => {
    stickBottomRef.current = true;
    setShowJump(false);
    scrollToBottom();
  };

  const onPathClick = (path: string) => {
    const idx = slideIndexForTouch({ path }, deckSlides);
    if (idx >= 0) selectSlide(idx);
  };

  const renderItem = (item: SlideChatItem): ReactNode => {
    switch (item.type) {
      case 'user':
        return <ChatUserBubble content={item.content} />;
      case 'reasoning':
        return <AgentReasoningRow item={item} />;
      case 'prose':
        return <AgentProse content={item.content} live={item.live} />;
      case 'action':
        return <AgentActionRow event={item.event} />;
      case 'file_card':
        return <AgentFileCard item={item} onPathClick={onPathClick} />;
      case 'turn_footer':
        return <AgentTurnFooter item={item} onRetry={onRetry} />;
      case 'error':
        return <AgentErrorLine content={item.content} />;
      case 'phase_eyebrow':
        return <AgentPhaseEyebrow label={item.label} />;
      case 'group':
        return (
          <AgentGroup
            item={item}
            renderChild={(c) => renderItem(c)}
          />
        );
      case 'ask_card':
        return pendingAsk ? (
          <AskPrompt
            ask={pendingAsk}
            busy={busy}
            onSubmit={(answer) => onAnswer(pendingAsk.projectId, answer)}
          />
        ) : null;
      case 'plan_card':
        return <PlanReview onBuild={onBuild} blocked={blocked} />;
      default:
        return null;
    }
  };

  const empty = !activeProject && items.length === 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        role="log"
        aria-label="Slide agent conversation"
        aria-live="polite"
        aria-relevant="additions"
      >

        {empty ? (
          <EmptyChat onChip={onFillComposer} />
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={itemKey(item, i)}>{renderItem(item)}</div>
            ))}
          </div>
        )}
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={jumpLatest}
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background/95 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-md backdrop-blur hover:text-foreground"
        >
          <ArrowDown size={12} />
          Latest
        </button>
      ) : null}
    </div>
  );
}
