import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownloadIcon, FileTextIcon, FileCode2Icon, Loader2Icon } from 'lucide-react';
import { Btn } from './ui/Btn.tsx';
import { exportConversationToMarkdown, downloadMarkdown } from '../utils/exportMarkdown.ts';
import { exportConversationToHtml, downloadHtml, makeExportBasename } from '../utils/exportHtml.ts';
import { getConversationMessages } from '../utils/conversationDB.ts';
import type { Conversation, Message } from '../types/index.ts';

interface ExportMenuProps {
  conversation: Conversation;
  messages: Message[];
  /** controlled open state (e.g. so a parent can keep its row visible) */
  open?: boolean;
  /** fired with the new open state (always fired, even in uncontrolled mode) */
  onOpenChange?: (open: boolean) => void;
  /** extra classes for the trigger button */
  className?: string;
  /** icon size in px */
  iconSize?: number;
}

const MENU_WIDTH = 192; // matches w-48
const MENU_GAP = 6;

interface MenuPos {
  top: number;
  left: number;
}

/**
 * Shared "Export conversation" menu (Markdown / HTML). Renders a download
 * trigger that opens a portal popover — portal + fixed positioning guarantee
 * it is never clipped by overflow/opacity ancestors (history drawer, header).
 */
export function ExportMenu({
  conversation,
  messages,
  open,
  onOpenChange,
  className = '',
  iconSize = 14,
}: ExportMenuProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [exporting, setExporting] = useState<'markdown' | 'html' | null>(null);
  const [pos, setPos] = useState<MenuPos | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isOpen = open !== undefined ? open : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange]
  );

  // Compute the popover position when opening.
  useEffect(() => {
    if (!isOpen) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const placeTop = spaceBelow < MENU_GAP + 120 && spaceAbove > spaceBelow;
    setPos({
      top: placeTop ? Math.max(8, r.top - MENU_GAP) : r.bottom + MENU_GAP,
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, setOpen]);

  const handleExport = useCallback(
    async (format: 'markdown' | 'html') => {
      setOpen(false);
      setExporting(format);
      try {
        let msgs = messages;
        if (msgs.length === 0) {
          msgs = (await getConversationMessages(conversation.id)) || [];
        }
        const base = makeExportBasename(conversation);
        if (format === 'markdown') {
          downloadMarkdown(`${base}.md`, exportConversationToMarkdown(conversation, msgs));
        } else {
          const html = await exportConversationToHtml(conversation, msgs);
          downloadHtml(`${base}.html`, html);
        }
      } catch (err) {
        console.error('[ExportMenu] Export failed:', err);
      } finally {
        setExporting(null);
      }
    },
    [conversation, messages, setOpen]
  );

  return (
    <>
      <span ref={triggerRef} className="inline-flex">
        <Btn
          type="button"
          variant="ghost"
          size="icon-sm"
          className={`h-6 w-6 text-muted-foreground hover:text-primary ${isOpen ? 'text-primary bg-primary/10' : ''} ${className}`}
          title="Export conversation"
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!isOpen);
          }}
        >
          {exporting ? (
            <Loader2Icon size={iconSize} className="animate-spin" />
          ) : (
            <DownloadIcon size={iconSize} />
          )}
        </Btn>
      </span>
      {isOpen &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Export conversation"
            className="fixed z-[120] w-48 bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
            style={{ top: pos.top, left: pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent transition-colors"
              onClick={() => handleExport('markdown')}
            >
              <FileTextIcon size={15} className="mt-0.5 text-muted-foreground shrink-0" />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-foreground">Markdown</span>
                <span className="text-2xs text-muted-foreground leading-snug">Plain-text transcript (.md)</span>
              </span>
            </button>
            <div className="h-px bg-border/60 mx-3" />
            <button
              type="button"
              role="menuitem"
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-accent transition-colors"
              onClick={() => handleExport('html')}
            >
              <FileCode2Icon size={15} className="mt-0.5 text-muted-foreground shrink-0" />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-semibold text-foreground">HTML</span>
                <span className="text-2xs text-muted-foreground leading-snug">Polished interactive page (.html)</span>
              </span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}
