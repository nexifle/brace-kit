import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { useChat, useFileAttachments, usePageContext, useProvider } from '../hooks';
import { FilePreview } from './FilePreview.tsx';
import { SelectionPreview } from './SelectionPreview.tsx';
import { PageContextPreview } from './PageContextPreview.tsx';
import { ProviderPopover } from './ProviderPopover.tsx';
import { XAI_IMAGE_MODELS, GEMINI_IMAGE_MODELS } from '../providers';
import { GlobeIcon, PaperclipIcon, SquareTerminal, BrainIcon } from 'lucide-react';

const SLASH_COMMANDS = [
  { cmd: '/compact', desc: 'Summarize and compress conversation' },
  { cmd: '/rename', desc: 'Rename conversation based on history' },
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

  // Token usage for autocompact indicator (only when enabled)
  const tokens = estimateTokenCount(store.messages);
  const contextWindow = store.providerConfig.contextWindow || (store.compactConfig.defaultContextWindow ?? 128000);
  const threshold = store.compactConfig.threshold ?? 0.9;
  const compactEnabled = store.compactConfig.enabled ?? true;
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
    ? 'Ask about this page... (type \'/\' for commands)'
    : store.attachments.length > 0
      ? 'Ask about attached files... (type \'/\' for commands)'
      : selectedText
        ? 'Ask about the selected text... (type \'/\' for commands)'
        : 'What\'s on your mind? (type \'/\' for commands)';

  const { quotedText, setQuotedText } = store;

  // Reasoning state from store
  const enableReasoning = useStore((state) => state.enableReasoning);
  const setEnableReasoning = useStore((state) => state.setEnableReasoning);

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
    sendMessage(text, isImageGenerationModel ? { aspectRatio: imageAspectRatio } : { enableReasoning });
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, store.attachments.length, sendMessage, isXAIImageModel, imageAspectRatio, enableReasoning]);

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
    <div id="input-area" className="flex flex-col gap-1.5 p-3 bg-background border-t border-border">
      <PageContextPreview />
      <FilePreview />
      <SelectionPreview />

      {/* Image Options Row */}
      {isImageGenerationModel && (
        <div className="flex items-center gap-2 px-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70 whitespace-nowrap">Aspect Ratio</label>
          <select
            className="text-xs bg-muted/40 border border-input rounded-md px-2 py-0.5 cursor-pointer outline-none transition-all hover:bg-muted/60 focus:ring-1 focus:ring-ring disabled:opacity-50 text-foreground"
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
      <div className="group relative flex items-center gap-1 bg-muted/40 border border-input rounded-md py-1 px-2 transition-all duration-200 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
        {/* Left Action Buttons */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${store.pageContext
              ? 'text-primary bg-primary/15'
              : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            title="Add current page to context"
            onClick={handleAttachClick}
          >
            <GlobeIcon size={16} />
          </button>
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 text-muted-foreground rounded-md transition-all duration-200 hover:text-primary hover:bg-primary/10"
            title="Attach file (image, txt, csv, pdf)"
            onClick={() => fileInputRef.current?.click()}
          >
            <PaperclipIcon size={16} />
          </button>
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${store.showSystemPromptEditor
              ? 'text-primary bg-primary/15'
              : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            title="System Prompt"
            onClick={() => store.setShowSystemPromptEditor(!store.showSystemPromptEditor)}
          >
            <SquareTerminal size={16} />
          </button>
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-all duration-200 ${enableReasoning
              ? 'text-primary bg-primary/15'
              : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
              }`}
            title="Activate Reasoning - Enable extended thinking for supported models"
            onClick={() => setEnableReasoning(!enableReasoning)}
          >
            <BrainIcon size={16} />
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
          <div className="absolute bottom-full left-0 right-0 bg-popover border border-border rounded-md shadow-xl mb-2 overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200 backdrop-blur-md">
            {filteredCommands.map(({ cmd, desc }) => (
              <div
                key={cmd}
                className={`px-3 py-2 cursor-pointer flex flex-col gap-0 transition-colors ${cmd === autocompleteSuggestion
                  ? 'bg-accent/20 text-accent-foreground'
                  : 'hover:bg-accent/10 focus:bg-accent/20'
                  }`}
                onClick={() => {
                  setText(cmd + ' ');
                  textareaRef.current?.focus();
                }}
              >
                <div className="font-bold text-xs text-primary font-mono">{cmd}</div>
                <div className="text-[10px] text-muted-foreground leading-tight tracking-tight">{desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* Textarea with Ghost Overlay */}
        <div className="relative flex-1 min-w-0">
          {/* Ghost text overlay for autocomplete */}
          <div
            ref={ghostRef}
            className="absolute inset-0 pointer-events-none overflow-hidden whitespace-pre-wrap break-words font-sans text-sm leading-relaxed py-1.5 px-1 max-h-[120px]"
            aria-hidden="true"
          >
            <span className="text-transparent">{text}</span>
            {autocompleteSuggestion && (
              <span className="text-muted-foreground/40 italic">
                {autocompleteSuggestion.slice(text.length)}
              </span>
            )}
          </div>
          <textarea
            ref={textareaRef}
            className="relative w-full border-none bg-transparent text-foreground font-sans text-sm resize-none leading-relaxed max-h-[120px] py-1.5 px-1 outline-none placeholder:text-muted-foreground/60"
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
            className="flex items-center justify-center w-8 h-8 rounded-md bg-destructive/80 text-destructive-foreground cursor-pointer transition-all duration-200 shrink-0 hover:bg-destructive active:scale-95"
            onClick={stopStreaming}
            title="Stop generating"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-md cursor-pointer transition-all duration-200 shrink-0 bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed disabled:scale-100"
            onClick={handleSend}
            disabled={!text.trim() && store.attachments.length === 0}
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Input Footer */}
      <div className="relative flex justify-between items-center px-1 pt-1.5" ref={footerRef}>
        <ProviderPopover isOpen={showProviderPopover} onClose={() => setShowProviderPopover(false)} />

        {/* Footer Left - Provider Info */}
        <div className="flex gap-1.5 items-center">
          <button
            type="button"
            className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border transition-all duration-200 ${showProviderPopover
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
              }`}
            onClick={() => setShowProviderPopover(v => !v)}
          >
            {providerInfo.isConfigured ? providerInfo.providerName : 'No Provider'}
          </button>
          {providerInfo.model && (
            <button
              type="button"
              className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border transition-all duration-200 ${showProviderPopover
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                }`}
              onClick={() => setShowProviderPopover(v => !v)}
            >
              {providerInfo.model}
            </button>
          )}
        </div>

        {/* Footer Right - Context Usage (only when autocompact enabled) */}
        {compactEnabled && percentUntilCompact <= 15 && (
          <div className="flex items-center">
            <span
              className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md border transition-all duration-300 ${percentUntilCompact <= 5
                ? 'text-destructive bg-destructive/10 border-destructive/20 animate-pulse'
                : percentUntilCompact <= 10
                  ? 'text-warning bg-warning/10 border-warning/20'
                  : 'text-muted-foreground bg-muted/20 border-border'
                }`}
              title={`${tokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens used. Auto-compact at ${compactThresholdPercent}%.`}
            >
              {Math.round(percentUntilCompact)}% until autocompact
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
