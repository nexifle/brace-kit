import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useProvider } from '../../hooks/useProvider.ts';
import { PROVIDER_PRESETS, FORMAT_LABELS } from '../../providers';
import { useStore } from '../../store/index.ts';
import type { CustomProvider, ProviderPreset } from '../../types/index.ts';
import { SearchIcon, XIcon, PlusIcon, CheckIcon, ChevronDownIcon, SearchXIcon, Trash2Icon } from 'lucide-react';
import { Kbd, SectionLabel } from '../ui/ComboPopover.tsx';
import { ProviderMark } from '../ui/ProviderMark.tsx';

export type SelectableProvider = ProviderPreset | CustomProvider;

interface ProviderSelectProps {
  onAddClick: () => void;
  onRequestRemove: (p: { id: string; name: string }) => void;
}

// Placement helpers live in src/utils/popover.ts (shared with the chat
// ComboPopover) — re-exported here so existing imports/tests keep working.
import {
  computePopoverPlacement,
  POPOVER_MIN_HEIGHT,
  POPOVER_GAP,
  type PopoverPlacement,
} from '../../utils/popover.ts';

export { computePopoverPlacement, POPOVER_MIN_HEIGHT, POPOVER_GAP, type PopoverPlacement };

/**
 * Flatten the popover list: pinned active provider first, then remaining
 * built-ins, then remaining custom providers.
 */
export function flattenSelectable(
  pinned: SelectableProvider | null,
  restBuiltIns: SelectableProvider[],
  restCustoms: SelectableProvider[]
): SelectableProvider[] {
  return [...(pinned ? [pinned] : []), ...restBuiltIns, ...restCustoms];
}

// =============================================================================
// ProviderSelect
// =============================================================================

