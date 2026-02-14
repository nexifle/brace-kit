import { useRef, useEffect, useCallback } from 'react';
import { renderMarkdown, highlightCodeBlocks } from '../utils/markdown.ts';
import { copyToClipboard } from '../utils/formatters.ts';
import type { Message } from '../types/index.ts';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
}

export function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);

  const handleCopyCode = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-code-btn');
    if (!btn) return;

    const code = btn.getAttribute('data-code');
    if (!code) return;

    const decodedCode = code
      .replace(/&#10;/g, '\n')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    copyToClipboard(decodedCode).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1500);
    });
  }, []);

  useEffect(() => {
    const ref = bubbleRef.current;
    if (ref) {
      ref.addEventListener('click', handleCopyCode as unknown as EventListener);
      highlightCodeBlocks(ref);
    }
    return () => {
      if (ref) {
        ref.removeEventListener('click', handleCopyCode as unknown as EventListener);
      }
    };
  }, [handleCopyCode, message.content]);

  const roleLabel = message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'AI';

  if (isStreaming) {
    return (
      <div className={`message ${message.role}`}>
        <div className="message-role">{roleLabel}</div>
        <div className="message-bubble" ref={bubbleRef}>
          {message.content ? (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
          ) : (
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (message.role === 'assistant' || message.role === 'user') {
      return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />;
    }
    return <>{message.displayContent || message.content}</>;
  };

  return (
    <div className={`message ${message.role}`}>
      <div className="message-role">{roleLabel}</div>
      <div className="message-bubble" ref={bubbleRef}>
        {renderContent()}
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((att, idx) => (
              att.type === 'image' && (
                <img
                  key={idx}
                  src={att.data}
                  alt={att.name}
                  style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}
                  title={att.name}
                />
              )
            ))}
          </div>
        )}
      </div>
      {message.role === 'assistant' && !isStreaming && (
        <MessageActions content={message.content} />
      )}
    </div>
  );
}

function MessageActions({ content }: { content: string }) {
  const handleCopy = useCallback(() => {
    copyToClipboard(content);
  }, [content]);

  return (
    <div className="message-actions">
      <button className="msg-action-btn" onClick={handleCopy} title="Copy response">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
        </svg>
        <span>Copy</span>
      </button>
    </div>
  );
}
