import { useRef, useEffect, useCallback, useState } from 'react';
import { renderMarkdown } from '../utils/markdown.ts';
import { copyToClipboard } from '../utils/formatters.ts';
import type { Message } from '../types/index.ts';

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  messageIndex?: number;
  onBranch?: (index: number) => void;
  onRegenerate?: (index: number) => void;
}

export function MessageBubble({ message, isStreaming, messageIndex, onBranch, onRegenerate }: MessageBubbleProps) {
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
    if (!ref) return;

    ref.addEventListener('click', handleCopyCode as unknown as EventListener);

    return () => {
      ref.removeEventListener('click', handleCopyCode as unknown as EventListener);
    };
  }, [handleCopyCode]);

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
        {message.pageContext && (
          <div className="page-attachment">
            <div className="page-attachment-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
            </div>
            <div className="page-attachment-info">
              <div className="page-attachment-title">{message.pageContext.pageTitle}</div>
              <div className="page-attachment-url">{message.pageContext.pageUrl}</div>
            </div>
          </div>
        )}
        {message.selectedText && (
          <div className="selection-attachment">
            <div className="selection-attachment-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h10"/>
              </svg>
            </div>
            <div className="selection-attachment-info">
              <div className="selection-attachment-text">
                {message.selectedText.selectedText.length > 100 
                  ? `${message.selectedText.selectedText.substring(0, 100)}...` 
                  : message.selectedText.selectedText}
              </div>
              <div className="selection-attachment-source">From: {message.selectedText.pageTitle}</div>
            </div>
          </div>
        )}
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
        <MessageActions
          content={message.content}
          messageIndex={messageIndex}
          onBranch={onBranch}
        />
      )}
      {message.role === 'user' && !isStreaming && (messageIndex !== undefined) && (
        <div className="message-actions">
          {onRegenerate && (
            <button
              className="msg-action-btn"
              onClick={() => onRegenerate(messageIndex)}
              title="Regenerate response"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6"/>
                <path d="M1 20v-6h6"/>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
              </svg>
              <span>Regenerate</span>
            </button>
          )}
          {onBranch && (
            <button
              className="msg-action-btn"
              onClick={() => onBranch(messageIndex)}
              title="Branch from here"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="6" y1="3" x2="6" y2="15"/>
                <circle cx="18" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
              <span>Branch</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function MessageActions({
  content,
  messageIndex,
  onBranch,
}: {
  content: string;
  messageIndex?: number;
  onBranch?: (index: number) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <div className="message-actions">
      <button className={`msg-action-btn ${copied ? 'copied' : ''}`} onClick={handleCopy} title="Copy response">
        {copied ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>Copied!</span>
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            <span>Copy</span>
          </>
        )}
      </button>
      {onBranch && messageIndex !== undefined && (
        <button
          className="msg-action-btn"
          onClick={() => onBranch(messageIndex)}
          title="Branch from here"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="6" y1="3" x2="6" y2="15"/>
            <circle cx="18" cy="6" r="3"/>
            <circle cx="6" cy="18" r="3"/>
            <path d="M18 9a9 9 0 0 1-9 9"/>
          </svg>
          <span>Branch</span>
        </button>
      )}
    </div>
  );
}
