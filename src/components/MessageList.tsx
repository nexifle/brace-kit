import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { ToolMessage } from './ToolMessage.tsx';
import { useChat } from '../hooks/useChat.ts';

export function MessageList() {
  const messages = useStore((state) => state.messages);
  const isStreaming = useStore((state) => state.isStreaming);
  const streamingContent = useStore((state) => state.streamingContent);
  const { branchFrom, regenerateFrom, editMessage } = useChat();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const rafRef = useRef<number | undefined>(undefined);

  const isNearBottom = useCallback(() => {
    if (!containerRef.current) return true;
    const container = containerRef.current;
    return container.scrollHeight - container.scrollTop - container.clientHeight < 50;
  }, []);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    isUserScrollingRef.current = !isNearBottom();
  }, [isNearBottom]);

  const scrollToBottom = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(() => {
    if (!isUserScrollingRef.current) {
      scrollToBottom();
    }
  }, [streamingContent, isStreaming, scrollToBottom]);

  useEffect(() => {
    if (!isUserScrollingRef.current) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <div id="messages" ref={containerRef} onScroll={handleScroll}>
      {messages.map((msg, idx) => {
        if (msg.role === 'tool') {
          return (
            <ToolMessage
              key={idx}
              name={msg.name || 'unknown'}
              content={msg.content}
              toolCallId={msg.toolCallId}
              toolArguments={msg.toolArguments}
            />
          );
        }
        // Hide empty assistant messages that only carry tool calls (used for API context only)
        if (msg.role === 'assistant' && !msg.content && msg.toolCalls && msg.toolCalls.length > 0 && !msg.generatedImages?.length) {
          return null;
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
      {isStreaming && messages.length > 0 && messages[messages.length - 1].role !== 'tool' && (
        <MessageBubble message={{ role: 'assistant', content: streamingContent }} isStreaming />
      )}
      <div ref={messagesEndRef} style={{ height: '20px' }} />
    </div>
  );
}
