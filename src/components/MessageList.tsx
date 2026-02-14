import { useEffect, useRef } from 'react';
import { useStore } from '../store/index.ts';
import { MessageBubble } from './MessageBubble.tsx';
import { ToolMessage } from './ToolMessage.tsx';

export function MessageList() {
  const messages = useStore((state) => state.messages);
  const isStreaming = useStore((state) => state.isStreaming);
  const streamingContent = useStore((state) => state.streamingContent);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 10;
    
    isUserScrollingRef.current = !isAtBottom;
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 150);
  };

  useEffect(() => {
    if (containerRef.current && (!isUserScrollingRef.current || isStreaming)) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [streamingContent, isStreaming]);

  useEffect(() => {
    if (containerRef.current && !isUserScrollingRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length]);

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
            />
          );
        }
        return <MessageBubble key={idx} message={msg} />;
      })}
      {isStreaming && messages.length > 0 && messages[messages.length - 1].role !== 'tool' && (
        <MessageBubble message={{ role: 'assistant', content: streamingContent }} isStreaming />
      )}
      <div ref={messagesEndRef} style={{ height: '20px' }} />
    </div>
  );
}
