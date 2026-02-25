import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import TurndownService from 'turndown';
import { renderMarkdown } from '../../utils/markdown';
import { useStore } from '../../store';
import { useMermaidHydration } from '../../hooks/useMermaidHydration';
import { TextFileViewer } from '../TextFileViewer';
import { GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS, XAI_IMAGE_MODELS } from '../../providers';
import { RefreshCwIcon, QuoteIcon } from 'lucide-react';

// Import decomposed components
import { ReasoningSection } from './sections/ReasoningSection';
import { ContextSection } from './sections/ContextSection';
import { SelectionSection } from './sections/SelectionSection';
import { ImagesSection } from './sections/ImagesSection';
import { CitationsSection } from './sections/CitationsSection';
import { MessageActions } from './actions/MessageActions';
import { UserActions } from './actions/UserActions';
import { ImageLightbox } from './display/ImageLightbox';
import { SummarySection } from './display/SummarySection';
import { AttachmentsDisplay } from './display/AttachmentsDisplay';
import { EditMode } from './edit/EditMode';

// Import types
import type {
  MessageBubbleProps,
  EditedMessageData,
  QuotePopupState,
  TextFileViewerState,
} from './MessageBubble.types';

// Import utilities
import {
  copyTableAsCsv,
  copyTableAsMarkdown,
  copyTableAsPlain,
  showButtonFeedback,
  downloadTableAsCsv,
  downloadTableAsMarkdown,
} from './utils/tableConverters';
import { copyImageToClipboard } from './utils/imageProcessing';

const FAVORITES_STORAGE_KEY = 'gallery_favorites';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
});

// Remove citation superscripts from the converted markdown
turndownService.addRule('citations', {
  filter: (node) => {
    return node.nodeName === 'SUP' && node.querySelector('a.citation-link') !== null;
  },
  replacement: () => '',
});

