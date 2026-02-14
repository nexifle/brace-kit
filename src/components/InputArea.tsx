import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import { useChat } from '../hooks/useChat.ts';
import { useFileAttachments } from '../hooks/useFileAttachments.ts';
import { FilePreview } from './FilePreview.tsx';
import { SelectionPreview } from './SelectionPreview.tsx';
import { PageContextPreview } from './PageContextPreview.tsx';

export function InputArea() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const store = useStore();
  const { sendMessage, stopStreaming } = useChat();
  const { handleFileSelect } = useFileAttachments();
  const providerInfo = useProviderInfo();

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
      chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }).then((response) => {
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
            title="Attach page context"
            onClick={handleAttachClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <button
            id="btn-upload"
            className="input-icon-btn"
            title="Upload file (image, txt, csv, pdf)"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
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
          placeholder="Ask about this page..."
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={store.isStreaming}
        />
        {store.isStreaming ? (
          <button id="btn-stop" className="stop-btn" onClick={stopStreaming} title="Stop generating">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
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
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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

function useProviderInfo() {
  const store = useStore();
  const { PROVIDER_PRESETS } = require('../providers.ts');

  const provider = PROVIDER_PRESETS[store.providerConfig.providerId] || { name: 'Custom' };
  const providerName = provider?.name || 'Custom';
  const model = store.providerConfig.model || provider?.defaultModel || '';
  const isConfigured = !!store.providerConfig.apiKey;

  return { providerName, model, isConfigured };
}
