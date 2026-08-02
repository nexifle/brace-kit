import { useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { cn } from '../../utils/cn.ts';
import { SearchIcon, XIcon, SearchXIcon } from 'lucide-react';

// =============================================================================
// Shared popover bits (also used by the settings ProviderSelect)
// =============================================================================

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="min-w-4.5 h-4 px-1 inline-flex items-center justify-center rounded-sm border border-border bg-muted/70 font-mono text-[10px] leading-none text-muted-foreground">
      {children}
    </kbd>
  );
}

export function SectionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-2 pt-2 pb-0.5">
      <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-2xs tabular-nums text-muted-foreground">{count}</span>
      <span className="flex-1 h-px bg-border/50" />
    </div>
  );
}

// =============================================================================
// ComboRow / ComboList — a search input + selectable list (self-contained)
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

interface ComboListProps<T> {
  rows: ComboRow<T>[];
  /** fired when a row is chosen via Enter or click (the caller decides whether to close) */
  onSelect: (row: ComboRow<T>) => void;
  placeholder: string;
  ariaLabel: string;
  listboxId: string;
  emptyState?: ReactNode;
  /** focus the search input on mount (when the popover opens) */
  autoFocus?: boolean;
  /** max-height of the scrollable list area (px) */
  maxHeight?: number;
  /** show the ↑↓ ↵ esc hints row under the search */
  showHints?: boolean;
  /** close callback exposed to row renders (e.g. trash actions) */
  onRequestClose?: () => void;
}

/** A self-contained search + selectable list. Used by ComboPopover and by the
 *  two-section ComposerPicker popup. */
export function ComboList<T>({
  rows,
  onSelect,
  placeholder,
  ariaLabel,
  listboxId,
  emptyState,
  autoFocus = false,
  maxHeight,
  showHints = false,
  onRequestClose,
}: ComboListProps<T>) {
  const [search, setSearch] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeRowRef = useRef<HTMLDivElement>(null);

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

  // Focus the search when the popover mounts
  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => searchRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onSelect(row);
        }
      }
    },
    [selectable, activeIdx, onSelect]
  );

  const hasSelectable = visible.some((r) => r.selectable);

  return (
    <div className="flex flex-col">
      {/* Search */}
      <div className="px-2.5 pt-2 pb-2 shrink-0">
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
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full h-8 pl-9 pr-8 text-sm bg-muted/40 border border-transparent focus:border-primary/40 focus:bg-background rounded-md outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
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
        {showHints && (
          <div className="flex items-center gap-2 mt-2 px-1.5 text-2xs text-muted-foreground">
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
        )}
      </div>

      {/* List */}
      <div
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel}
        style={maxHeight ? { maxHeight } : undefined}
        className={cn('shrink basis-auto min-h-0 overflow-y-auto p-1.5')}
      >
        {!hasSelectable ? (
          emptyState ?? (
            <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
              <SearchXIcon size={20} className="text-muted-foreground/40" />
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">Nothing found</p>
                <p className="text-2xs text-muted-foreground">Try a different search</p>
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
              const select = () => onSelect(row);
              return (
                <div
                  key={row.key}
                  ref={highlighted ? activeRowRef : undefined}
                  onClick={isSel ? select : undefined}
                  onMouseEnter={isSel ? () => setActiveIdx(rowIndex) : undefined}
                  className={cn(isSel && 'cursor-pointer')}
                >
                  {row.render(highlighted, { select, close: onRequestClose ?? (() => {}) })}
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );
}
