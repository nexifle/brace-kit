import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import TurndownService from 'turndown';
import { renderMarkdown } from '../utils/markdown.ts';
import { copyToClipboard } from '../utils/formatters.ts';
import { useStore } from '../store/index.ts';
import type { Message } from '../types/index.ts';
import { TextFileViewer } from './TextFileViewer.tsx';
import { GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS } from '../providers.ts';

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

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  messageIndex?: number;
  onBranch?: (index: number) => void;
  onRegenerate?: (index: number) => void;
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

export function MessageBubble({ message, isStreaming, messageIndex, onBranch, onRegenerate }: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [quotePopup, setQuotePopup] = useState<QuotePopupState>({ visible: false, x: 0, y: 0, text: '' });
  const [textFileViewer, setTextFileViewer] = useState<TextFileViewerState>({ isOpen: false, name: '', content: '' });
  const setQuotedText = useStore((state) => state.setQuotedText);
  const currentModel = useStore((state) => state.providerConfig.model || '');
  const isImageGenerationModel = GEMINI_NO_TOOLS_MODELS.includes(currentModel) || GEMINI_SEARCH_ONLY_MODELS.includes(currentModel);

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

  useEffect(() => {
    const ref = bubbleRef.current;
    if (!ref) return;

    ref.addEventListener('click', handleCopyCode as unknown as EventListener);
    ref.addEventListener('click', handleTableActions as unknown as EventListener);

    return () => {
      ref.removeEventListener('click', handleCopyCode as unknown as EventListener);
      ref.removeEventListener('click', handleTableActions as unknown as EventListener);
    };
  }, [handleCopyCode, handleTableActions]);

  const roleLabel = message.role === 'user' ? 'You' : message.role === 'error' ? 'Error' : 'AI';

  const renderedContent = useMemo(() => {
    if (message.role === 'assistant' || message.role === 'user') {
      const contentToRender = message.displayContent || message.content;
      return <div dangerouslySetInnerHTML={{ __html: renderMarkdown(contentToRender) }} />;
    }
    return <>{message.displayContent || message.content}</>;
  }, [message.content, message.displayContent, message.role]);

  const groundingChunks = message.groundingMetadata?.groundingChunks;

  if (isStreaming) {
    return (
      <div className={`message ${message.role}`}>
        <div className="message-role">{roleLabel}</div>
        <div className="message-bubble" ref={bubbleRef} onMouseUp={handleMouseUp}>
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
              className="quote-popup"
              style={{ left: quotePopup.x, top: quotePopup.y }}
              onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
            >
              <button className="quote-btn" onClick={handleQuoteClick} title="Quote selection">
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

  return (
    <div className={`message ${message.role}`}>
      <div className="message-role">{roleLabel}</div>
      <div className="message-bubble" ref={bubbleRef} onMouseUp={handleMouseUp}>
        {message.pageContext && (
          <div className="page-attachment">
            <div className="page-attachment-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
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
                <path d="M4 7h16M4 12h16M4 17h10" />
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
                <div key={idx} className="generated-image-card">
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
            className="quote-popup"
            style={{ left: quotePopup.x, top: quotePopup.y }}
            onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
          >
            <button className="quote-btn" onClick={handleQuoteClick} title="Quote selection">
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
        <div className="message-actions">
          {onRegenerate && (
            <button
              className="msg-action-btn"
              onClick={() => onRegenerate(messageIndex)}
              title="Regenerate response"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
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
                <line x1="6" y1="3" x2="6" y2="15" />
                <circle cx="18" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <path d="M18 9a9 9 0 0 1-9 9" />
              </svg>
              <span>Branch</span>
            </button>
          )}
        </div>
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
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Copied!</span>
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          <span>Branch</span>
        </button>
      )}
    </div>
  );
}