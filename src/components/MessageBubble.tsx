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
      const contentToRender = message.displayContent || message.content;
      return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(contentToRender) }} />;
    }
    return <>{message.displayContent || message.content}</>;
  };

  const groundingChunks = message.groundingMetadata?.groundingChunks;

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
        {groundingChunks && groundingChunks.length > 0 && (
          <div className="grounding-citations">
            <div className="grounding-citations-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              Sources
            </div>
            <div className="grounding-citations-list">
              {groundingChunks.map((chunk, idx) => (
                chunk.web && (
                  <a
                    key={idx}
                    id={`cite-${idx + 1}`}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grounding-source"
                    title={chunk.web.uri}
                  >
                    <span>[{idx + 1}]</span>
                    <span>{chunk.web.title || new URL(chunk.web.uri).hostname}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                    </svg>
                  </a>
                )
              ))}
            </div>
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
