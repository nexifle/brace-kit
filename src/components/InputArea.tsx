import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { useChat } from '../hooks/useChat.ts';
import { useFileAttachments } from '../hooks/useFileAttachments.ts';
import { usePageContext } from '../hooks/usePageContext.ts';
import { useProvider } from '../hooks/useProvider.ts';
import { FilePreview } from './FilePreview.tsx';
import { SelectionPreview } from './SelectionPreview.tsx';
import { PageContextPreview } from './PageContextPreview.tsx';
import { ProviderPopover } from './ProviderPopover.tsx';
import { XAI_IMAGE_MODELS, GEMINI_IMAGE_MODELS } from '../providers.ts';

const SLASH_COMMANDS = [
  { cmd: '/compact', desc: 'Summarize and compress conversation' },
  { cmd: '/rename', desc: 'Rename conversation based on history' },
  { cmd: '/resume', desc: 'Resume previous conversation context' },
  { cmd: '/clear', desc: 'Clear conversation history' },
  { cmd: '/help', desc: 'Show available commands' },
];

export function InputArea() {
  const [text, setText] = useState('');
  const [imageAspectRatio, setImageAspectRatio] = useState('auto');
  const [showProviderPopover, setShowProviderPopover] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
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

  // Autocomplete suggestion logic
  const autocompleteSuggestion = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ')) return null;
    const match = SLASH_COMMANDS.find(c => c.cmd.startsWith(text) && c.cmd !== text);
    return match ? match.cmd : null;
  }, [text]);

  const filteredCommands = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ')) return [];
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(text));
  }, [text]);

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

  // Close popover on click outside
  useEffect(() => {
    if (!showProviderPopover) return;
    const handler = (e: MouseEvent) => {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) {
        setShowProviderPopover(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProviderPopover]);

  // Close popover on Escape
  useEffect(() => {
    if (!showProviderPopover) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowProviderPopover(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showProviderPopover]);

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
    // Tab to accept autocomplete suggestion
    if (e.key === 'Tab' && autocompleteSuggestion) {
      e.preventDefault();
      setText(autocompleteSuggestion + ' ');
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend, autocompleteSuggestion]);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.currentTarget;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 120) + 'px';
  }, []);

  // Sync scroll between textarea and ghost overlay
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (ghostRef.current) {
      ghostRef.current.scrollTop = e.currentTarget.scrollTop;
      ghostRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
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

      {/* Image Options Row */}
      {isImageGenerationModel && (
        <div className="flex items-center gap-2 px-1 pt-1.5 pb-1">
          <label className="text-xs text-text-muted whitespace-nowrap">Aspect Ratio:</label>
          <select
            className="text-xs text-text-default bg-bg-surface-raised border border-border-subtle rounded px-1.5 py-0.5 cursor-pointer outline-none focus:border-border-active disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Input Row */}
      <div className="group relative flex items-center gap-1.5 bg-bg-surface-raised border border-text-subtle rounded-lg p-1.5 transition-all duration-150 focus-within:border-accent focus-within:ring-2 focus-within:ring-brand-400/20">
        {/* Left Action Buttons */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 border-none bg-transparent rounded transition-all duration-150 ${store.pageContext
              ? 'text-accent bg-brand-400/15'
              : 'text-text-subtle hover:text-accent hover:bg-brand-400/10'
              }`}
            title="Add current page to context"
            onClick={handleAttachClick}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </button>
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 border-none bg-transparent text-text-subtle rounded transition-all duration-150 hover:text-accent hover:bg-brand-400/10"
            title="Attach file (image, txt, csv, pdf)"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 border-none bg-transparent rounded transition-all duration-150 ${store.showSystemPromptEditor
              ? 'text-accent bg-brand-400/15'
              : 'text-text-subtle hover:text-accent hover:bg-brand-400/10'
              }`}
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

        {/* Slash Commands Popover */}
        {filteredCommands.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 bg-bg-surface border border-border-subtle rounded-md shadow-lg mb-2 overflow-hidden z-[100] animate-in slide-in-from-bottom-2 duration-200">
            {filteredCommands.map(({ cmd, desc }) => (
              <div
                key={cmd}
                className={`px-3.5 py-2.5 cursor-pointer flex flex-col gap-0.5 transition-colors ${cmd === autocompleteSuggestion
                  ? 'bg-bg-selected'
                  : 'hover:bg-bg-hover'
                  }`}
                onClick={() => {
                  setText(cmd + ' ');
                  textareaRef.current?.focus();
                }}
              >
                <div className="font-semibold text-[13px] text-accent font-mono">{cmd}</div>
                <div className="text-[11px] text-text-subtle">{desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Textarea with Ghost Overlay */}
        <div className="relative flex-1 min-w-0">
          {/* Ghost text overlay for autocomplete */}
          <div
            ref={ghostRef}
            className="absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words font-sans text-[0.95rem] leading-[1.5] py-1 px-0.5 max-h-[120px]"
            aria-hidden="true"
          >
            <span className="text-transparent">{text}</span>
            {autocompleteSuggestion && (
              <span className="text-text-subtle/50 italic">
                {autocompleteSuggestion.slice(text.length)}
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="relative w-full border-none bg-transparent text-text-default font-sans text-[0.95rem] resize-none leading-[1.5] max-h-[120px] py-1 px-0.5 outline-none placeholder:text-text-subtle"
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
            onScroll={handleScroll}
            onPaste={(e) => handlePaste(e.nativeEvent)}
            disabled={store.isStreaming}
          />
        </div>

        {/* Send/Stop Button */}
        {store.isStreaming ? (
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 border-none rounded bg-red-500/80 text-white cursor-pointer transition-all duration-150 shrink-0 hover:bg-red-500"
            onClick={stopStreaming}
            title="Stop generating"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 border-none rounded cursor-pointer transition-all duration-150 shrink-0 bg-gradient-to-br from-brand-400 to-purple-400 text-white shadow-glow hover:shadow-glow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
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

      {/* Input Footer */}
      <div className="relative flex justify-between items-center px-1 pt-1.5" ref={footerRef}>
        <ProviderPopover isOpen={showProviderPopover} onClose={() => setShowProviderPopover(false)} />

        {/* Footer Left - Provider Info */}
        <div className="flex gap-2 items-center">
          <button
            type="button"
            className={`text-[0.7rem] px-1.5 py-0.5 rounded-full font-medium cursor-pointer border-none transition-all duration-150 font-sans ${showProviderPopover
              ? 'bg-brand-400/20 text-accent'
              : 'bg-brand-400/10 text-accent hover:bg-brand-400/20'
              }`}
            onClick={() => setShowProviderPopover(v => !v)}
          >
            {providerInfo.isConfigured ? providerInfo.providerName : 'No provider configured'}
          </button>
          {providerInfo.model && (
            <button
              type="button"
              className={`text-[0.7rem] px-1.5 py-0.5 rounded-full font-medium cursor-pointer border-none transition-all duration-150 font-sans ${showProviderPopover
                ? 'bg-purple-400/20 text-purple-400'
                : 'bg-purple-400/10 text-purple-400 hover:bg-purple-400/20'
                }`}
              onClick={() => setShowProviderPopover(v => !v)}
            >
              {providerInfo.model}
            </button>
          )}
        </div>

        {/* Footer Right - Context Usage */}
        <div className="flex items-center">
          {percentUntilCompact <= 15 && (
            <span
              className={`text-[10.5px] font-medium px-1.5 py-0.5 rounded-[10px] border transition-all duration-200 ${percentUntilCompact <= 5
                ? 'text-red-400 bg-red-400/10 border-red-400/20 font-semibold'
                : percentUntilCompact <= 10
                  ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                  : 'text-text-subtle bg-bg-surface-glass border-border-subtle'
                }`}
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