export function MessageBubble({
  message,
  isStreaming,
  messageIndex,
  onBranch,
  onRegenerate,
  onEdit,
}: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [quotePopup, setQuotePopup] = useState<QuotePopupState>({ visible: false, x: 0, y: 0, text: '' });
  const [textFileViewer, setTextFileViewer] = useState<TextFileViewerState>({
    isOpen: false,
    name: '',
    content: '',
  });
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showSummaryContent, setShowSummaryContent] = useState(false);

  const messages = useStore((state) => state.messages);
  const setQuotedText = useStore((state) => state.setQuotedText);
  const currentModel = useStore((state) => state.providerConfig.model || '');
  const currentProviderId = useStore((state) => state.providerConfig.providerId || '');
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);
  const isImageGenerationModel =
    GEMINI_NO_TOOLS_MODELS.includes(currentModel) ||
    GEMINI_SEARCH_ONLY_MODELS.includes(currentModel) ||
    (currentProviderId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel));

  const hasAfterMessages = messageIndex !== undefined && messageIndex < messages.length - 1;

  // Favorites state
  const activeConversationId = useStore((state) => state.activeConversationId);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Load favorites from storage
  useEffect(() => {
    chrome.storage.local.get(FAVORITES_STORAGE_KEY).then((data) => {
      const favs = data[FAVORITES_STORAGE_KEY];
      if (favs && Array.isArray(favs)) {
        setFavorites(new Set(favs));
      }
    });
  }, []);

  const toggleFavorite = useCallback(
    async (id: string) => {
      const newFavs = new Set(favorites);
      if (newFavs.has(id)) {
        newFavs.delete(id);
      } else {
        newFavs.add(id);
      }
      setFavorites(newFavs);
      await chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: Array.from(newFavs) });
    },
    [favorites]
  );

  // Handle edit submit
  const handleEditSubmit = useCallback(
    (data: EditedMessageData) => {
      if (onEdit && messageIndex !== undefined) {
        onEdit(messageIndex, data);
      }
      setIsEditing(false);
    },
    [onEdit, messageIndex]
  );

  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Event handlers
  const handleImageActions = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const copyBtn = target.closest('.att-image-copy-btn');
    if (copyBtn) {
      e.stopPropagation();
      e.preventDefault();
      const src = copyBtn.getAttribute('data-src');
      if (!src) return;
      import('../../utils/formatters').then(() => {
        copyImageToClipboard(src).then((ok) => {
          if (ok) {
            copyBtn.setAttribute('data-state', 'success');
            setTimeout(() => copyBtn.removeAttribute('data-state'), 1500);
          }
        });
      });
      return;
    }

    const downloadBtn = target.closest('.att-image-download-btn');
    if (downloadBtn) {
      e.stopPropagation();
      e.preventDefault();
      const src = downloadBtn.getAttribute('data-src');
      const name = downloadBtn.getAttribute('data-name');
      if (!src) return;

      const link = document.createElement('a');
      link.href = src;
      link.download = name || `image-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      downloadBtn.setAttribute('data-state', 'success');
      setTimeout(() => downloadBtn.removeAttribute('data-state'), 1500);
      return;
    }

    const img = target.closest('.md-image-wrapper img, .group\\/att img') as HTMLImageElement | null;
    if (img && !target.closest('.att-image-btn, .md-image-btn')) {
      setLightboxSrc(img.src);
      return;
    }
  }, []);

  const handleCopyCode = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-code-btn');
    if (!btn) return;

    e.stopPropagation();
    e.preventDefault();

    const code = btn.getAttribute('data-code');
    if (!code) return;

    const decodedCode = code
      .replace(/&#10;/g, '\n')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    import('../../utils/formatters').then(({ copyToClipboard }) => {
      copyToClipboard(decodedCode).then(() => {
        btn.setAttribute('data-state', 'success');
        setTimeout(() => btn.removeAttribute('data-state'), 1500);
      });
    });
  }, []);

  const handleTableActions = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const downloadBtn = target.closest('.table-download-btn');
    if (downloadBtn) {
      const dropdown = downloadBtn.closest('.table-dropdown');
      if (dropdown) {
        document.querySelectorAll('.table-dropdown.open').forEach((el) => {
          if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        e.stopPropagation();
      }
      return;
    }

    const handleCloseDropdown = () => {
      document.querySelectorAll('.table-dropdown.open').forEach((el) => {
        el.classList.remove('open');
      });
    };

    const copyBtn = target.closest('.table-copy-btn');
    if (copyBtn) {
      const dropdown = copyBtn.closest('.table-dropdown');
      if (dropdown) {
        document.querySelectorAll('.table-dropdown.open').forEach((el) => {
          if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        e.stopPropagation();
      }
      return;
    }

    const dropdownItem = target.closest('.table-dropdown-menu button[data-action]');
    if (dropdownItem) {
      const action = dropdownItem.getAttribute('data-action');
      const tableHtml = decodeURIComponent(dropdownItem.getAttribute('data-table') || '');

      if (tableHtml) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = tableHtml;
        const table = tempDiv.querySelector('table');

        if (table) {
          const dropdown = dropdownItem.closest('.table-dropdown');
          const copyBtnEl = dropdown?.querySelector('.table-copy-btn') as HTMLElement | null;

          switch (action) {
            case 'copy-csv':
              copyTableAsCsv(table).then(() => {
                if (copyBtnEl) showButtonFeedback(copyBtnEl);
              });
              break;
            case 'copy-markdown':
              copyTableAsMarkdown(table).then(() => {
                if (copyBtnEl) showButtonFeedback(copyBtnEl);
              });
              break;
            case 'copy-plain':
              copyTableAsPlain(table).then(() => {
                if (copyBtnEl) showButtonFeedback(copyBtnEl);
              });
              break;
            case 'download-csv':
              downloadTableAsCsv(table);
              break;
            case 'download-markdown':
              downloadTableAsMarkdown(table);
              break;
          }
        }
      }

      handleCloseDropdown();
      return;
    }

    const fullscreenBtn = target.closest('.table-fullscreen-btn');
    if (fullscreenBtn) {
      const wrapper = fullscreenBtn.closest('.table-wrapper');
      if (wrapper) {
        wrapper.classList.toggle('fullscreen');
        const btn = fullscreenBtn as HTMLElement;
        const isFullscreen = wrapper.classList.contains('fullscreen');
        btn.setAttribute('title', isFullscreen ? 'Exit fullscreen' : 'Fullscreen');
      }
      return;
    }

    if (!target.closest('.table-dropdown')) {
      handleCloseDropdown();
    }
  }, []);

  const handleTableExpand = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('.md-expandable-cell');
    if (cell) {
      cell.classList.toggle('expanded');
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setQuotePopup((p) => ({ ...p, visible: false }));
      return;
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      setQuotePopup((p) => ({ ...p, visible: false }));
      return;
    }

    const ref = bubbleRef.current;
    if (!ref) return;
    const range = selection.getRangeAt(0);
    if (!ref.contains(range.commonAncestorContainer)) {
      setQuotePopup((p) => ({ ...p, visible: false }));
      return;
    }

    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    const markdown = turndownService.turndown(container.innerHTML).trim();

    const rect = range.getBoundingClientRect();
    const bubbleRect = ref.getBoundingClientRect();

    setQuotePopup({
      visible: true,
      x: rect.left + rect.width / 2 - bubbleRect.left,
      y: rect.top - bubbleRect.top - 4,
      text: markdown,
    });
  }, []);

  const handleQuoteClick = useCallback(() => {
    if (quotePopup.text) {
      setQuotedText(quotePopup.text);
      window.getSelection()?.removeAllRanges();
      setQuotePopup((p) => ({ ...p, visible: false }));
    }
  }, [quotePopup.text, setQuotedText]);

  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    if (href.startsWith('http://') || href.startsWith('https://')) {
      return;
    }

    if (href.startsWith('#')) {
      e.preventDefault();
      const targetId = href.substring(1);
      const host = bubbleRef.current;
      if (host) {
        const targetElement = host.querySelector(`[id="${targetId}"]`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetElement.classList.add('footnote-active');
          setTimeout(() => {
            targetElement.classList.remove('footnote-active');
          }, 2500);
        }
      }
      return;
    }

    e.preventDefault();
  }, []);

  // Event listeners
  useEffect(() => {
    const ref = bubbleRef.current;
    if (!ref) return;

    ref.addEventListener('click', handleCopyCode as unknown as EventListener);
    ref.addEventListener('click', handleTableActions as unknown as EventListener);
    ref.addEventListener('click', handleTableExpand as unknown as EventListener);
    ref.addEventListener('click', handleLinkClick as unknown as EventListener);
    ref.addEventListener('click', handleImageActions as unknown as EventListener);

    return () => {
      ref.removeEventListener('click', handleCopyCode as unknown as EventListener);
      ref.removeEventListener('click', handleTableActions as unknown as EventListener);
      ref.removeEventListener('click', handleTableExpand as unknown as EventListener);
      ref.removeEventListener('click', handleLinkClick as unknown as EventListener);
      ref.removeEventListener('click', handleImageActions as unknown as EventListener);
    };
  }, [handleCopyCode, handleTableActions, handleTableExpand, handleLinkClick, handleImageActions]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

  // Global mousedown handler
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      const ref = bubbleRef.current;
      if (ref && !ref.contains(e.target as Node)) {
        setQuotePopup((p) => ({ ...p, visible: false }));
      }
    };
    document.addEventListener('mousedown', handleGlobalMouseDown);
    return () => document.removeEventListener('mousedown', handleGlobalMouseDown);
  }, []);

  // Handle markdown image favorite clicks via event delegation
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const favBtn = target.closest('.md-image-favorite-btn');
      if (favBtn) {
        e.preventDefault();
        e.stopPropagation();
        const src = (favBtn as HTMLElement).dataset.src;
        if (src && activeConversationId) {
          const favId = `md:${activeConversationId}::${src}`;
          toggleFavorite(favId);
        }
        return;
      }

      const copyBtn = target.closest('.md-image-copy-btn');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const src = (copyBtn as HTMLElement).dataset.src;
        if (src) {
          copyImageToClipboard(src).then((ok) => {
            if (ok) {
              copyBtn.setAttribute('data-state', 'success');
              setTimeout(() => {
                copyBtn.removeAttribute('data-state');
              }, 1500);
            }
          });
        }
        return;
      }

      const downloadBtn = target.closest('.md-image-download-btn');
      if (downloadBtn) {
        e.preventDefault();
        e.stopPropagation();
        const src = (downloadBtn as HTMLElement).dataset.src;
        if (src) {
          downloadBtn.setAttribute('data-state', 'success');

          const link = document.createElement('a');
          link.href = src;
          link.download = `image-${Date.now()}.${src.split('.').pop()?.split('?')[0] || 'png'}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setTimeout(() => {
            downloadBtn.removeAttribute('data-state');
          }, 1500);
        }
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [activeConversationId, toggleFavorite]);

  // Hydrate mermaid diagrams after content renders
  useMermaidHydration(bubbleRef);

  // Sync markdown image favorite indicators
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || !activeConversationId) return;

    const wrappers = el.querySelectorAll('.md-image-wrapper');
    wrappers.forEach((wrapper) => {
      const src = (wrapper as HTMLElement).dataset.src;
      if (!src) return;

      const favId = `md:${activeConversationId}::${src}`;
      const isFav = favorites.has(favId);

      const indicator = wrapper.querySelector('.md-image-fav-indicator');
      const favBtn = wrapper.querySelector('.md-image-favorite-btn');
      const favIcon = favBtn?.querySelector('.fav-icon');

      if (indicator) {
        if (isFav) {
          indicator.classList.remove('hidden');
        } else {
          indicator.classList.add('hidden');
        }
      }

      if (favIcon) {
        if (isFav) {
          favBtn?.classList.add('bg-amber-500');
          favBtn?.classList.remove('bg-black/60', 'hover:bg-primary');
          favIcon.setAttribute('fill', 'white');
          favIcon.setAttribute('stroke', 'white');
        } else {
          favBtn?.classList.remove('bg-amber-500');
          favBtn?.classList.add('bg-black/60', 'hover:bg-primary');
          favIcon.setAttribute('fill', 'none');
          favIcon.setAttribute('stroke', 'currentColor');
        }
      }
    });
  }, [favorites, activeConversationId, message.content, message.displayContent, showSummaryContent]);

  const roleLabel = message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'AI';

  // Rendered content memo
  const renderedContent = useMemo(() => {
    if (isEditing && message.role === 'user') {
      return (
        <EditMode
          initialText={message.displayContent || message.content}
          initialPageContext={message.pageContext}
          initialSelectedText={message.selectedText}
          initialAttachments={message.attachments}
          hasAfterMessages={hasAfterMessages}
          onSubmit={handleEditSubmit}
          onCancel={handleEditCancel}
        />
      );
    }
    if (message.summary) {
      return (
        <SummarySection
          summary={message.summary}
          isExpanded={showSummaryContent}
          onToggle={() => setShowSummaryContent(!showSummaryContent)}
        />
      );
    }
    if (message.role === 'assistant' || message.role === 'user' || message.role === 'system') {
      const contentToRender = message.displayContent || message.content;
      // Note: renderMarkdown sanitizes content internally
      return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(contentToRender, isStreaming) }} />;
    }
    return <>{message.displayContent || message.content}</>;
  }, [
    isEditing,
    isStreaming,
    message.content,
    message.displayContent,
    message.role,
    message.summary,
    showSummaryContent,
    hasAfterMessages,
    message.pageContext,
    message.selectedText,
    message.attachments,
    handleEditSubmit,
    handleEditCancel,
  ]);

  // Get lightbox fav data
  const getLightboxFavData = () => {
    if (!message.generatedImages) return { favId: '', isFavorited: false };
    const idx = message.generatedImages.findIndex(
      (img) => `data:${img.mimeType};base64,${img.data}` === lightboxSrc
    );
    if (idx === -1) return { favId: '', isFavorited: false };
    const img = message.generatedImages[idx];
    const imageKey =
      img.imageRef || (activeConversationId ? `img_${activeConversationId}_${messageIndex}_${idx}` : '');
    const favId = `db:${imageKey}`;
    return { favId, isFavorited: favorites.has(favId) };
  };

  // Streaming mode render
  if (isStreaming) {
    const bubbleBgClass =
      message.role === 'user'
        ? 'bg-muted/40 border border-border rounded-lg rounded-br-sm'
        : 'bg-muted/40 border border-border rounded-lg rounded-bl-sm';

    return (
      <div
        className={`group flex flex-col gap-1 max-w-[92%] ${isStreaming ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-300'} ${message.role === 'user' ? 'self-end' : 'self-start'}`}
      >
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">
          {roleLabel}
        </div>
        <div
          className={`prose dark:prose-invert prose-sm prose-p:my-2 prose-hr:my-4 max-w-none relative break-words px-3.5 py-1.5 pb-2.5 ${bubbleBgClass}`}
          ref={bubbleRef}
          onMouseUp={handleMouseUp}
        >
          {streamingReasoningContent && <ReasoningSection content={streamingReasoningContent} isStreaming={true} />}
          {message.content ? (
            // Note: renderMarkdown sanitizes content internally
            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content, isStreaming) }}
            />
          ) : (
            <div className="flex gap-1 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce"></span>
            </div>
          )}
          {isImageGenerationModel && (
            <div className="mt-2 h-40 w-full rounded-md bg-muted/30 animate-pulse flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              <div className="text-xs font-medium text-muted-foreground flex flex-col items-center gap-2">
                <RefreshCwIcon size={16} className="animate-spin text-primary/60" />
                Generating image...
              </div>
            </div>
          )}

          {quotePopup.visible && (
            <div
              className="absolute z-10 flex items-center bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-xl p-0.5 animate-in fade-in zoom-in-95 duration-200"
              style={{ left: quotePopup.x, top: quotePopup.y, transform: 'translate(-50%, -100%)' }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-sm transition-all"
                onClick={handleQuoteClick}
                title="Quote"
              >
                <div className="flex items-center justify-center">
                  <QuoteIcon size={14} />
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Normal mode render
  const bubbleBgClass =
    message.role === 'user'
      ? 'dark:bg-muted/40 bg-background border border-border rounded-lg rounded-br-sm'
      : message.role === 'error'
        ? 'bg-destructive/10 border border-destructive/20 text-destructive rounded-lg rounded-bl-sm'
        : 'dark:bg-muted/40 bg-background border border-border rounded-lg rounded-bl-sm'; // bg for ai message

  const { favId, isFavorited } = getLightboxFavData();

  return (
    <div
      className={`group flex flex-col gap-1 max-w-[92%] ${isStreaming ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-300'} ${message.role === 'user' ? 'self-end' : 'self-start'}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">
        {!message.summary && roleLabel}
        {message.isCompacted && !message.summary && (
          <span className="ml-1 opacity-50 font-medium">· Compacted</span>
        )}
      </div>
      <div
        className={`prose dark:prose-invert prose-sm prose-p:my-2 prose-hr:my-4 max-w-none relative break-words px-3.5 py-0 ${bubbleBgClass} ${isEditing ? 'ring-2 ring-primary/30' : ''} ${message.summary ? 'border-dashed border-primary/30 bg-primary/5' : ''}`}
        ref={bubbleRef}
        onMouseUp={handleMouseUp}
      >
        {message.pageContext && <ContextSection context={message.pageContext} />}
        {message.selectedText && <SelectionSection selection={message.selectedText} />}
        {(message.reasoningContent || (isStreaming && streamingReasoningContent)) && (
          <ReasoningSection
            content={isStreaming ? streamingReasoningContent : message.reasoningContent || ''}
            isStreaming={isStreaming && !!streamingReasoningContent}
          />
        )}
        <div className="text-foreground text-sm leading-relaxed py-2.5">{renderedContent}</div>
        {message.generatedImages && message.generatedImages.length > 0 && (
          <ImagesSection
            images={message.generatedImages}
            messageIndex={messageIndex}
            onImageClick={setLightboxSrc}
            onToggleFavorite={toggleFavorite}
            favorites={favorites}
            activeConversationId={activeConversationId}
          />
        )}
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentsDisplay
            attachments={message.attachments}
            onImageClick={setLightboxSrc}
            onTextFileClick={(name, content) => setTextFileViewer({ isOpen: true, name, content })}
          />
        )}
        {message.groundingMetadata && <CitationsSection groundingMetadata={message.groundingMetadata} />}
        {quotePopup.visible && (
          <div
            className="absolute z-10 flex items-center bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-xl p-0.5 animate-in fade-in zoom-in-95 duration-200"
            style={{ left: quotePopup.x, top: quotePopup.y, transform: 'translate(-50%, -100%)' }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-sm transition-all"
              onClick={handleQuoteClick}
              title="Quote"
            >
              <QuoteIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Assistant actions */}
      {message.role === 'assistant' && !isStreaming && (
        <MessageActions content={message.content} messageIndex={messageIndex} onBranch={onBranch} />
      )}

      {/* User actions */}
      {message.role === 'user' && !isStreaming && messageIndex !== undefined && (
        <UserActions
          content={message.content}
          messageIndex={messageIndex}
          isEditing={isEditing}
          onEdit={onEdit ? () => setIsEditing(true) : undefined}
          onRegenerate={onRegenerate}
          onBranch={onBranch}
        />
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          favId={favId}
          isFavorited={isFavorited}
          onToggleFavorite={toggleFavorite}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* Text file viewer */}
      {textFileViewer.isOpen && (
        <TextFileViewer
          isOpen={textFileViewer.isOpen}
          onClose={() => setTextFileViewer({ isOpen: false, name: '', content: '' })}
          fileName={textFileViewer.name}
          content={textFileViewer.content}
        />
      )}
    </div>
  );
}
