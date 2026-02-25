import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { ToolMessage } from './ToolMessage.tsx';
import { useChat } from '../hooks';

export function MessageList() {
  const messages = useStore((state) => state.messages);
  const isStreaming = useStore((state) => state.isStreaming);
  const streamingContent = useStore((state) => state.streamingContent);
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);
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

  return (
    <div
      className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-2 scrollbar-thin"
      ref={containerRef}
      onScroll={handleScroll}
    >
      {messages.map((msg, idx) => {
        if (msg.role === 'tool') {
          // Hide 'Calling...' status to avoid persistent 'Running' indicators if synchronization fails
          if (msg.content.includes('Calling...')) {
            return null;
          }
          return (
            <ToolMessage
              key={idx}
              name={msg.name || 'unknown'}
              content={msg.content}
              toolCallId={msg.toolCallId}
              toolArguments={msg.toolArguments}
              isCachedResult={msg.isCachedResult}
            />
          );
        }
        // Hide empty assistant messages (e.g., those that only carry tool calls or are residues)
        if (msg.role === 'assistant') {
          const hasContent = msg.content || msg.displayContent || msg.reasoningContent;
          const hasAssets = msg.generatedImages?.length || msg.attachments?.length || msg.summary || msg.groundingMetadata;

          if (!hasContent && !hasAssets) {
            return null;
          }
        }

        return (
          <MessageBubble
            key={idx}
            message={msg}
            messageIndex={idx}
            onBranch={branchFrom}
            onRegenerate={regenerateFrom}
            onEdit={editMessage}
          />
        );
      })}
      {isStreaming && (streamingContent || streamingReasoningContent) && (
        <MessageBubble message={{ role: 'assistant', content: streamingContent }} isStreaming />
      )}
      <div ref={messagesEndRef} style={{ height: '20px' }} />
    </div>
  );
}
