import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { computePopoverPlacement } from '../../utils/popover.ts';
import { cn } from '../../utils/cn.ts';
import { SearchIcon, XIcon, SearchXIcon } from 'lucide-react';

// =============================================================================
// Shared popover bits (also used by the settings ProviderSelect)
// =============================================================================

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="min-w-4.5 h-4 px-1 inline-flex items-center justify-center rounded-sm border border-border bg-muted/70 font-mono text-[10px] leading-none text-muted-foreground/70 shadow-[0_1px_0_theme(colors.border)]">
      {children}
    </kbd>
  );
}

export function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-1">
      <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/50">{label}</span>
      <span className="text-2xs tabular-nums text-muted-foreground/30">{count}</span>
      <span className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// =============================================================================
// ComboPopover — generic "select + search" popover shell
// =============================================================================

export interface ComboRow<T> {
  key: string;
  /** payload passed back on selection (optional for label rows) */
  item?: T;
  /** text used for search matching (empty = hidden while searching) */
  searchText: string;
  /** whether this row is selectable (labels are not) */
  selectable: boolean;
  /** row content; `highlighted` = current keyboard highlight */
  render: (highlighted: boolean, actions: { select: () => void; close: () => void }) => ReactNode;
}

interface ComboPopoverProps<T> {
  /** trigger element; receives open state + a11y attrs + toggle */
  trigger: (ctx: {
    open: boolean;
    toggle: () => void;
    a11y: { 'aria-haspopup': 'listbox'; 'aria-expanded': boolean; 'aria-controls': string };
  }) => ReactNode;
  rows: ComboRow<T>[];
  placeholder: string;
  ariaLabel: string;
  listboxId: string;
  emptyState?: ReactNode;
  /** footer content; always visible, never scrolled away. Receives close(). */
  footer?: (actions: { close: () => void }) => ReactNode;
  /** fired every time the popover opens (e.g. auto-fetch models) */
  onOpen?: () => void;
  /** fired when a row is chosen via Enter or click — the popover is already closed */
  onSelect: (row: ComboRow<T>) => void;
  minWidth?: number;
  wrapperClassName?: string;
}

