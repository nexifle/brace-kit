import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { StreamingBubble } from './message/StreamingBubble.tsx';
import { AgentActivityBlock } from './message/AgentActivityBlock.tsx';
import { ToolMessage } from './ToolMessage.tsx';
import { useChat } from '../hooks';
import { groupMessagesForDisplay } from '../utils/toolActivityGroup.ts';
import { AskPrompt } from './slides/AskPrompt.tsx';

export function MessageList() {
  const messages = useStore((state) => state.messages);
  const isStreaming = useStore((state) => state.isStreaming);
  const streamingContent = useStore((state) => state.streamingContent);
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);
  const preferences = useStore((state) => state.preferences);
  const mode = useStore((state) => state.mode);
  const pendingAsk = useStore((state) => state.pendingAsk);
  const { branchFrom, regenerateFrom, editMessage, answerAsk, cancelAsk } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const askPromptWrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollRafRef = useRef<number | undefined>(undefined);
  const isProgrammaticScrollRef = useRef(false);
  // Ref for throttled scroll during streaming
  const lastScrollTimeRef = useRef(0);
  const pendingScrollRef = useRef(false);
  // Track previous scrollTop to detect scroll direction
  const prevScrollTopRef = useRef(0);

  const isNearBottom = useCallback(() => {
    if (!containerRef.current) return true;
    const container = containerRef.current;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 40;
  }, []);

  const handleScroll = useCallback(() => {
    // Ignore scroll events triggered by our own programmatic scrolls
    if (isProgrammaticScrollRef.current) return;
    if (!containerRef.current) return;

    const container = containerRef.current;
    const isScrollingUp = container.scrollTop < prevScrollTopRef.current;
    prevScrollTopRef.current = container.scrollTop;

    if (isNearBottom()) {
      // User scrolled back to bottom — re-enable autoscroll
      isUserScrollingRef.current = false;
    } else if (isScrollingUp) {
      // User scrolled up — pause autoscroll
      isUserScrollingRef.current = true;
    }
  }, [isNearBottom]);

  // Smooth scroll to bottom with throttling to prevent jitter
  const scrollToBottom = useCallback((immediate = false) => {
    // For immediate scrolls (new messages), skip throttling
    if (immediate) {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      scrollRafRef.current = requestAnimationFrame(() => {
        if (containerRef.current) {
          isProgrammaticScrollRef.current = true;
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
          requestAnimationFrame(() => {
            isProgrammaticScrollRef.current = false;
          });
        }
      });
      return;
    }

    // For streaming scrolls, use throttling to prevent jitter
    const now = performance.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;
    const MIN_SCROLL_INTERVAL = 16; // ~60fps max

    if (timeSinceLastScroll < MIN_SCROLL_INTERVAL) {
      // Throttle: schedule a scroll if not already pending
      if (!pendingScrollRef.current) {
        pendingScrollRef.current = true;
        setTimeout(() => {
          pendingScrollRef.current = false;
          if (!isUserScrollingRef.current && containerRef.current) {
            lastScrollTimeRef.current = performance.now();
            isProgrammaticScrollRef.current = true;
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
            requestAnimationFrame(() => {
              isProgrammaticScrollRef.current = false;
            });
          }
        }, MIN_SCROLL_INTERVAL - timeSinceLastScroll);
      }
      return;
    }

    // Enough time has passed, scroll immediately
    lastScrollTimeRef.current = now;
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      if (containerRef.current && !isUserScrollingRef.current) {
        isProgrammaticScrollRef.current = true;
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
    });
  }, []);

  // Wheel event for immediate upward scroll intent detection.
  // Fires BEFORE the scroll event, preventing the race condition where
  // MutationObserver queues a scrollToBottom before isUserScrollingRef is set.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        isUserScrollingRef.current = true;
      }
    };

    container.addEventListener('wheel', onWheel, { passive: true });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  // Use MutationObserver instead of ResizeObserver for streaming
  // It's more efficient and triggers less frequently
  useEffect(() => {
    if (!isStreaming) return;

    const container = containerRef.current;
    if (!container) return;

    // MutationObserver to detect content changes in streaming bubble
    const mutationObserver = new MutationObserver(() => {
      if (!isUserScrollingRef.current) {
        scrollToBottom();
      }
    });

    // Observe the container for child list changes (streaming bubble content)
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [isStreaming, scrollToBottom]);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];

    if (lastMessage.role === 'user') {
      // User sent a new message — always scroll to bottom and reset state
      isUserScrollingRef.current = false;
      scrollToBottom(true);
    } else if (!isUserScrollingRef.current) {
      // Tool call / assistant message arrived during streaming — only scroll
      // if user is not scrolled up (do not force-reset their scroll state)
      scrollToBottom(true);
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // AskPrompt sits after the transcript and can grow (wizard steps, confirm overlay).
  // Scroll it into view when it appears, and keep the chat pinned to the bottom
  // while its height changes unless the user has scrolled away.
  useEffect(() => {
    if (!pendingAsk) return;
    isUserScrollingRef.current = false;
    scrollToBottom(true);

    const el = askPromptWrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (isUserScrollingRef.current) return;
      scrollToBottom(true);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pendingAsk?.id, scrollToBottom]);

  const processedMessages = useMemo(
    () => groupMessagesForDisplay(messages, preferences.toolMessageDisplay === 'compact'),
    [messages, preferences.toolMessageDisplay],
  );

  let lastToolGroupIndex = -1;
  for (let i = processedMessages.length - 1; i >= 0; i--) {
    if (processedMessages[i].type === 'tool-group') {
      lastToolGroupIndex = i;
      break;
    }
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin not-dark:bg-muted"
      ref={containerRef}
      onScroll={handleScroll}
    >
      <div className={`mx-auto w-full flex flex-col gap-2 ${mode === 'tab' ? 'max-w-[900px]' : ''}`}>
        {processedMessages.map((item, idx) => {
        if (item.type === 'tool-group') {
          const isLastGroup = idx === lastToolGroupIndex;
          return (
            <AgentActivityBlock
              key={`tool-group-${item.firstToolIndex}`}
              tools={item.tools}
              entries={item.entries}
              isActive={Boolean(isStreaming && isLastGroup)}
              startedAt={item.startedAt}
              endedAt={item.endedAt}
            />
          );
        }

        const msg = item.message;
        if (msg.role === 'tool') {
          return (
            <ToolMessage
              key={item.index}
              name={msg.name || 'unknown'}
              content={msg.content}
              toolCallId={msg.toolCallId}
              toolArguments={msg.toolArguments}
              isCachedResult={msg.isCachedResult}
              mode="detailed"
            />
          );
        }

        return (
          <MessageBubble
            key={item.index}
            message={msg}
            messageIndex={item.index}
            onBranch={branchFrom}
            onRegenerate={regenerateFrom}
            onEdit={editMessage}
          />
        );
      })}
        {pendingAsk && (
          <div ref={askPromptWrapRef}>
            <AskPrompt
              ask={pendingAsk}
              busy={isStreaming}
              onSubmit={(answer, attachments) => { void answerAsk(answer, attachments); }}
              onCancel={() => { void cancelAsk(); }}
            />
          </div>
        )}
        {isStreaming &&
          (streamingContent ||
            streamingReasoningContent ||
            !processedMessages.some((p) => p.type === 'tool-group')) && <StreamingBubble />}
        <div ref={messagesEndRef} style={{ height: '20px' }} />
      </div>
    </div>
  );
}
