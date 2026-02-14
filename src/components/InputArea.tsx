import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/index.ts';
import { useChat } from '../hooks/useChat.ts';
import { useFileAttachments } from '../hooks/useFileAttachments.ts';
import { usePageContext } from '../hooks/usePageContext.ts';
import { useProvider } from '../hooks/useProvider.ts';
import { FilePreview } from './FilePreview.tsx';
import { SelectionPreview } from './SelectionPreview.tsx';
import { PageContextPreview } from './PageContextPreview.tsx';

export function InputArea() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCursorPosRef = useRef<number>(0);
  const store = useStore();
  const { sendMessage, stopStreaming } = useChat();
  const { handleFileSelect, handlePaste } = useFileAttachments();
  const { selectedText } = usePageContext();
  const { providerInfo } = useProvider();

  const placeholder = store.pageContext
    ? 'Ask about this page...'
    : store.attachments.length > 0
      ? 'Ask about attached files...'
      : selectedText
        ? 'Ask about the selected text...'
        : 'What\'s on your mind?';

  const { quotedText, setQuotedText } = store;

  const updateCursorPos = useCallback(() => {
    if (textareaRef.current) {
      lastCursorPosRef.current = textareaRef.current.selectionStart;
    }
  }, []);

  useEffect(() => {
    if (quotedText) {
      const formattedQuote = quotedText
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n') + '\n\n';

      const pos = lastCursorPosRef.current;
      const before = text.substring(0, pos);
      const after = text.substring(pos);
      setText(before + formattedQuote + after);
      setQuotedText(null);

      // Auto-focus and resize
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newPos = pos + formattedQuote.length;

        // Give React a moment to update the value before measuring scrollHeight
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 0);
      }
    }
  }, [quotedText, setQuotedText, text]);

  const handleSend = useCallback(() => {
    if (!text.trim() && store.attachments.length === 0) return;
    sendMessage(text);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, store.attachments.length, sendMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
  }, []);

  const handleAttachClick = useCallback(() => {
    // Toggle page context
    if (store.pageContext) {
      store.setPageContext(null);
    } else {
      chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }).then((response: any) => {
        if (response?.error) {
          store.addMessage({ role: 'error', content: `Failed to read page: ${response.error}` });
        } else {
          store.setPageContext(response);
        }
      });
    }
  }, [store.pageContext, store]);

  return (
    <div id="input-area">
      <PageContextPreview />
      <FilePreview />
      <SelectionPreview />
      <div className="input-row">
        <div className="input-actions">
          <button
            id="btn-attach"
            className={`input-icon-btn ${store.pageContext ? 'active' : ''}`}
            title="Add current page to context"
            onClick={handleAttachClick}
          >
            {/* Globe/page icon for "add current page" */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
          <button
            id="btn-upload"
            className="input-icon-btn"
            title="Attach file (image, txt, csv, pdf)"
            onClick={() => fileInputRef.current?.click()}
          >
            {/* Paperclip icon for file attachment */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,.txt,.csv,.pdf"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
          />
        </div>
        <textarea
          ref={textareaRef}
          id="chat-input"
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            updateCursorPos();
          }}
          onKeyUp={updateCursorPos}
          onMouseUp={updateCursorPos}
          onBlur={updateCursorPos}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onPaste={(e) => handlePaste(e.nativeEvent)}
          disabled={store.isStreaming}
        />
        {store.isStreaming ? (
          <button id="btn-stop" className="stop-btn" onClick={stopStreaming} title="Stop generating">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            id="btn-send"
            className="send-btn"
            onClick={handleSend}
            disabled={!text.trim() && store.attachments.length === 0}
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
      <div className="input-footer">
        <span id="provider-label" className="provider-badge">
          {providerInfo.isConfigured ? providerInfo.providerName : 'No provider configured'}
        </span>
        {providerInfo.model && (
          <span id="model-label" className="model-badge">{providerInfo.model}</span>
        )}
      </div>
    </div>
  );
}

