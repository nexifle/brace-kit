import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { StreamingBubble } from './message/StreamingBubble.tsx';
import { ToolMessage, ToolMessageGroup, ToolMessageData } from './ToolMessage.tsx';
import { useChat } from '../hooks';
import type { Message } from '../types/index.ts';
import { cn } from '../utils/cn.ts';
import { useLayoutMode } from './LayoutModeContext.tsx';

export function MessageList() {
  const messages = useStore((state) => state.messages);
  const isStreaming = useStore((state) => state.isStreaming);
  const preferences = useStore((state) => state.preferences);
  const { branchFrom, regenerateFrom, editMessage } = useChat();
  const { isTabLayout } = useLayoutMode();
  const messagesEndRef = useRef<HTMLDivElement>(null);
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

  // Group consecutive tool messages for compact mode
  const processedMessages = useMemo(() => {
    const result: Array<{
      type: 'message' | 'tool-group';
      message?: Message;
      index?: number;
      tools?: ToolMessageData[];
    }> = [];

    let i = 0;
    while (i < messages.length) {
      const msg = messages[i];

      if (msg.role === 'tool') {
        // Skip 'Calling...' messages
        if (msg.content.includes('Calling...')) {
          i++;
          continue;
        }

        // In compact mode, group consecutive tool messages
        if (preferences.toolMessageDisplay === 'compact') {
          const toolGroup: ToolMessageData[] = [];
          let j = i;

          // Collect all consecutive tool messages
          while (j < messages.length && messages[j].role === 'tool') {
            const toolMsg = messages[j];
            // Skip 'Calling...' in the middle of group
            if (!toolMsg.content.includes('Calling...')) {
              toolGroup.push({
                name: toolMsg.name || 'unknown',
                content: toolMsg.content,
                toolCallId: toolMsg.toolCallId,
                toolArguments: toolMsg.toolArguments,
                isCachedResult: toolMsg.isCachedResult,
              });
            }
            j++;
          }

          if (toolGroup.length > 0) {
            result.push({
              type: 'tool-group',
              tools: toolGroup,
            });
          }
          i = j;
        } else {
          // Detailed mode: render tool messages individually
          result.push({
            type: 'message',
            message: msg,
            index: i,
          });
          i++;
        }
      } else {
        result.push({
          type: 'message',
          message: msg,
          index: i,
        });
        i++;
      }
    }

    return result;
  }, [messages, preferences.toolMessageDisplay]);

  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto flex flex-col gap-2 scrollbar-thin not-dark:bg-muted',
        isTabLayout ? 'px-4 py-6 sm:px-6' : 'px-3 py-4',
      )}
      ref={containerRef}
      onScroll={handleScroll}
    >
      <div className={cn('flex w-full flex-col gap-2', isTabLayout && 'mx-auto max-w-5xl')}>
        {processedMessages.map((item, idx) => {
          if (item.type === 'tool-group' && item.tools) {
            return (
              <ToolMessageGroup
                key={`tool-group-${idx}`}
                tools={item.tools}
                mode={preferences.toolMessageDisplay}
              />
            );
          }

          if (item.message) {
            const msg = item.message;

            // Hide empty assistant messages (e.g., those that only carry tool calls or are residues)
            if (msg.role === 'assistant') {
              const hasContent = msg.content || msg.displayContent || msg.reasoningContent;
              const hasAssets = msg.generatedImages?.length || msg.attachments?.length || msg.summary || msg.groundingMetadata;

              if (!hasContent && !hasAssets) {
                return null;
              }
            }

            // For tool messages in detailed mode
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
                messageIndex={item.index ?? idx}
                onBranch={branchFrom}
                onRegenerate={regenerateFrom}
                onEdit={editMessage}
              />
            );
          }

          return null;
        })}
        {isStreaming && <StreamingBubble />}
        <div ref={messagesEndRef} style={{ height: '20px' }} />
      </div>
    </div>
  );
}
