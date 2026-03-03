import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { renderMarkdown } from '../../utils/markdown';
import { useStore } from '../../store';
import { useMermaidHydration, useImageGenerationCheck, useMarkdownInteractions, useQuoteSelection } from '../../hooks';
import { TextFileViewer } from '../TextFileViewer';
import { QuoteIcon } from 'lucide-react';

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

// Import shared UI components
import { LoadingDots } from '../ui/LoadingDots';
import { ImageGenerationIndicator } from '../ui/ImageGenerationIndicator';

// Import types
import type {
  MessageBubbleProps,
  EditedMessageData,
  TextFileViewerState,
} from './MessageBubble.types';

// Import utilities
import { copyImageToClipboard } from './utils/imageProcessing';

const FAVORITES_STORAGE_KEY = 'gallery_favorites';

export function MessageBubble({
  message,
  isStreaming,
  messageIndex,
  onBranch,
  onRegenerate,
  onEdit,
}: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [textFileViewer, setTextFileViewer] = useState<TextFileViewerState>({
    isOpen: false,
    name: '',
    content: '',
  });
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showSummaryContent, setShowSummaryContent] = useState(false);

  const messages = useStore((state) => state.messages);
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);

  // Use extracted hooks
  const isImageGenerationModel = useImageGenerationCheck();
  const { quotePopup, handleMouseUp, handleQuoteClick } = useQuoteSelection(bubbleRef);

  // Pasang event listener untuk copy code, table actions, image actions, link click
  useMarkdownInteractions(bubbleRef);

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

  // Attachment image actions dan lightbox (md-image-* ditangani oleh useMarkdownInteractions)
  useEffect(() => {
    const ref = bubbleRef.current;
    if (!ref) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      const copyBtn = target.closest('.att-image-copy-btn');
      if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const src = copyBtn.getAttribute('data-src');
        if (!src) return;
        copyImageToClipboard(src).then((ok) => {
          if (ok) {
            copyBtn.setAttribute('data-state', 'success');
            setTimeout(() => copyBtn.removeAttribute('data-state'), 1500);
          }
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
      }
    };

    ref.addEventListener('click', handleClick);
    return () => ref.removeEventListener('click', handleClick);
  }, []);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

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

  // Hydrate mermaid diagrams after content renders (only when not streaming)
  useMermaidHydration(bubbleRef, { isStreaming });

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
        <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">
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
            <LoadingDots />
          )}
          {isImageGenerationModel && <ImageGenerationIndicator />}

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
      <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">
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
