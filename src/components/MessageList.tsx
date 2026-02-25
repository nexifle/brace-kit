import { useEffect, useRef, useCallback, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { ToolMessage, ToolMessageGroup, ToolMessageData } from './ToolMessage.tsx';
import { useChat } from '../hooks';
import type { Message } from '../types/index.ts';

export function MessageList() {
  const messages = useStore((state) => state.messages);
  const isStreaming = useStore((state) => state.isStreaming);
  const streamingContent = useStore((state) => state.streamingContent);
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);
  const preferences = useStore((state) => state.preferences);
  const { branchFrom, regenerateFrom, editMessage } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);
  const isProgrammaticScrollRef = useRef(false);

  const isNearBottom = useCallback(() => {
    if (!containerRef.current) return true;
    const container = containerRef.current;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 100;
  }, []);

  const handleScroll = useCallback(() => {
    // Abaikan scroll event yang dipicu oleh kode kita sendiri
    if (isProgrammaticScrollRef.current) return;
    if (!containerRef.current) return;

    if (isNearBottom()) {
      // User scroll balik ke bawah → aktifkan kembali autoscroll
      isUserScrollingRef.current = false;
    } else {
      // User scroll ke atas → jeda autoscroll
      isUserScrollingRef.current = true;
    }
  }, [isNearBottom]);

  const scrollToBottom = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        isProgrammaticScrollRef.current = true;
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        // Double-rAF: reset flag setelah browser selesai memproses scroll event
        requestAnimationFrame(() => {
          isProgrammaticScrollRef.current = false;
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!isUserScrollingRef.current) {
      scrollToBottom();
    }
  }, [streamingContent, isStreaming, scrollToBottom]);

  useEffect(() => {
    // Pesan baru masuk (user kirim pesan / AI selesai) → selalu reset dan scroll ke bawah,
    // mengabaikan apakah user sedang scroll ke atas atau tidak
    isUserScrollingRef.current = false;
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
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
      className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2 scrollbar-thin not-dark:bg-muted"
      ref={containerRef}
      onScroll={handleScroll}
    >
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
      {isStreaming && (streamingContent || streamingReasoningContent) && (
        <MessageBubble message={{ role: 'assistant', content: streamingContent }} isStreaming />
      )}
      <div ref={messagesEndRef} style={{ height: '20px' }} />
    </div>
  );
}