export function ComboPopover<T>({
  trigger,
  rows,
  placeholder,
  ariaLabel,
  listboxId,
  emptyState,
  footer,
  onOpen,
  onSelect,
  minWidth = 0,
  wrapperClassName,
}: ComboPopoverProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [abovePlaced, setAbovePlaced] = useState(false);
  const [pos, setPos] = useState<
    | { top?: number; bottom?: number; left: number; width: number; maxHeight: number }
    | null
  >(null);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.searchText && r.searchText.toLowerCase().includes(q));
  }, [rows, search]);

  // Keep the highlight index within bounds whenever the list changes
  useEffect(() => {
    setActiveIdx((prev) => Math.min(prev, Math.max(selectable.length - 1, 0)));
  }, [selectable.length]);

  const close = useCallback(() => setOpen(false), []);

  const openPopover = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { top, bottom, maxHeight, flipAbove } = computePopoverPlacement(rect, window.innerHeight);
    const width = Math.max(rect.width, minWidth);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    // When flipped above, anchor by the BOTTOM edge at the trigger's top so a
    // short popover hugs the trigger instead of floating at the viewport top.
    setPos(flipAbove ? { bottom, left, width, maxHeight } : { top, left, width, maxHeight });
    setAbovePlaced(flipAbove);
    setSearch('');
    setActiveIdx(0);
    setOpen(true);
  }, [minWidth]);

  const toggle = useCallback(() => (open ? close() : openPopover()), [open, close, openPopover]);

  // onOpen hook
  useEffect(() => {
    if (open) onOpen?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside pointer down, scroll (outside the popover), or resize
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (t instanceof Node && (popoverRef.current?.contains(t) || wrapperRef.current?.contains(t))) return;
      close();
    };
    const onScroll = (e: Event) => {
      const target = e.target;
      // e.target is the window for resize (and window is not a Node, so
      // contains() would throw) — only let events originating inside the
      // popover (e.g. scrolling the list) pass through.
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Autofocus the search field on open
  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  // Keep the highlighted row visible
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, visible]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (selectable.length ? (i + 1) % selectable.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (selectable.length ? (i - 1 + selectable.length) % selectable.length : 0));
      } else if (e.key === 'Enter') {
        const row = selectable[activeIdx];
        if (row) {
          e.preventDefault();
          close();
          onSelect(row);
        }
      }
    },
    [selectable, activeIdx, close, onSelect]
  );

  const hasSelectable = visible.some((r) => r.selectable);

  return (
    <>
      <div ref={wrapperRef} className={cn('relative', wrapperClassName)}>
        {trigger({
          open,
          toggle,
          a11y: { 'aria-haspopup': 'listbox', 'aria-expanded': open, 'aria-controls': listboxId },
        })}
      </div>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              ...(abovePlaced ? { bottom: window.innerHeight - (pos.bottom ?? 0) } : { top: pos.top }),
              left: pos.left,
              width: pos.width,
            }}
            className={`fixed z-[70] animate-in fade-in zoom-in-95 duration-200 ${
              abovePlaced ? 'origin-bottom slide-in-from-bottom-2' : 'origin-top slide-in-from-top-2'
            }`}
            onKeyDown={handleKeyDown}
          >
            <div
              style={{ maxHeight: pos.maxHeight }}
              className="bg-popover/95 backdrop-blur-xl border border-border rounded-md shadow-2xl shadow-black/15 overflow-hidden flex flex-col"
            >
              {/* Search */}
              <div className="p-2.5 pb-2 border-b border-border/60 shrink-0">
                <div className="relative">
                  <SearchIcon
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
                  />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setActiveIdx(0);
                    }}
                    placeholder={placeholder}
                    className="w-full h-9 pl-9 pr-8 text-sm bg-muted/40 border border-transparent focus:border-primary/40 focus:bg-background rounded-md outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                  />
                  {search && (
                    <button
                      onClick={() => {
                        setSearch('');
                        searchRef.current?.focus();
                      }}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
                      title="Clear search"
                    >
                      <XIcon size={12} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-2 px-1.5 text-2xs text-muted-foreground/40">
                  <span className="flex items-center gap-1">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                    <span>navigate</span>
                  </span>
                  <span className="w-px h-3 bg-border" />
                  <span className="flex items-center gap-1">
                    <Kbd>↵</Kbd>
                    <span>select</span>
                  </span>
                  <span className="w-px h-3 bg-border" />
                  <span className="flex items-center gap-1">
                    <Kbd>esc</Kbd>
                    <span>close</span>
                  </span>
                </div>
              </div>

              {/* List — grow-0 shrink (no flex-grow) so it shrink-wraps short
                  content; shrinks + scrolls only when content exceeds the
                  popover max-height */}
              <div id={listboxId} role="listbox" aria-label={ariaLabel} className="shrink basis-auto min-h-0 overflow-y-auto p-1.5">
                {!hasSelectable ? (
                  emptyState ?? (
                    <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                      <SearchXIcon size={20} className="text-muted-foreground/40" />
                      <div className="flex flex-col gap-0.5">
                        <p className="text-sm font-medium text-foreground">Nothing found</p>
                        <p className="text-2xs text-muted-foreground/60">Try a different search</p>
                      </div>
                    </div>
                  )
                ) : (
                  (() => {
                    let seen = -1;
                    return visible.map((row) => {
                      const isSel = row.selectable;
                      if (isSel) seen++;
                      const rowIndex = seen; // snapshot for closures below
                      const highlighted = isSel && rowIndex === activeIdx;
                      const select = () => {
                        close();
                        onSelect(row);
                      };
                      return (
                        <div
                          key={row.key}
                          ref={highlighted ? activeRowRef : undefined}
                          onClick={isSel ? select : undefined}
                          onMouseEnter={isSel ? () => setActiveIdx(rowIndex) : undefined}
                          className={cn(isSel && 'cursor-pointer')}
                        >
                          {row.render(highlighted, { select, close })}
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              {/* Footer — always visible, never scrolled away */}
              {footer && <div className="p-1.5 border-t border-border/60 bg-muted/20 shrink-0">{footer({ close })}</div>}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
