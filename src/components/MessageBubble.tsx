import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import TurndownService from 'turndown';
import { renderMarkdown } from '../utils/markdown.ts';
import { copyToClipboard } from '../utils/formatters.ts';
import { useStore } from '../store/index.ts';
import type { Message, Attachment, PageContext, SelectedText } from '../types/index.ts';
import { TextFileViewer } from './TextFileViewer.tsx';
import { ConfirmDialog } from './ui/ConfirmDialog.tsx';
import { GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS, XAI_IMAGE_MODELS } from '../providers';
import { CheckIcon, ChevronRightIcon, CopyIcon, GitBranchIcon, PencilIcon, RefreshCwIcon, XIcon, PlusIcon, FileTextIcon, GlobeIcon, DownloadIcon, StarIcon, QuoteIcon, BrainIcon } from 'lucide-react';
import { Btn } from './ui/Btn.tsx';
import { MAX_FILE_SIZE, MAX_IMAGE_DIMENSION } from '../types/index.ts';

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

// Reasoning Section Component
function ReasoningSection({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-4 w-full flex flex-col gap-1 max-w-full self-start mb-2">
      <div className="relative group px-3 py-2 dark:bg-muted bg-muted-foreground/5 backdrop-blur-md border rounded-lg transition-all duration-300">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isStreaming ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-500/15 text-purple-400'}`}>
              <BrainIcon size={12} />
            </div>
            <div className="flex flex-col gap-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-foreground/80 leading-none">
                Reasoning
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/15 border border-purple-500/20">
                <RefreshCwIcon size={10} className="text-purple-400 animate-spin" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 border border-success/20">
                <CheckIcon size={10} className="text-success" />
              </div>
            )}
            <ChevronRightIcon
              size={14}
              className={`text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>
        </button>

        {/* Expandable Content */}
        {isExpanded && (
          <div className="mt-2">
            <div className="text-xs my-0! font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto scrollbar-thin text-muted-foreground leading-relaxed">
              {content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface EditedMessageData {
  text: string;
  pageContext?: PageContext | null;
  selectedText?: SelectedText | null;
  attachments?: Attachment[];
}

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  messageIndex?: number;
  onBranch?: (index: number) => void;
  onRegenerate?: (index: number) => void;
  onEdit?: (index: number, data: EditedMessageData) => void;
}

interface QuotePopupState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
}

interface TextFileViewerState {
  isOpen: boolean;
  name: string;
  content: string;
}

export function MessageBubble({ message, isStreaming, messageIndex, onBranch, onRegenerate, onEdit }: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [quotePopup, setQuotePopup] = useState<QuotePopupState>({ visible: false, x: 0, y: 0, text: '' });
  const [textFileViewer, setTextFileViewer] = useState<TextFileViewerState>({ isOpen: false, name: '', content: '' });
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [editPageContext, setEditPageContext] = useState<PageContext | null>(null);
  const [editSelectedText, setEditSelectedText] = useState<SelectedText | null>(null);
  const [editAttachments, setEditAttachments] = useState<Attachment[]>([]);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showSummaryContent, setShowSummaryContent] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const messages = useStore((state) => state.messages);
  const setQuotedText = useStore((state) => state.setQuotedText);
  const currentModel = useStore((state) => state.providerConfig.model || '');
  const currentProviderId = useStore((state) => state.providerConfig.providerId || '');
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);
  const isImageGenerationModel =
    GEMINI_NO_TOOLS_MODELS.includes(currentModel) ||
    GEMINI_SEARCH_ONLY_MODELS.includes(currentModel) ||
    (currentProviderId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel));

  // Check if there are messages after this one
  const hasAfterMessages = messageIndex !== undefined && messageIndex < messages.length - 1;

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Place cursor at the end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Handle entering edit mode
  const handleEditClick = useCallback(() => {
    const contentToEdit = message.displayContent || message.content;
    setEditText(contentToEdit);
    setEditPageContext(message.pageContext || null);
    setEditSelectedText(message.selectedText || null);
    setEditAttachments(message.attachments || []);
    setIsEditing(true);
  }, [message.displayContent, message.content, message.pageContext, message.selectedText, message.attachments]);

  // Handle submitting the edit
  const handleSubmit = useCallback(() => {
    if (!editText.trim()) return;

    if (hasAfterMessages) {
      setShowSubmitConfirm(true);
    } else {
      // No confirmation needed if no messages after
      if (onEdit && messageIndex !== undefined) {
        onEdit(messageIndex, {
          text: editText,
          pageContext: editPageContext,
          selectedText: editSelectedText,
          attachments: editAttachments,
        });
      }
      setIsEditing(false);
      setEditText('');
      setEditPageContext(null);
      setEditSelectedText(null);
      setEditAttachments([]);
    }
  }, [editText, editPageContext, editSelectedText, editAttachments, hasAfterMessages, onEdit, messageIndex]);

  // Handle confirmed submit
  const handleConfirmSubmit = useCallback(() => {
    setShowSubmitConfirm(false);
    if (onEdit && messageIndex !== undefined) {
      onEdit(messageIndex, {
        text: editText,
        pageContext: editPageContext,
        selectedText: editSelectedText,
        attachments: editAttachments,
      });
    }
    setIsEditing(false);
    setEditText('');
    setEditPageContext(null);
    setEditSelectedText(null);
    setEditAttachments([]);
  }, [editText, editPageContext, editSelectedText, editAttachments, onEdit, messageIndex]);

  // Handle canceling the edit
  const handleCancel = useCallback(() => {
    const originalText = message.displayContent || message.content;
    const hasChanges =
      editText !== originalText ||
      editPageContext !== (message.pageContext || null) ||
      editSelectedText !== (message.selectedText || null) ||
      JSON.stringify(editAttachments) !== JSON.stringify(message.attachments || []);

    if (hasChanges) {
      // Show confirmation if there are unsaved changes
      setShowCancelConfirm(true);
    } else {
      // No changes, just exit edit mode
      setIsEditing(false);
      setEditText('');
      setEditPageContext(null);
      setEditSelectedText(null);
      setEditAttachments([]);
    }
  }, [editText, editPageContext, editSelectedText, editAttachments, message.displayContent, message.content, message.pageContext, message.selectedText, message.attachments]);

  // Handle confirmed cancel
  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirm(false);
    setIsEditing(false);
    setEditText('');
    setEditPageContext(null);
    setEditSelectedText(null);
    setEditAttachments([]);
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSubmit, handleCancel]);

  // Edit mode attachment handlers
  const handleRemoveEditPageContext = useCallback(() => {
    setEditPageContext(null);
  }, []);

  const handleRemoveEditSelectedText = useCallback(() => {
    setEditSelectedText(null);
  }, []);

  const handleRemoveEditAttachment = useCallback((index: number) => {
    setEditAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddPageContextInEdit = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }).then((response: any) => {
      if (response?.error) {
        console.error('Failed to get page context:', response.error);
      } else {
        setEditPageContext(response);
      }
    });
  }, []);

  const handleAddSelectedTextInEdit = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' }).then((response: any) => {
      if (response?.error) {
        console.error('Failed to get selected text:', response.error);
      } else if (response?.selectedText) {
        setEditSelectedText(response);
      }
    });
  }, []);

  const handleEditFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const ALLOWED_FILE_TYPES: Record<string, 'image' | 'text' | 'pdf'> = {
      'image/jpeg': 'image',
      'image/png': 'image',
      'image/gif': 'image',
      'image/webp': 'image',
      'text/plain': 'text',
      'text/csv': 'text',
      'application/pdf': 'pdf',
    };

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        console.error('File too large:', file.name);
        continue;
      }

      const fileType = ALLOWED_FILE_TYPES[file.type];
      if (!fileType) {
        console.error('Unsupported file type:', file.name);
        continue;
      }

      try {
        if (fileType === 'image') {
          const dataUrl = await processImageForEdit(file);
          setEditAttachments(prev => [...prev, {
            type: 'image',
            name: file.name,
            data: dataUrl,
          }]);
        } else if (fileType === 'text') {
          const text = await file.text();
          setEditAttachments(prev => [...prev, {
            type: 'text',
            name: file.name,
            data: text,
          }]);
        } else if (fileType === 'pdf') {
          const dataUrl = await readFileAsDataURL(file);
          setEditAttachments(prev => [...prev, {
            type: 'pdf',
            name: file.name,
            data: dataUrl,
          }]);
        }
      } catch (err) {
        console.error('Failed to process file:', file.name, err);
      }
    }
  }, []);

  const handleImageActions = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const copyBtn = target.closest('.md-image-copy-btn');
    if (copyBtn) {
      const src = copyBtn.getAttribute('data-src');
      if (!src) return;
      copyImageToClipboard(src).then((ok) => {
        if (ok) {
          copyBtn.classList.add('md-image-btn-success');
          setTimeout(() => copyBtn.classList.remove('md-image-btn-success'), 1500);
        }
      });
      return;
    }

    const downloadBtn = target.closest('.md-image-download-btn');
    if (downloadBtn) {
      const src = downloadBtn.getAttribute('data-src');
      if (!src) return;
      const a = document.createElement('a');
      a.href = src;
      const ext = src.split('.').pop()?.split('?')[0] || 'png';
      a.download = `image.${ext}`;
      a.click();
      downloadBtn.classList.add('md-image-btn-success');
      setTimeout(() => downloadBtn.classList.remove('md-image-btn-success'), 1500);
      return;
    }

    // Open lightbox when clicking the image itself
    const img = target.closest('.md-image-wrapper img') as HTMLImageElement | null;
    if (img && !target.closest('.md-image-btn')) {
      setLightboxSrc(img.src);
      return;
    }
  }, []);

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

  // Handle table toolbar actions
  const handleTableActions = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    // Toggle download dropdown
    const downloadBtn = target.closest('.table-download-btn');
    if (downloadBtn) {
      const dropdown = downloadBtn.closest('.table-dropdown');
      if (dropdown) {
        // Close other dropdowns first
        document.querySelectorAll('.table-dropdown.open').forEach((el) => {
          if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        e.stopPropagation();
      }
      return;
    }

    // Close dropdown when clicking outside
    const handleCloseDropdown = () => {
      document.querySelectorAll('.table-dropdown.open').forEach((el) => {
        el.classList.remove('open');
      });
    };

    // Handle copy table dropdown toggle
    const copyBtn = target.closest('.table-copy-btn');
    if (copyBtn) {
      const dropdown = copyBtn.closest('.table-dropdown');
      if (dropdown) {
        // Close other dropdowns first
        document.querySelectorAll('.table-dropdown.open').forEach((el) => {
          if (el !== dropdown) el.classList.remove('open');
        });
        dropdown.classList.toggle('open');
        e.stopPropagation();
      }
      return;
    }

    // Handle dropdown items (copy and download actions)
    const dropdownItem = target.closest('.table-dropdown-item');
    if (dropdownItem) {
      const action = dropdownItem.getAttribute('data-action');
      const tableHtml = decodeURIComponent(dropdownItem.getAttribute('data-table') || '');

      if (tableHtml) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = tableHtml;
        const table = tempDiv.querySelector('table');

        if (table) {
          // Find the copy button to show feedback
          const dropdown = dropdownItem.closest('.table-dropdown');
          const copyBtn = dropdown?.querySelector('.table-copy-btn') as HTMLElement | null;

          switch (action) {
            case 'copy-csv':
              copyTableAsCsv(table).then(() => {
                if (copyBtn) showButtonFeedback(copyBtn);
              });
              break;
            case 'copy-markdown':
              copyTableAsMarkdown(table).then(() => {
                if (copyBtn) showButtonFeedback(copyBtn);
              });
              break;
            case 'copy-plain':
              copyTableAsPlain(table).then(() => {
                if (copyBtn) showButtonFeedback(copyBtn);
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

    // Handle fullscreen
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

    // Close dropdowns when clicking elsewhere
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

    // Pastikan seleksi berasal dari dalam bubble ini
    const ref = bubbleRef.current;
    if (!ref) return;
    const range = selection.getRangeAt(0);
    if (!ref.contains(range.commonAncestorContainer)) {
      setQuotePopup((p) => ({ ...p, visible: false }));
      return;
    }

    // Capture HTML for conversion
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

  // Handle link clicks - allow default behavior for external links
  const handleLinkClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // Check if it's an external link
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return;
    }

    // Handle internal anchor links (like footnotes)
    if (href.startsWith('#')) {
      e.preventDefault();
      const targetId = href.substring(1);
      const host = bubbleRef.current;
      if (host) {
        const targetElement = host.querySelector(`[id="${targetId}"]`);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Trigger a brief highlight effect
          targetElement.classList.add('footnote-active');
          setTimeout(() => {
            targetElement.classList.remove('footnote-active');
          }, 2500);
        }
      }
      return;
    }

    // For other citation links or internal links, prevent default
    e.preventDefault();
  }, []);

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

  const activeConversationId = useStore((state) => state.activeConversationId);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Load favorites from storage
  useEffect(() => {
    chrome.storage.local.get(FAVORITES_STORAGE_KEY).then((data) => {
      const favorites = data[FAVORITES_STORAGE_KEY];
      if (favorites && Array.isArray(favorites)) {
        setFavorites(new Set(favorites));
      }
    });
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    const newFavs = new Set(favorites);
    if (newFavs.has(id)) {
      newFavs.delete(id);
    } else {
      newFavs.add(id);
    }
    setFavorites(newFavs);
    await chrome.storage.local.set({ [FAVORITES_STORAGE_KEY]: Array.from(newFavs) });
  }, [favorites]);

  // Handle markdown image favorite clicks via event delegation
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Favorite Button
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

      // Copy Button
      const copyBtn = target.closest('.md-image-copy-btn');
      if (copyBtn) {
        e.preventDefault();
        e.stopPropagation();
        const src = (copyBtn as HTMLElement).dataset.src;
        if (src) {
          copyImageToClipboard(src).then(ok => {
            if (ok) {
              const originalHtml = copyBtn.innerHTML;
              copyBtn.classList.add('bg-green-500', 'text-white');
              copyBtn.classList.remove('bg-black/60', 'hover:bg-primary');
              copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
              setTimeout(() => {
                copyBtn.classList.remove('bg-green-500', 'text-white');
                copyBtn.classList.add('bg-black/60', 'hover:bg-primary');
                copyBtn.innerHTML = originalHtml;
              }, 1500);
            }
          });
        }
        return;
      }

      // Download Button
      const downloadBtn = target.closest('.md-image-download-btn');
      if (downloadBtn) {
        e.preventDefault();
        e.stopPropagation();
        const src = (downloadBtn as HTMLElement).dataset.src;
        if (src) {
          const originalHtml = downloadBtn.innerHTML;
          downloadBtn.classList.add('bg-primary', 'text-white');
          downloadBtn.classList.remove('bg-black/60');
          downloadBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';

          // Direct download logic for MD images
          const link = document.createElement('a');
          link.href = src;
          link.download = `image-${Date.now()}.${src.split('.').pop()?.split('?')[0] || 'png'}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          setTimeout(() => {
            downloadBtn.classList.remove('bg-primary', 'text-white');
            downloadBtn.classList.add('bg-black/60');
            downloadBtn.innerHTML = originalHtml;
          }, 1500);
        }
      }
    };

    el.addEventListener('click', handleClick);
    return () => el.removeEventListener('click', handleClick);
  }, [activeConversationId, toggleFavorite]);

  // Sync markdown image favorite indicators with global favorites state
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

  const renderedContent = useMemo(() => {
    // If in edit mode for user message, show edit UI instead
    if (isEditing && message.role === 'user') {
      return (
        <div className="">
          {/* Edit Page Context */}
          {editPageContext && (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-2.5 bg-brand-400/[0.08] border border-brand-400/15 rounded-md animate-slide-down">
              <div className="flex items-center justify-center w-8 h-8 bg-brand-400/15 rounded-sm text-accent shrink-0">
                <GlobeIcon size={16} />
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="text-[0.85rem] font-semibold text-text-default truncate mb-0.5">{editPageContext.pageTitle}</div>
                <div className="text-[0.7rem] text-text-subtle truncate">{editPageContext.pageUrl}</div>
              </div>
              <button
                className="flex items-center justify-center w-6 h-6 border-none bg-transparent text-text-subtle rounded-full cursor-pointer shrink-0 transition-all duration-150 hover:bg-danger-400/20 hover:text-danger-400"
                onClick={handleRemoveEditPageContext}
                title="Remove page context"
              >
                <XIcon size={14} />
              </button>
            </div>
          )}

          {/* Edit Selected Text */}
          {editSelectedText && (
            <div className="flex items-center justify-between px-2.5 py-2 mb-2.5 bg-purple-400/[0.08] border border-purple-400/15 rounded-sm animate-slide-down">
              <div className="flex items-center gap-1.5 text-[0.8rem] text-accent-subtle overflow-hidden flex-1">
                <FileTextIcon size={12} />
                <span className="truncate max-w-60">
                  {editSelectedText.selectedText.length > 80
                    ? `${editSelectedText.selectedText.substring(0, 80)}...`
                    : editSelectedText.selectedText}
                </span>
              </div>
              <button
                className="flex items-center justify-center w-6 h-6 border-none bg-transparent text-text-subtle rounded-full cursor-pointer shrink-0 transition-all duration-150 hover:bg-danger-400/20 hover:text-danger-400"
                onClick={handleRemoveEditSelectedText}
                title="Remove selection"
              >
                <XIcon size={10} />
              </button>
            </div>
          )}

          {/* Edit Attachments */}
          {editAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2.5 animate-slide-down">
              {editAttachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2 py-1.5 bg-bg-surface-raised border border-border rounded-sm text-[0.8rem] text-text-muted"
                >
                  {att.type === 'image' ? (
                    <>
                      <img src={att.data} alt={att.name} className="w-10 h-10 object-cover rounded-sm" />
                      <span className="truncate max-w-20">{att.name}</span>
                    </>
                  ) : (
                    <>
                      <span>{att.type === 'pdf' ? '📄' : '📃'}</span>
                      <span className="truncate max-w-20">{att.name}</span>
                    </>
                  )}
                  <button
                    className="flex items-center justify-center w-4 h-4 border-none bg-transparent text-text-subtle cursor-pointer rounded-full shrink-0 transition-all duration-150 hover:bg-danger-400/20 hover:text-danger-400"
                    onClick={() => handleRemoveEditAttachment(idx)}
                    title="Remove"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add attachments buttons */}
          <div className="flex items-center gap-1 mb-2">
            <Btn
              variant='ghost'
              size='sm'
              onClick={handleAddPageContextInEdit}
              title="Add page context"
            >
              <GlobeIcon size={14} />
            </Btn>
            <Btn
              variant='ghost'
              size='sm'
              onClick={handleAddSelectedTextInEdit}
              title="Add selected text"
            >
              <FileTextIcon size={14} />
            </Btn>
            <Btn
              variant='ghost'
              size='sm'
              onClick={() => editFileInputRef.current?.click()}
              title="Attach file"
            >
              <PlusIcon size={14} />
            </Btn>
            <input
              type="file"
              ref={editFileInputRef}
              className="hidden"
              accept="image/*,.txt,.csv,.pdf"
              multiple
              onChange={(e) => handleEditFileSelect(e.target.files)}
            />
          </div>

          <textarea
            ref={textareaRef}
            className="w-full mt-2 mb-0 overflow-y-auto border-none outline-none resize-none max-inline-max field-sizing-content max-h-[150px]"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="mb-1 w-full flex justify-end gap-2 mt-2">
            <Btn
              variant='ghost'
              size='sm'
              onClick={handleCancel}
              title="Cancel (Escape)"
            >
              <XIcon size={14} />
              Cancel
            </Btn>
            <Btn
              variant='default'
              size='sm'
              onClick={handleSubmit}
              title="Submit (Enter)"
            >
              <CheckIcon size={14} />
              Submit
            </Btn>
          </div>
        </div>
      );
    }
    if (message.summary) {
      return (
        <div className="py-3">
          <div
            className="flex items-center gap-2 text-sm font-semibold text-text-muted cursor-pointer select-none transition-colors duration-200 hover:text-accent"
            onClick={() => setShowSummaryContent(!showSummaryContent)}
          >
            <ChevronRightIcon size={14} className={`transition-transform duration-200 ${showSummaryContent ? 'rotate-90' : ''}`} />
            History Memory
          </div>
          {showSummaryContent && (
            <div
              className=" leading-normal max-h-[250px] overflow-y-auto text-text-default pt-0 pb-1 mt-2 border-t border-border"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.summary, isStreaming) }}
            />
          )}
        </div>
      );
    }
    if (message.role === 'assistant' || message.role === 'user' || message.role === 'system') {
      const contentToRender = message.displayContent || message.content;
      return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(contentToRender, isStreaming) }} />;
    }
    return <>{message.displayContent || message.content}</>;
  }, [isEditing, isStreaming, editText, editPageContext, editSelectedText, editAttachments, message.content, message.displayContent, message.role, message.summary, showSummaryContent, handleRemoveEditPageContext, handleRemoveEditSelectedText, handleRemoveEditAttachment, handleAddPageContextInEdit, handleAddSelectedTextInEdit, handleEditFileSelect, handleKeyDown, handleSubmit, handleCancel]);

  const groundingChunks = message.groundingMetadata?.groundingChunks;

  if (isStreaming) {
    const bubbleBgClass = message.role === 'user'
      ? 'bg-muted/40 border border-border rounded-lg rounded-br-sm'
      : 'bg-muted/40 border border-border rounded-lg rounded-bl-sm';

    return (
      <div className={`group flex flex-col gap-1 max-w-[92%] ${isStreaming ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-300'} ${message.role === 'user' ? 'self-end' : 'self-start'}`}>
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">{roleLabel}</div>
        <div className={`prose dark:prose-invert prose-sm prose-p:my-2 prose-hr:my-4 max-w-none relative break-words px-3.5 py-1.5 pb-2.5 ${bubbleBgClass}`} ref={bubbleRef} onMouseUp={handleMouseUp}>
          {/* Reasoning Section during streaming */}
          {streamingReasoningContent && (
            <ReasoningSection content={streamingReasoningContent} isStreaming={true} />
          )}
          {message.content ? (
            <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content, isStreaming) }} />
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

  const bubbleBgClass = message.role === 'user'
    ? 'bg-muted/40 border border-border rounded-lg rounded-br-sm'
    : message.role === 'error'
      ? 'bg-destructive/10 border border-destructive/20 text-destructive rounded-lg rounded-bl-sm'
      : 'bg-muted/40 border border-border rounded-lg rounded-bl-sm';

  return (
    <div className={`group flex flex-col gap-1 max-w-[92%] ${isStreaming ? '' : 'animate-in fade-in slide-in-from-bottom-2 duration-300'} ${message.role === 'user' ? 'self-end' : 'self-start'}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">
        {!message.summary && roleLabel}
        {message.isCompacted && !message.summary && (
          <span className="ml-1 opacity-50 font-medium">· Compacted</span>
        )}
      </div>
      <div className={`prose dark:prose-invert prose-sm prose-p:my-2 prose-hr:my-4 max-w-none relative break-words px-3.5 py-0 ${bubbleBgClass} ${isEditing ? 'ring-2 ring-primary/30' : ''} ${message.summary ? 'border-dashed border-primary/30 bg-primary/5' : ''}`} ref={bubbleRef} onMouseUp={handleMouseUp}>
        {message.pageContext && (
          <div className="flex items-center gap-2.5 px-3 py-2 my-2.5 bg-black/20 border border-white/5 rounded-md mt-4">
            <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-sm text-primary shrink-0">
              <GlobeIcon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-foreground truncate uppercase tracking-tight">{message.pageContext.pageTitle}</div>
              <div className="text-[10px] text-muted-foreground truncate opacity-70 mt-0.5">{message.pageContext.pageUrl}</div>
            </div>
          </div>
        )}
        {message.selectedText && (
          <div className="flex items-start gap-2.5 px-3 py-2 my-2.5 bg-black/20 border border-white/5 rounded-md">
            <div className="flex items-center justify-center w-8 h-8 bg-purple-500/10 rounded-sm text-purple-400 shrink-0">
              <FileTextIcon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
                "{message.selectedText.selectedText.length > 100
                  ? `${message.selectedText.selectedText.substring(0, 100)}...`
                  : message.selectedText.selectedText}"
              </div>
            </div>
          </div>
        )}
        {/* Reasoning Section */}
        {(message.reasoningContent || (isStreaming && streamingReasoningContent)) && (
          <ReasoningSection
            content={isStreaming ? streamingReasoningContent : message.reasoningContent || ''}
            isStreaming={isStreaming && !!streamingReasoningContent}
          />
        )}
        <div className="text-foreground text-sm leading-relaxed py-2.5">
          {renderedContent}
        </div>
        {message.generatedImages && message.generatedImages.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {message.generatedImages.map((img, idx) => {
              const src = `data:${img.mimeType};base64,${img.data}`;
              const imageKey = img.imageRef || (activeConversationId ? `img_${activeConversationId}_${messageIndex}_${idx}` : '');
              const favId = `db:${imageKey}`;
              const isFavorited = favorites.has(favId);

              return (
                <div key={idx} className="group/img w-full relative rounded-md overflow-hidden border border-border/50 shadow-md transition-transform hover:scale-[1.02]">
                  <img src={src} alt="Generated" className="my-0! w-full cursor-zoom-in" onClick={() => setLightboxSrc(src)} />
                  {isFavorited && (
                    <div className={`absolute top-2.5 left-2.5 p-1.5 bg-amber-500 rounded-lg shadow-lg shadow-amber-500/40 z-10 ${isStreaming ? '' : 'animate-in zoom-in-50 duration-300'}`}>
                      <StarIcon size={12} fill="white" className="text-white" />
                    </div>
                  )}
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <button
                      className={`h-6 w-6 flex items-center justify-center backdrop-blur-md rounded-sm transition-all
                        ${isFavorited ? 'bg-amber-500 text-white' : 'bg-black/60 text-white hover:bg-primary'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(favId);
                      }}
                      title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <StarIcon size={12} fill={isFavorited ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="h-6 w-6 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyImageToClipboard(src);
                      }}
                      title="Copy"
                    >
                      <CopyIcon size={12} />
                    </button>
                    <button
                      className="h-6 w-6 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        const a = document.createElement('a');
                        a.href = src;
                        a.download = `generated-${Date.now()}.${img.mimeType.split('/')[1] || 'png'}`;
                        a.click();
                      }}
                      title="Download"
                    >
                      <DownloadIcon size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {message.attachments.map((att, idx) => (
              att.type === 'image' ? (
                <div key={idx} className="relative rounded-sm overflow-hidden border border-border/50 group/att">
                  <img src={att.data} alt={att.name} className="w-12 h-12 object-cover cursor-zoom-in" onClick={() => setLightboxSrc(att.data)} />
                </div>
              ) : (
                <button
                  key={idx}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30 border border-border/50 rounded-sm hover:bg-muted/50 transition-all text-xs text-muted-foreground group/att"
                  onClick={() => setTextFileViewer({ isOpen: true, name: att.name, content: att.data })}
                >
                  <FileTextIcon size={14} className="text-primary/60" />
                  <span className="font-medium truncate max-w-[120px]">{att.name}</span>
                </button>
              )
            ))}
          </div>
        )}
        {groundingChunks && groundingChunks.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/10">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
              <GlobeIcon size={10} />
              Sources
            </div>
            <div className="flex flex-wrap gap-1">
              {groundingChunks.map((chunk, idx) => (
                chunk.web && (
                  <a
                    key={idx}
                    href={chunk.web.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2 py-1 bg-muted/20 border border-border/40 rounded-sm text-xs text-muted-foreground hover:bg-muted/40 hover:text-primary transition-all"
                  >
                    <span className="font-bold text-primary/60">[{idx + 1}]</span>
                    <span className="max-w-[140px] truncate">{chunk.web.title || new URL(chunk.web.uri).hostname}</span>
                  </a>
                )
              ))}
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
              <QuoteIcon size={14} />
            </button>
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
      {message.role === 'user' && !isStreaming && messageIndex !== undefined && (
        <div className={`flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 px-1 ${message.role === 'user' ? 'justify-end' : ''}`}>
          {!isEditing && (
            <MessageCopyButton content={message.content} />
          )}
          {onEdit && !isEditing && (
            <Btn size="icon-sm" variant="ghost" onClick={handleEditClick} title="Edit">
              <PencilIcon size={14} />
            </Btn>
          )}
          {onRegenerate && !isEditing && (
            <Btn size="icon-sm" variant="ghost" onClick={() => onRegenerate(messageIndex)} title="Regenerate">
              <RefreshCwIcon size={14} />
            </Btn>
          )}
          {onBranch && !isEditing && (
            <Btn size="icon-sm" variant="ghost" onClick={() => onBranch(messageIndex)} title="Branch">
              <GitBranchIcon size={14} />
            </Btn>
          )}
        </div>
      )}

      {/* Confirm Dialog for Submit with after-messages */}
      <ConfirmDialog
        isOpen={showSubmitConfirm}
        title="Regenerate Response?"
        message="Editing this message will clear all following messages and start a new response. Continue?"
        confirmLabel="Continue"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
      />

      {/* Confirm Dialog for Cancel with changes */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        variant="danger"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          isFavorited={favorites.has(
            (() => {
              if (!message.generatedImages) return '';
              const idx = message.generatedImages.findIndex(img => `data:${img.mimeType};base64,${img.data}` === lightboxSrc);
              if (idx === -1) return '';
              const img = message.generatedImages[idx];
              const imageKey = img.imageRef || (activeConversationId ? `img_${activeConversationId}_${messageIndex}_${idx}` : '');
              return `db:${imageKey}`;
            })()
          )}
          favId={(() => {
            if (!message.generatedImages) return '';
            const idx = message.generatedImages.findIndex(img => `data:${img.mimeType};base64,${img.data}` === lightboxSrc);
            if (idx === -1) return '';
            const img = message.generatedImages[idx];
            const imageKey = img.imageRef || (activeConversationId ? `img_${activeConversationId}_${messageIndex}_${idx}` : '');
            return `db:${imageKey}`;
          })()}
          onToggleFavorite={toggleFavorite}
          onClose={() => setLightboxSrc(null)}
        />
      )}

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

function copyImageToClipboard(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(false); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(false); return; }
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(() => resolve(true))
          .catch(() => resolve(false));
      }, 'image/png');
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function ImageLightbox({
  src,
  favId,
  isFavorited,
  onToggleFavorite,
  onClose
}: {
  src: string;
  favId?: string;
  isFavorited?: boolean;
  onToggleFavorite?: (id: string) => void;
  onClose: () => void;
}) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyImageToClipboard(src).then((ok) => {
      if (ok) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 1500);
      }
    });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let downloadUrl = src;
      let ext = 'png';

      // Parse extension from Data URL or file path
      if (src.startsWith('data:')) {
        const mimeMatch = src.match(/data:([^;]+);/);
        if (mimeMatch) {
          ext = mimeMatch[1].split('/')[1] || 'png';
        }
      } else {
        ext = src.split('.').pop()?.split('?')[0] || 'png';
        // For external URLs, fetch as blob to ensure download attribute works (CORS)
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          downloadUrl = URL.createObjectURL(blob);
        } catch (e) {
          console.error("Fetch failed, falling back to direct link", e);
        }
      }

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `attachment-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (downloadUrl.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
      }

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 1500);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center bg-background/95 backdrop-blur-2xl animate-in fade-in duration-300"
      onClick={onClose}
    >
      {/* Controls Overlay Header */}
      <div className="absolute inset-x-0 top-0 p-5 flex items-center justify-between z-10 bg-linear-to-b from-background to-transparent pointer-events-none">
        <div className="flex flex-col gap-0.5 pointer-events-auto">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary leading-none">
            Attachment Detail
          </span>
          <span className="text-sm font-bold text-foreground">
            Image Viewer
          </span>
        </div>
        <Btn
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full bg-background/40 backdrop-blur-md border border-border/50 hover:bg-destructive/10 hover:text-destructive pointer-events-auto"
        >
          <XIcon size={20} />
        </Btn>
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute inset-x-0 bottom-10 px-5 flex items-center justify-center gap-4 z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 p-1.5 bg-background/40 backdrop-blur-xl border border-white/5 rounded-lg pointer-events-auto shadow-2xl">
          {favId && onToggleFavorite && (
            <>
              <Btn
                variant="ghost"
                size="sm"
                className={`gap-2 ${isFavorited ? 'text-amber-500 bg-amber-500/10' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(favId);
                }}
              >
                <StarIcon size={14} fill={isFavorited ? "currentColor" : "none"} />
                {isFavorited ? 'Favorited' : 'Favorite'}
              </Btn>
              <div className="w-px h-4 bg-border/20 mx-1" />
            </>
          )}
          <Btn
            variant="ghost"
            size="sm"
            className={`gap-2 ${copySuccess ? 'text-green-500 bg-green-500/10' : ''}`}
            onClick={handleCopy}
          >
            {copySuccess ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {copySuccess ? 'Copied' : 'Copy'}
          </Btn>
          <div className="w-px h-4 bg-border/20 mx-1" />
          <Btn
            variant="ghost"
            size="sm"
            className={`gap-2 ${downloadSuccess ? 'text-primary bg-primary/10' : ''}`}
            onClick={handleDownload}
          >
            <DownloadIcon size={14} />
            {downloadSuccess ? 'Saving...' : 'Download'}
          </Btn>
        </div>
      </div>

      {/* Image Container */}
      <div
        className="max-w-[90vw] max-h-[75vh] relative animate-in zoom-in-95 duration-500"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src}
          alt="Preview"
          className="w-full h-full object-contain rounded-lg shadow-[0_0_100px_rgba(var(--primary-rgb),0.2)] grayscale-0"
        />
      </div>
    </div>
  );
}

function MessageCopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    copyToClipboard(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <Btn
      size="icon-sm"
      variant="ghost"
      className={copied ? 'text-green-500! bg-green-500/10!' : ''}
      onClick={handleCopy}
      title="Copy"
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </Btn>
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
  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 px-1">
      <MessageCopyButton content={content} />
      {onBranch && messageIndex !== undefined && (
        <Btn
          size="icon-sm"
          variant="ghost"
          onClick={() => onBranch(messageIndex)}
          title="Branch"
        >
          <GitBranchIcon size={14} />
        </Btn>
      )}
    </div>
  );
}

// Helper functions for table copy
function escapeCsvField(field: string): string {
  // If field contains comma, quote, or newline, wrap in quotes
  if (/[",\n\r]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function tableToCsv(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map((cell) => escapeCsvField(cell.textContent || '')).join(',');
    })
    .join('\n');
}

function tableToMarkdown(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  let markdown = '';

  rows.forEach((row, rowIndex) => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const rowText = cells.map((cell) => cell.textContent || '').join(' | ');
    markdown += `| ${rowText} |\n`;

    // Add separator after header row
    if (rowIndex === 0) {
      const separator = cells.map(() => '---').join(' | ');
      markdown += `| ${separator} |\n`;
    }
  });

  return markdown;
}

function tableToPlain(table: HTMLTableElement): string {
  const rows = Array.from(table.querySelectorAll('tr'));
  return rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map((cell) => cell.textContent || '').join('\t');
    })
    .join('\n');
}

async function copyTableAsCsv(table: HTMLTableElement): Promise<void> {
  const csv = tableToCsv(table);
  await copyToClipboard(csv);
}

async function copyTableAsMarkdown(table: HTMLTableElement): Promise<void> {
  const markdown = tableToMarkdown(table);
  await copyToClipboard(markdown);
}

async function copyTableAsPlain(table: HTMLTableElement): Promise<void> {
  const plain = tableToPlain(table);
  await copyToClipboard(plain);
}

function showButtonFeedback(btn: HTMLElement): void {
  btn.classList.add('copied');
  setTimeout(() => {
    btn.classList.remove('copied');
  }, 1500);
}

// Helper functions for table downloads
function downloadTableAsCsv(table: HTMLTableElement) {
  const csv = tableToCsv(table);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'table.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadTableAsMarkdown(table: HTMLTableElement) {
  const markdown = tableToMarkdown(table);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'table.md';
  link.click();
  URL.revokeObjectURL(link.href);
}

// Helper functions for file processing in edit mode
function processImageForEdit(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
