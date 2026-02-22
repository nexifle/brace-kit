import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import TurndownService from 'turndown';
import { renderMarkdown } from '../utils/markdown.ts';
import { copyToClipboard } from '../utils/formatters.ts';
import { useStore } from '../store/index.ts';
import { CloseIcon } from './icons/CloseIcon.tsx';
import type { Message, Attachment, PageContext, SelectedText } from '../types/index.ts';
import { TextFileViewer } from './TextFileViewer.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS, XAI_IMAGE_MODELS } from '../providers.ts';
import { CheckIcon, ChevronRightIcon, CopyIcon, GitBranchIcon, PencilIcon, RefreshCwIcon, XIcon, PlusIcon, FileTextIcon, GlobeIcon } from 'lucide-react';
import { Btn } from './ui/Btn.tsx';
import { MAX_FILE_SIZE, MAX_IMAGE_DIMENSION } from '../types/index.ts';

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

    // Check if it's an external link (has href and starts with http)
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      // Allow default behavior - let the browser handle the link
      // Chrome extension popup will handle this appropriately
      return;
    }

    // For citation links or other internal links, prevent default
    e.preventDefault();
  }, []);

  useEffect(() => {
    const ref = bubbleRef.current;
    if (!ref) return;

    ref.addEventListener('click', handleCopyCode as unknown as EventListener);
    ref.addEventListener('click', handleTableActions as unknown as EventListener);
    ref.addEventListener('click', handleLinkClick as unknown as EventListener);
    ref.addEventListener('click', handleImageActions as unknown as EventListener);

    return () => {
      ref.removeEventListener('click', handleCopyCode as unknown as EventListener);
      ref.removeEventListener('click', handleTableActions as unknown as EventListener);
      ref.removeEventListener('click', handleLinkClick as unknown as EventListener);
      ref.removeEventListener('click', handleImageActions as unknown as EventListener);
    };
  }, [handleCopyCode, handleTableActions, handleLinkClick, handleImageActions]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxSrc(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [lightboxSrc]);

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
                <CloseIcon size={14} />
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
                <CloseIcon size={10} />
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
                    <CloseIcon size={12} />
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
          <div className="mb-5 w-full flex justify-end gap-2 mt-2">
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
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.summary) }}
            />
          )}
        </div>
      );
    }
    if (message.role === 'assistant' || message.role === 'user' || message.role === 'system') {
      const contentToRender = message.displayContent || message.content;
      return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(contentToRender) }} />;
    }
    return <>{message.displayContent || message.content}</>;
  }, [isEditing, editText, editPageContext, editSelectedText, editAttachments, message.content, message.displayContent, message.role, message.summary, showSummaryContent, handleRemoveEditPageContext, handleRemoveEditSelectedText, handleRemoveEditAttachment, handleAddPageContextInEdit, handleAddSelectedTextInEdit, handleEditFileSelect, handleKeyDown, handleSubmit, handleCancel]);

  const groundingChunks = message.groundingMetadata?.groundingChunks;

  if (isStreaming) {
    const bubbleBgClass = message.role === 'user'
      ? 'bg-gradient-to-br from-brand-900 to-purple-900 rounded-lg rounded-br-sm'
      : 'bg-white/5 border border-border rounded-lg rounded-bl-sm';

    return (
      <div className={`group flex flex-col gap-1 max-w-full animate-fade-in ${message.role === 'user' ? 'self-end' : 'self-start'}`}>
        <div className="font-semibold uppercase tracking-wider text-text-subtle px-1.5">{roleLabel}</div>
        <div className={`prose prose-invert max-w-none relative break-words overflow-wrap px-4 py-1 pb-3 ${bubbleBgClass}`} ref={bubbleRef} onMouseUp={handleMouseUp}>
          {message.content ? (
            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }} />
          ) : (
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
          {isImageGenerationModel && (
            <div className="image-generation-skeleton">
              <div className="image-generation-skeleton-shimmer" />
              <div className="image-generation-skeleton-label">Generating image...</div>
            </div>
          )}

          {quotePopup.visible && (
            <div
              className="absolute z-50 flex items-center bg-bg-surface-raised border border-border rounded-lg shadow-lg p-0.5 animate-fade-in"
              style={{ left: quotePopup.x, top: quotePopup.y, transform: 'translate(-50%, -100%)' }}
              onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
            >
              <button
                className="flex items-center justify-center w-7 h-7 border-none bg-transparent text-text-default rounded-sm cursor-pointer transition-all duration-150 hover:bg-brand-400 hover:text-white"
                onClick={handleQuoteClick}
                title="Quote selection"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4c0 3.5-3 5.5-5 5.5" />
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4c0 3.5-3 5.5-5 5.5" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const bubbleBgClass = message.role === 'user'
    ? 'bg-gradient-to-br from-brand-900 to-purple-900 rounded-lg rounded-br-sm'
    : message.role === 'error'
      ? 'bg-danger-400/10 border border-danger-400/30 text-danger-400 rounded-lg rounded-bl-sm'
      : 'bg-white/5 border border-border rounded-lg rounded-bl-sm';

  return (
    <div className={`group flex flex-col gap-1 max-w-full animate-fade-in ${message.role === 'user' ? 'self-end' : 'self-start'}`}>
      <div className="font-semibold uppercase tracking-wider text-text-subtle px-1.5">
        {!message.summary && roleLabel}
        {message.isCompacted && !message.summary && (
          <span className="ml-1 opacity-70" title="This message is compressed & removed from context window">
            (compacted)
          </span>
        )}
      </div>
      <div className={`prose prose-invert prose-img:m-0 max-w-none relative break-words overflow-wrap px-4 py-0 ${bubbleBgClass} ${isEditing ? 'editing' : ''} ${message.summary ? 'is-summary' : ''}`} ref={bubbleRef} onMouseUp={handleMouseUp}>
        {message.pageContext && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 mb-2.5 bg-black/30 border border-border rounded-md mt-4">
            <div className="flex items-center justify-center w-8 h-8 bg-brand-400/15 rounded-sm text-accent shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="text-[0.85rem] font-semibold text-text-default truncate mb-0.5">{message.pageContext.pageTitle}</div>
              <div className="text-[0.7rem] text-text-subtle truncate">{message.pageContext.pageUrl}</div>
            </div>
          </div>
        )}
        {message.selectedText && (
          <div className="flex items-start gap-2.5 px-3 py-2.5 mb-2.5 bg-black/30 border border-border rounded-md">
            <div className="flex items-center justify-center w-8 h-8 bg-purple-400/15 rounded-sm text-accent-subtle shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="text-[0.8rem] text-text-muted italic leading-tight mb-1 line-clamp-2">
                {message.selectedText.selectedText.length > 100
                  ? `${message.selectedText.selectedText.substring(0, 100)}...`
                  : message.selectedText.selectedText}
              </div>
              <div className="text-[0.7rem] text-text-subtle truncate">From: {message.selectedText.pageTitle}</div>
            </div>
          </div>
        )}
        {renderedContent}
        {message.generatedImages && message.generatedImages.length > 0 && (
          <div className="generated-images">
            {message.generatedImages.map((img, idx) => {
              const src = `data:${img.mimeType};base64,${img.data}`;
              const ext = img.mimeType.split('/')[1] || 'png';
              const filename = `generated-image-${idx + 1}.${ext}`;

              const handleCopy = () => {
                fetch(src)
                  .then(r => r.blob())
                  .then(blob => navigator.clipboard.write([new ClipboardItem({ [img.mimeType]: blob })]));
              };

              const handleDownload = () => {
                const a = document.createElement('a');
                a.href = src;
                a.download = filename;
                a.click();
              };

              return (
                <div key={idx} className="generated-image-card mb-5">
                  <img src={src} alt={`Generated image ${idx + 1}`} />
                  <div className="generated-image-actions">
                    <button className="generated-image-btn" onClick={handleCopy} title="Copy image">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      Copy
                    </button>
                    <button className="generated-image-btn" onClick={handleDownload} title="Download image">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((att, idx) => (
              att.type === 'image' ? (
                <img
                  key={idx}
                  src={att.data}
                  alt={att.name}
                  style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}
                  title={att.name}
                />
              ) : att.type === 'text' ? (
                <div
                  key={idx}
                  className="text-file-attachment"
                  onClick={() => setTextFileViewer({ isOpen: true, name: att.name, content: att.data })}
                  title={`Click to view ${att.name}`}
                >
                  <div className="text-file-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                  </div>
                  <div className="text-file-name">{att.name}</div>
                </div>
              ) : null
            ))}
          </div>
        )}
        {groundingChunks && groundingChunks.length > 0 && (
          <div className="grounding-citations">
            <div className="grounding-citations-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
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
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                    </svg>
                  </a>
                )
              ))}
            </div>
          </div>
        )}
        {quotePopup.visible && (
          <div
            className="absolute z-50 flex items-center bg-bg-surface-raised border border-border rounded-lg shadow-lg p-0.5 animate-fade-in"
            style={{ left: quotePopup.x, top: quotePopup.y, transform: 'translate(-50%, -100%)' }}
            onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
          >
            <button
              className="flex items-center justify-center w-7 h-7 border-none bg-transparent text-text-default rounded-sm cursor-pointer transition-all duration-150 hover:bg-brand-400 hover:text-white"
              onClick={handleQuoteClick}
              title="Quote selection"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4c0 3.5-3 5.5-5 5.5" />
                <path d="M15 21c3 0 7-1 7-8V5c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v6c0 1.1.9 2 2 2h4c0 3.5-3 5.5-5 5.5" />
              </svg>
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
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {onEdit && !isEditing && (
            <Btn
              size='icon-sm'
              variant='ghost'
              onClick={handleEditClick}
              title="Edit message"
            >
              <PencilIcon size={14} />
            </Btn>
          )}
          {onRegenerate && !isEditing && (
            <Btn
              size='icon-sm'
              variant='ghost'
              onClick={() => onRegenerate(messageIndex)}
              title="Regenerate response"
            >
              <RefreshCwIcon size={14} />
            </Btn>
          )}
          {onBranch && !isEditing && (
            <Btn
              size='icon-sm'
              variant='ghost'
              onClick={() => onBranch(messageIndex)}
              title="Branch from here"
            >
              <GitBranchIcon size={14} />
            </Btn>
          )}
        </div>
      )}

      {/* Confirm Dialog for Submit with after-messages */}
      <ConfirmDialog
        isOpen={showSubmitConfirm}
        title="Confirm Edit"
        message="Editing this message will clear all subsequent messages and regenerate the response. Continue?"
        confirmLabel="Continue"
        cancelLabel="Cancel"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
      />

      {/* Confirm Dialog for Cancel with changes */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Discard Changes"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        variant="danger"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
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

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleCopy = () => {
    copyImageToClipboard(src).then((ok) => {
      if (ok) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 1500);
      }
    });
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    const ext = src.split('.').pop()?.split('?')[0] || 'png';
    a.download = `image.${ext}`;
    a.click();
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 1500);
  };

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          className={`lightbox-btn${copySuccess ? ' lightbox-btn-success' : ''}`}
          onClick={handleCopy}
          title="Copy image"
        >
          {copySuccess ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
        </button>
        <button
          className={`lightbox-btn${downloadSuccess ? ' lightbox-btn-success' : ''}`}
          onClick={handleDownload}
          title="Download image"
        >
          {downloadSuccess ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </button>
        <button className="lightbox-btn lightbox-close-btn" onClick={onClose} title="Close (Esc)">
          <CloseIcon size={15} />
        </button>
      </div>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt="Lightbox preview" className="lightbox-img" />
      </div>
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
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
      <Btn
        size='icon-sm'
        variant='ghost'
        className={copied ? 'text-success-400! bg-success-400/10!' : 'text-text-subtle'}
        onClick={handleCopy}
        title="Copy response"
      >
        {copied ? (
          <CheckIcon size={14} />
        ) : (
          <CopyIcon size={14} />
        )}
      </Btn>
      {onBranch && messageIndex !== undefined && (
        <Btn
          size='icon-sm'
          variant='ghost'
          onClick={() => onBranch(messageIndex)}
          title="Branch from here"
        >
          <GitBranchIcon size={14} />
        </Btn>
      )}
    </div>
  );
}