export function ProviderSelect({ onAddClick, onRequestRemove }: ProviderSelectProps) {
  const { providerConfig, availableProviders, isCustomProvider, switchProvider } = useProvider();
  const providerKeys = useStore((s) => s.providerKeys);

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
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = useMemo(
    () => availableProviders.find((p) => p.id === providerConfig.providerId) ?? null,
    [availableProviders, providerConfig.providerId]
  );

  const builtIns = useMemo(
    () => Object.values(PROVIDER_PRESETS).filter((p) => !isCustomProvider(p.id)),
    [isCustomProvider]
  );
  const customs = useMemo(
    () => availableProviders.filter((p) => isCustomProvider(p.id)),
    [availableProviders, isCustomProvider]
  );

  const filter = useCallback(
    (p: SelectableProvider) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        FORMAT_LABELS[p.format].toLowerCase().includes(q) ||
        p.apiUrl.toLowerCase().includes(q)
      );
    },
    [search]
  );

  const filteredBuiltIns = useMemo(() => builtIns.filter(filter), [builtIns, filter]);
  const filteredCustoms = useMemo(() => customs.filter(filter), [customs, filter]);

  // Pin the active provider at the top of the list (when it matches the search),
  // then the remaining built-ins, then remaining custom providers.
  const pinned = useMemo(() => {
    if (!current) return null;
    return filter(current) ? current : null;
  }, [current, filter]);

  const restBuiltIns = useMemo(
    () => filteredBuiltIns.filter((p) => p.id !== pinned?.id),
    [filteredBuiltIns, pinned]
  );
  const restCustoms = useMemo(
    () => filteredCustoms.filter((p) => p.id !== pinned?.id),
    [filteredCustoms, pinned]
  );

  const selectable = useMemo(
    () => flattenSelectable(pinned, restBuiltIns, restCustoms),
    [pinned, restBuiltIns, restCustoms]
  );

  // Keep active index within bounds whenever the list changes
  useEffect(() => {
    setActiveIdx((prev) => Math.min(prev, Math.max(selectable.length - 1, 0)));
  }, [selectable.length]);

  const close = useCallback(() => setOpen(false), []);

  const openPopover = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { top, bottom, maxHeight, flipAbove } = computePopoverPlacement(rect, window.innerHeight);
    setPos(flipAbove ? { bottom, left: rect.left, width: rect.width, maxHeight } : { top, left: rect.left, width: rect.width, maxHeight });
    setAbovePlaced(flipAbove);
    setSearch('');
    setActiveIdx(Math.max(0, selectable.indexOf(current as SelectableProvider)));
    setOpen(true);
  }, [selectable, current]);

  const selectProvider = useCallback(
    (p: SelectableProvider) => {
      switchProvider(p.id);
      close();
    },
    [switchProvider, close]
  );

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
      // popover (e.g. scrolling the model list) pass through.
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
    rowRefs.current[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (selectable.length ? (i + 1) % selectable.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (selectable.length ? (i - 1 + selectable.length) % selectable.length : 0));
      } else if (e.key === 'Enter') {
        const p = selectable[activeIdx];
        if (p) selectProvider(p);
      }
    },
    [selectable, activeIdx, selectProvider]
  );

  const isConfigured = useCallback(
    (p: SelectableProvider) => {
      if (p.format === 'ollama') return true;
      const saved = providerKeys[p.id];
      const key =
        saved?.apiKey ||
        (p.id === providerConfig.providerId ? providerConfig.apiKey : '') ||
        (p as CustomProvider).apiKey;
      return !!key;
    },
    [providerKeys, providerConfig]
  );

  const renderRow = (p: SelectableProvider, idx: number) => {
    const isActive = p.id === providerConfig.providerId;
    const isCustom = isCustomProvider(p.id);
    const highlighted = idx === activeIdx;

    return (
      <div key={p.id} className="group relative">
        <div
          ref={(el) => {
            rowRefs.current[idx] = el;
          }}
          role="option"
          aria-selected={isActive}
          onClick={() => selectProvider(p)}
          onMouseEnter={() => setActiveIdx(idx)}
          className={`w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-md text-left transition-all duration-150 border cursor-pointer
            ${isActive
              ? 'bg-primary/10 border-primary/25'
              : highlighted
                ? 'bg-accent/80 border-accent'
                : 'bg-transparent border-transparent hover:bg-accent/50'
            }`}
        >
          <ProviderMark id={p.id} name={p.name} size={32} />

          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className={`text-sm font-medium truncate leading-tight ${isActive ? 'text-primary' : 'text-foreground'}`}>
              {p.name}
            </span>
            <span className="text-2xs text-muted-foreground/70 truncate">
              {isActive && providerConfig.model
                ? `Using ${providerConfig.model}`
                : FORMAT_LABELS[p.format]}
            </span>
          </span>

          {isActive ? (
            <span className="shrink-0 flex items-center gap-1.5">
              <span className="text-2xs font-bold uppercase tracking-wide text-primary bg-primary/15 rounded-full px-2 py-0.5">
                Active
              </span>
              <span className="w-4.5 h-4.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                <CheckIcon size={10} strokeWidth={3.5} />
              </span>
            </span>
          ) : (
            <span className="shrink-0 flex items-center">
              <span
                className={`w-1.5 h-1.5 rounded-full ${isConfigured(p) ? 'bg-success' : 'bg-warning'}`}
                title={isConfigured(p) ? 'Configured' : 'API key needed'}
              />
            </span>
          )}

          {/* Remove — inline row action, styled to match the item (same radius &
              rhythm as the row). Appears on hover/focus for custom providers. */}
          {isCustom && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                close();
                onRequestRemove({ id: p.id, name: p.name });
              }}
              className="shrink-0 -mr-0.5 h-7 w-7 flex items-center justify-center rounded-md text-destructive dark:text-red-400 opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 dark:hover:bg-red-400/10 hover:text-destructive dark:hover:text-red-300 active:scale-90"
              title="Remove provider"
              aria-label={`Remove ${p.name}`}
            >
              <Trash2Icon size={13} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const isCurrentConfigured = current ? isConfigured(current) : false;

  return (
    <>
      <div ref={wrapperRef} className="flex gap-2 items-stretch">
        {/* ── Select trigger ── */}
        <button
          onClick={() => (open ? close() : openPopover())}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls="provider-select-listbox"
          className={`group flex-1 flex items-center gap-2.5 h-12 px-3 rounded-md border text-left transition-all duration-200 select-none
            ${open
              ? 'border-primary/50 bg-card shadow-[0_0_0_3px_theme(colors.primary/12%)]'
              : 'border-border bg-card hover:border-primary/30 hover:shadow-md hover:-translate-y-px'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 active:scale-[0.995]`}
          title={current ? `Switch provider — currently ${current.name}` : 'Select a provider'}
        >
          {current && <ProviderMark id={current.id} name={current.name} size={30} />}

          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-sm font-semibold text-foreground truncate leading-tight">
              {current?.name ?? 'Select a provider'}
            </span>
            <span className="text-2xs uppercase tracking-wider text-muted-foreground/70 truncate">
              {current ? FORMAT_LABELS[current.format] : 'No provider selected'}
            </span>
          </span>

          {current && (
            <span
              className={`shrink-0 flex items-center gap-1 text-2xs font-semibold uppercase tracking-wide rounded-full px-2 py-1 transition-colors ${
                isCurrentConfigured ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${!isCurrentConfigured ? 'animate-pulse-subtle' : ''}`} />
              {isCurrentConfigured ? 'Ready' : 'Key'}
            </span>
          )}

          <ChevronDownIcon
            size={16}
            strokeWidth={2.25}
            className={`shrink-0 text-muted-foreground/70 transition-transform duration-300 ${
              open ? 'rotate-180' : 'group-hover:translate-y-0.5'
            }`}
          />
        </button>

        {/* ── Add button (right after the select) ── */}
        <button
          onClick={onAddClick}
          className="group/add h-12 w-12 shrink-0 rounded-md border border-dashed border-border/80 flex flex-col items-center justify-center gap-px text-muted-foreground transition-all duration-200 hover:text-primary hover:border-primary/50 hover:bg-primary/5 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          title="Add custom provider"
        >
          <PlusIcon size={18} strokeWidth={2.25} className="transition-transform duration-300 group-hover/add:rotate-90" />
          <span className="text-2xs font-bold uppercase tracking-wider leading-none">Add</span>
        </button>
      </div>

      {/* ── Popover (portal, fixed positioning) ── */}
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
                    placeholder="Search providers…"
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

              {/* List — grow-0 shrink (no flex-grow) so it shrink-wraps short content */}
              <div id="provider-select-listbox" role="listbox" aria-label="Providers" className="shrink basis-auto min-h-0 overflow-y-auto p-1.5">
                {selectable.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
                    <SearchXIcon size={20} className="text-muted-foreground/40" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium text-foreground">No providers found</p>
                      <p className="text-2xs text-muted-foreground/60">
                        Try a different search, or add your own provider
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {pinned && renderRow(pinned, 0)}
                    {restBuiltIns.length > 0 && (
                      <>
                        <SectionLabel label="Built-in" count={restBuiltIns.length} />
                        {restBuiltIns.map((p, i) => renderRow(p, (pinned ? 1 : 0) + i))}
                      </>
                    )}
                    {restCustoms.length > 0 && (
                      <>
                        <SectionLabel label="Custom" count={restCustoms.length} />
                        {restCustoms.map((p, i) => renderRow(p, (pinned ? 1 : 0) + restBuiltIns.length + i))}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-1.5 border-t border-border/60 bg-muted/20 shrink-0">
                <button
                  onClick={() => {
                    close();
                    onAddClick();
                  }}
                  className="w-full h-9 rounded-md text-sm font-semibold text-primary flex items-center justify-center gap-1.5 hover:bg-primary/10 active:scale-[0.99] transition-all"
                >
                  <PlusIcon size={14} strokeWidth={2.5} />
                  Add custom provider
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
