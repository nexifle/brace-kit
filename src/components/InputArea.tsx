import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../store/index.ts';
import { useChat } from '../hooks/useChat.ts';
import { useFileAttachments } from '../hooks/useFileAttachments.ts';
import { usePageContext } from '../hooks/usePageContext.ts';
import { useProvider } from '../hooks/useProvider.ts';
import { FilePreview } from './FilePreview.tsx';
import { SelectionPreview } from './SelectionPreview.tsx';
import { PageContextPreview } from './PageContextPreview.tsx';
import { XAI_IMAGE_MODELS, GEMINI_IMAGE_MODELS } from '../providers.ts';

export function InputArea() {
  const [text, setText] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState('auto');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastCursorPosRef = useRef<number>(0);
  const store = useStore();
  const { sendMessage, stopStreaming, estimateTokenCount } = useChat();
  const { handleFileSelect, handlePaste } = useFileAttachments();
  const { selectedText } = usePageContext();
  const { providerInfo } = useProvider();
  const currentModel = useStore((state) => state.providerConfig.model || '');
  const currentProviderId = useStore((state) => state.providerConfig.providerId || '');
  const isXAIImageModel = currentProviderId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
  const isGeminiImageModel = currentProviderId === 'gemini' && GEMINI_IMAGE_MODELS.includes(currentModel);
  const isImageGenerationModel = isXAIImageModel || isGeminiImageModel;

  const tokens = estimateTokenCount(store.messages);
  const contextWindow = store.providerConfig.contextWindow || store.compactConfig.defaultContextWindow;
  const threshold = store.compactConfig.threshold;
  const usagePercent = (tokens / contextWindow) * 100;
  const compactThresholdPercent = (threshold * 100);
  const percentUntilCompact = Math.max(0, compactThresholdPercent - usagePercent);

  // Update default aspect ratio when provider changes (Gemini doesn't support 'auto')
  useEffect(() => {
    if (isGeminiImageModel && imageAspectRatio === 'auto') {
      setImageAspectRatio('1:1');
    }
  }, [isGeminiImageModel, imageAspectRatio]);

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
    sendMessage(text, isImageGenerationModel ? { aspectRatio: imageAspectRatio } : undefined);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, store.attachments.length, sendMessage, isXAIImageModel, imageAspectRatio]);

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
      {isImageGenerationModel && (
        <div className="image-options-row">
          <label className="image-options-label">Aspect Ratio:</label>
          <select
            className="image-options-select"
            value={imageAspectRatio}
            onChange={(e) => setImageAspectRatio(e.target.value)}
            disabled={store.isStreaming}
          >
            {isXAIImageModel && <option value="auto">auto (Model selects best)</option>}
            <option value="1:1">1:1 (Square)</option>
            <option value="16:9">16:9 (Landscape)</option>
            <option value="9:16">9:16 (Portrait)</option>
            <option value="4:3">4:3 (Standard)</option>
            <option value="3:4">3:4 (Portrait)</option>
            <option value="3:2">3:2 (Photo)</option>
            <option value="2:3">2:3 (Photo Portrait)</option>
            {isXAIImageModel && <option value="2:1">2:1 (Banner)</option>}
            {isXAIImageModel && <option value="1:2">1:2 (Header)</option>}
            {isGeminiImageModel && <option value="4:5">4:5 (Portrait)</option>}
            {isGeminiImageModel && <option value="5:4">5:4 (Landscape)</option>}
            {isGeminiImageModel && <option value="21:9">21:9 (Ultra-wide)</option>}
            {isXAIImageModel && <option value="19.5:9">19.5:9 (Modern Smartphone)</option>}
            {isXAIImageModel && <option value="9:19.5">9:19.5 (Smartphone Portrait)</option>}
            {isXAIImageModel && <option value="20:9">20:9 (Ultra-wide)</option>}
            {isXAIImageModel && <option value="9:20">9:20 (Ultra-wide Portrait)</option>}
          </select>
        </div>
      )}
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
          <button
            id="btn-prompt"
            className={`input-icon-btn ${store.showSystemPromptEditor ? 'active' : ''}`}
            title="System Prompt"
            onClick={() => store.setShowSystemPromptEditor(!store.showSystemPromptEditor)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
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
        {text.startsWith('/') && !text.includes(' ') && (
          <div className="slash-suggestions">
            {['/compact', '/rename'].filter(cmd => cmd.startsWith(text)).map(cmd => (
              <div
                key={cmd}
                className="slash-suggestion-item"
                onClick={() => {
                  setText(cmd);
                  textareaRef.current?.focus();
                }}
              >
                <div className="slash-command">{cmd}</div>
                <div className="slash-description">
                  {cmd === '/compact' ? 'Summarize and compress conversation' :
                    cmd === '/rename' ? 'Rename conversation based on history' : ''}
                </div>
              </div>
            ))}
            {['/compact', '/rename'].filter(cmd => cmd.startsWith(text)).length === 0 && (
              <div className="slash-suggestion-item disabled">
                <div className="slash-description">No matching commands</div>
              </div>
            )}
          </div>
        )}
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
        <div className="footer-left">
          <span id="provider-label" className="provider-badge">
            {providerInfo.isConfigured ? providerInfo.providerName : 'No provider configured'}
          </span>
          {providerInfo.model && (
            <span id="model-label" className="model-badge">{providerInfo.model}</span>
          )}
        </div>
        <div className="footer-right">
          {percentUntilCompact <= 15 && (
            <span
              className={`context-usage ${percentUntilCompact <= 5 ? 'critical' : percentUntilCompact <= 10 ? 'warning' : ''}`}
              title={`${tokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens used. Auto-compact at ${compactThresholdPercent}%.`}
            >
              {Math.round(percentUntilCompact)}% until autocompact
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

