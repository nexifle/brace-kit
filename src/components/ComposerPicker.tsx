import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useProvider } from '../hooks/useProvider.ts';
import { PROVIDER_PRESETS, FORMAT_LABELS } from '../providers';
import { useStore } from '../store/index.ts';
import type { CustomProvider, ProviderPreset } from '../types/index.ts';
import { isOllamaLocalhost } from '../utils/providerUtils.ts';
import { computePopoverPlacement } from '../utils/popover.ts';
import { CheckIcon, ChevronDownIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { ComboList, type ComboRow } from './ui/ComboPopover.tsx';
import { ProviderMark } from './ui/ProviderMark.tsx';
import { AddProviderModal } from './settings/AddProviderModal.tsx';
import { ConfirmDialog } from './ui/ConfirmDialog.tsx';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip/index.ts';

type SelectableProvider = ProviderPreset | CustomProvider;

/**
 * Composer picker — ONE compact trigger in the composer toolbar that opens a
 * popup containing BOTH select-and-search panels: the provider list and the
 * model list. Each panel behaves like the settings ProviderSelect (search,
 * pinned active, keyboard nav, custom add/remove).
 */
export function ComposerPicker() {
  const {
    providerConfig,
    availableProviders,
    isCustomProvider,
    switchProvider,
    updateProviderConfig,
    addCustomProvider,
    removeCustomProvider,
    addModelToCustomProvider,
    removeModelFromCustomProvider,
    getAvailableModels,
    fetchAndCacheModels,
  } = useProvider();
  const providerKeys = useStore((s) => s.providerKeys);

  const [open, setOpen] = useState(false);
  const [abovePlaced, setAbovePlaced] = useState(false);
  const [tab, setTab] = useState<'provider' | 'model'>('model');
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const current = availableProviders.find((p) => p.id === providerConfig.providerId) ?? null;
  const currentModel = providerConfig.model;

  // Show the tooltip only when the trigger text is actually clipped
  useEffect(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const measure = () => {
      let t = false;
      btn.querySelectorAll('.truncate').forEach((s) => {
        if ((s as HTMLElement).scrollWidth > (s as HTMLElement).clientWidth) t = true;
      });
      setIsTruncated(t);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(btn);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [current?.name, currentModel]);

  const builtIns = Object.values(PROVIDER_PRESETS).filter((p) => !isCustomProvider(p.id));
  const customs = availableProviders.filter((p) => isCustomProvider(p.id));
  const isCustomCurrent = isCustomProvider(providerConfig.providerId);

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

  const close = useCallback(() => setOpen(false), []);

  const openPicker = useCallback(() => {
    const el = document.getElementById('composer-picker-trigger');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { top, bottom, maxHeight, flipAbove } = computePopoverPlacement(rect, window.innerHeight);
    const width = Math.max(rect.width, 340);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setPos(flipAbove ? { bottom, left, width, maxHeight } : { top, left, width, maxHeight });
    setAbovePlaced(flipAbove);
    setOpen(true);
    // Auto-fetch live models when the current provider supports it
    if (current && (current as ProviderPreset).supportsModelFetch) {
      const isLocalhost = isOllamaLocalhost(current.format, current.apiUrl);
      if (providerConfig.apiKey || isLocalhost) fetchAndCacheModels(providerConfig.providerId);
    }
  }, [current, providerConfig.apiKey, providerConfig.providerId, fetchAndCacheModels]);

  // ── Provider rows (pinned active first, built-ins, customs) ──────────────
  const providerRows = useMemo<ComboRow<SelectableProvider>[]>(() => {
    const result: ComboRow<SelectableProvider>[] = [];

    const push = (p: SelectableProvider) => {
      const isActive = p.id === providerConfig.providerId;
      const isCustom = isCustomProvider(p.id);
      const configured = isConfigured(p);
      result.push({
        key: p.id,
        item: p,
        searchText: `${p.name} ${FORMAT_LABELS[p.format]} ${p.apiUrl}`,
        selectable: true,
        render: (highlighted, { close: closeList }) => (
          <div
            role="option"
            aria-selected={isActive}
            className={`group w-full flex items-center gap-2 pl-2 pr-1.5 py-1.5 rounded-md text-left transition-all duration-150 border ${
              isActive
                ? 'bg-primary/10 border-primary/25'
                : highlighted
                  ? 'bg-accent/80 border-accent'
                  : 'bg-transparent border-transparent hover:bg-accent/50'
            }`}
          >
            <ProviderMark id={p.id} name={p.name} size={24} />

            <span className="flex-1 min-w-0 flex flex-col gap-0">
              <span className={`text-sm font-medium truncate leading-tight ${isActive ? 'text-primary' : 'text-foreground'}`}>
                {p.name}
              </span>
              <span className="text-2xs text-muted-foreground truncate leading-tight">
                {isActive && providerConfig.model ? `Using ${providerConfig.model}` : FORMAT_LABELS[p.format]}
              </span>
            </span>

            {isActive ? (
              <span className="shrink-0 flex items-center gap-1.5">
                <span className="text-2xs font-bold uppercase tracking-wide text-primary bg-primary/15 rounded-full px-1.5 py-0.5">
                  Active
                </span>
                <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon size={8} strokeWidth={3.5} />
                </span>
              </span>
            ) : (
              <span className="shrink-0 flex items-center">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-success' : 'bg-warning'}`}
                  title={configured ? 'Configured' : 'API key needed'}
                />
              </span>
            )}

            {isCustom && (
              <span className="shrink-0 overflow-hidden w-0 group-hover:w-6 group-focus-within:w-6 transition-[width,margin-left] duration-150 ease-out -ml-2 group-hover:ml-0 group-focus-within:ml-0">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeList();
                    setToRemove({ id: p.id, name: p.name });
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded-md text-destructive dark:text-red-400 opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 dark:hover:bg-red-400/10 hover:text-destructive dark:hover:text-red-300 active:scale-90"
                  title="Remove provider"
                  aria-label={`Remove ${p.name}`}
                >
                  <Trash2Icon size={12} />
                </button>
              </span>
            )}
          </div>
        ),
      });
    };

    if (current) push(current);
    const restBuiltIns = builtIns.filter((p) => p.id !== current?.id);
    if (restBuiltIns.length > 0) {
      result.push({
        key: 'label-builtin',
        searchText: '',
        selectable: false,
        render: () => (
          <div className="flex items-center gap-2 px-2 pt-2 pb-0.5">
            <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Built-in</span>
            <span className="text-2xs tabular-nums text-muted-foreground">{restBuiltIns.length}</span>
            <span className="flex-1 h-px bg-border/50" />
          </div>
        ),
      });
      restBuiltIns.forEach(push);
    }
    const restCustoms = customs.filter((p) => p.id !== current?.id);
    if (restCustoms.length > 0) {
      result.push({
        key: 'label-custom',
        searchText: '',
        selectable: false,
        render: () => (
          <div className="flex items-center gap-2 px-2 pt-2 pb-0.5">
            <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">Custom</span>
            <span className="text-2xs tabular-nums text-muted-foreground">{restCustoms.length}</span>
            <span className="flex-1 h-px bg-border/50" />
          </div>
        ),
      });
      restCustoms.forEach(push);
    }
    return result;
  }, [current, builtIns, customs, isCustomProvider, isConfigured, providerConfig.model]);

  // ── Model rows (pinned active first) ─────────────────────────────────────
  // Computed directly in render: useProvider re-renders on every store change,
  // so fetched-model updates are always reflected.
  const allModels = current ? getAvailableModels(providerConfig.providerId) : [];
  const models = allModels.slice();
  const pinnedIdx = models.indexOf(currentModel);
  if (pinnedIdx > 0) {
    const [pinned] = models.splice(pinnedIdx, 1);
    models.unshift(pinned);
  }

  const modelRows = useMemo<ComboRow<string>[]>(
    () =>
      models.map((model) => ({
        key: model,
        item: model,
        searchText: model,
        selectable: true,
        render: (highlighted) => {
          const isActive = model === currentModel;
          return (
            <div
              role="option"
              aria-selected={isActive}
              className={`group w-full flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-md text-left transition-all duration-150 border ${
                isActive
                  ? 'bg-primary/10 border-primary/25'
                  : highlighted
                    ? 'bg-accent/80 border-accent'
                    : 'bg-transparent border-transparent hover:bg-accent/50'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
              <span className={`flex-1 min-w-0 break-all font-mono text-xs leading-snug ${isActive ? 'text-primary font-semibold' : 'text-foreground'}`}>
                {model}
              </span>
              {isActive && (
                <span className="shrink-0 flex items-center gap-1.5">
                  <span className="text-2xs font-bold uppercase tracking-wide text-primary bg-primary/15 rounded-full px-1.5 py-0.5">
                    Active
                  </span>
                  <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <CheckIcon size={8} strokeWidth={3.5} />
                  </span>
                </span>
              )}
              {isCustomCurrent && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeModelFromCustomProvider(providerConfig.providerId, model);
                  }}
                  className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-destructive dark:text-red-400 opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 dark:hover:bg-red-400/10 active:scale-90"
                  title="Remove model"
                  aria-label={`Remove ${model}`}
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>
          );
        },
      })),
    [models, currentModel, isCustomCurrent, providerConfig.providerId, removeModelFromCustomProvider]
  );

  // Custom-model add footer (shown under the model list) ─────────────────
  const [addInput, setAddInput] = useState('');
  const handleAddModel = useCallback(() => {
    const model = addInput.trim();
    if (!model || !isCustomCurrent) return;
    addModelToCustomProvider(providerConfig.providerId, model);
    setAddInput('');
  }, [addInput, isCustomCurrent, providerConfig.providerId, addModelToCustomProvider]);

  return (
    <>
      {/* ── Single trigger chip ── */}
      <Tooltip>
        <TooltipTrigger className="min-w-0 flex">
          <button
            ref={triggerRef}
            id="composer-picker-trigger"
            type="button"
            onClick={() => (open ? close() : openPicker())}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls="composer-picker-popup"
            className={`w-full min-w-0 h-7 max-w-[240px] flex items-center gap-1.5 px-1.5 rounded-md text-left transition-all duration-150 select-none focus-visible:outline-none focus-visible:bg-muted/40 ${
              open ? 'bg-primary/10' : 'hover:bg-muted/40'
            }`}
          >
            {current && <ProviderMark id={current.id} name={current.name} size={16} />}
            <span className={`shrink-0 min-w-0 truncate text-xs font-semibold leading-tight ${open ? 'text-primary' : 'text-foreground'}`}>
              {current?.name ?? 'Provider'}
            </span>
            <span className="shrink-0 text-muted-foreground/40">·</span>
            <span
              className={`min-w-0 truncate text-[11px] leading-tight ${
                currentModel ? 'font-mono text-muted-foreground' : 'italic text-muted-foreground'
              }`}
            >
              {currentModel || 'select model'}
            </span>
            <ChevronDownIcon
              size={12}
              strokeWidth={2.5}
              className={`shrink-0 text-muted-foreground/70 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        </TooltipTrigger>
        {isTruncated && current && (
          <TooltipContent side="top">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold text-foreground">{current.name}</span>
              <span className="text-[11px] font-mono text-muted-foreground">{currentModel || 'No model selected'}</span>
            </div>
          </TooltipContent>
        )}
      </Tooltip>

      {/* ── Popup with both selectors ── */}
      {open &&
        pos &&
        createPortal(
          <div
            id="composer-picker-popup"
            style={{
              ...(abovePlaced ? { bottom: window.innerHeight - (pos.bottom ?? 0) } : { top: pos.top }),
              left: pos.left,
              width: pos.width,
            }}
            className={`fixed z-[70] animate-in fade-in zoom-in-95 duration-200 ${
              abovePlaced ? 'origin-bottom slide-in-from-bottom-2' : 'origin-top slide-in-from-top-2'
            }`}
          >
            <div
              style={{ maxHeight: pos.maxHeight }}
              className="bg-popover/95 backdrop-blur-xl border border-border rounded-md shadow-2xl shadow-black/15 overflow-hidden flex flex-col"
            >
              {/* Tabs — Provider | Model (one list at a time, no scrolling) */}
              <div className="p-2.5 pb-2 border-b border-border/60 shrink-0">
                <div className="flex bg-muted/40 rounded-md p-0.5 gap-0.5">
                  <button
                    type="button"
                    onClick={() => setTab('provider')}
                    className={`flex-1 h-7 rounded-md text-xs font-semibold transition-all ${
                      tab === 'provider' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Provider
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('model')}
                    className={`flex-1 h-7 rounded-md text-xs font-semibold transition-all ${
                      tab === 'model' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Model
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto">
                {tab === 'provider' ? (
                  <ComboList<SelectableProvider>
                    rows={providerRows}
                    onSelect={(row) => {
                      if (row.item) {
                        switchProvider(row.item.id);
                        // Stay open and advance to the model list so the user
                        // can pick a model right after switching provider.
                        setTab('model');
                      }
                    }}
                    placeholder="Search providers…"
                    ariaLabel="Providers"
                    listboxId="composer-provider-listbox"
                    autoFocus
                    maxHeight={300}
                    onRequestClose={close}
                  />
                ) : (
                  <>
                    <ComboList<string>
                      rows={modelRows}
                      onSelect={(row) => {
                        if (row.item) {
                          updateProviderConfig({ model: row.item });
                          close();
                        }
                      }}
                      placeholder="Search models…"
                      ariaLabel="Models"
                      listboxId="composer-model-listbox"
                      autoFocus
                      maxHeight={300}
                      onRequestClose={close}
                    />
                    {/* Add-model for custom providers */}
                    {isCustomCurrent && (
                      <div className="flex gap-1.5 px-2.5 pb-2.5 pt-1">
                        <input
                          value={addInput}
                          onChange={(e) => setAddInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && addInput.trim()) {
                              e.preventDefault();
                              handleAddModel();
                            }
                          }}
                          placeholder="Add model name…"
                          className="flex-1 h-7 px-2.5 text-xs bg-muted/40 border border-transparent focus:border-primary/40 rounded-md outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                        />
                        <button
                          type="button"
                          onClick={handleAddModel}
                          disabled={!addInput.trim()}
                          className="shrink-0 px-2.5 h-7 text-2xs font-bold uppercase bg-primary/15 text-primary hover:bg-primary/25 rounded-md transition-all disabled:opacity-30"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer — always visible */}
              <div className="p-1 border-t border-border/60 bg-muted/20 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    close();
                    setShowAdd(true);
                  }}
                  className="w-full h-8 rounded-md text-sm font-semibold text-primary flex items-center justify-center gap-1.5 hover:bg-primary/10 active:scale-[0.99] transition-all"
                >
                  <PlusIcon size={14} strokeWidth={2.5} />
                  Add custom provider
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Outside-click / scroll / resize close */}
      {open && (
        <CloseWatcher onClose={close} popoverEl={() => document.getElementById('composer-picker-popup')} />
      )}

      <AddProviderModal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={(fields) => {
          addCustomProvider(fields.name, fields.apiUrl, fields.format, undefined, fields.apiKey, fields.model, fields.supportsModelFetch);
          setShowAdd(false);
        }}
      />

      <ConfirmDialog
        isOpen={!!toRemove}
        title="Remove Provider?"
        message={
          toRemove
            ? `Are you sure you want to remove "${toRemove.name}"? This will delete all associated configuration for this provider.`
            : ''
        }
        confirmLabel="Remove Provider"
        variant="destructive"
        onConfirm={() => {
          if (toRemove) removeCustomProvider(toRemove.id);
          setToRemove(null);
        }}
        onCancel={() => setToRemove(null)}
      />
    </>
  );
}

/** Global close watcher for the picker popup (outside click, scroll, resize, Escape). */
function CloseWatcher({ onClose, popoverEl }: { onClose: () => void; popoverEl: () => HTMLElement | null }) {
  useEffect(() => {
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      const pop = popoverEl();
      const trig = document.getElementById('composer-picker-trigger');
      if (t instanceof Node && (pop?.contains(t) || trig?.contains(t))) return;
      onClose();
    };
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && popoverEl()?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
  }, [onClose, popoverEl]);
  return null;
}
