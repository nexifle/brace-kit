import { useState, useCallback, useMemo } from 'react';
import { useProvider } from '../hooks/useProvider.ts';
import { PROVIDER_PRESETS, FORMAT_LABELS } from '../providers';
import { useStore } from '../store/index.ts';
import type { CustomProvider, ProviderPreset } from '../types/index.ts';
import { CheckIcon, ChevronDownIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { ComboPopover, SectionLabel, type ComboRow } from './ui/ComboPopover.tsx';
import { ProviderMark } from './ui/ProviderMark.tsx';
import { AddProviderModal } from './settings/AddProviderModal.tsx';
import { ConfirmDialog } from './ui/ConfirmDialog.tsx';

type SelectableProvider = ProviderPreset | CustomProvider;

/**
 * Chat composer provider select — a compact segment that opens a
 * searchable popover (pinned active provider, built-in/custom sections,
 * add + remove custom providers).
 */
export function ChatProviderSelect() {
  const { providerConfig, availableProviders, isCustomProvider, switchProvider, addCustomProvider, removeCustomProvider } = useProvider();
  const providerKeys = useStore((s) => s.providerKeys);

  const [showAdd, setShowAdd] = useState(false);
  const [toRemove, setToRemove] = useState<{ id: string; name: string } | null>(null);

  const current = availableProviders.find((p) => p.id === providerConfig.providerId) ?? null;

  const builtIns = Object.values(PROVIDER_PRESETS).filter((p) => !isCustomProvider(p.id));
  const customs = availableProviders.filter((p) => isCustomProvider(p.id));

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

  const selectProvider = useCallback((p: SelectableProvider) => switchProvider(p.id), [switchProvider]);

  const rows = useMemo<ComboRow<SelectableProvider>[]>(() => {
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
        render: (highlighted, { close }) => (
          <div
            role="option"
            aria-selected={isActive}
            className={`group w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-md text-left transition-all duration-150 border ${
              isActive
                ? 'bg-primary/10 border-primary/25'
                : highlighted
                  ? 'bg-accent/80 border-accent'
                  : 'bg-transparent border-transparent hover:bg-accent/50'
            }`}
          >
            <ProviderMark id={p.id} name={p.name} size={30} />

            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className={`text-sm font-medium truncate leading-tight ${isActive ? 'text-primary' : 'text-foreground'}`}>
                {p.name}
              </span>
              <span className="text-2xs text-muted-foreground/70 truncate">
                {isActive && providerConfig.model ? `Using ${providerConfig.model}` : FORMAT_LABELS[p.format]}
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
                  className={`w-1.5 h-1.5 rounded-full ${configured ? 'bg-success' : 'bg-warning'}`}
                  title={configured ? 'Configured' : 'API key needed'}
                />
              </span>
            )}

            {/* Remove — inline row action, styled to match the item */}
            {isCustom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  close();
                  setToRemove({ id: p.id, name: p.name });
                }}
                className="shrink-0 -mr-0.5 h-7 w-7 flex items-center justify-center rounded-md text-destructive dark:text-red-400 opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 dark:hover:bg-red-400/10 hover:text-destructive dark:hover:text-red-300 active:scale-90"
                title="Remove provider"
                aria-label={`Remove ${p.name}`}
              >
                <Trash2Icon size={13} />
              </button>
            )}
          </div>
        ),
      });
    };

    // Pinned active provider first, then built-ins, then custom providers
    if (current) push(current);
    const restBuiltIns = builtIns.filter((p) => p.id !== current?.id);
    if (restBuiltIns.length > 0) {
      result.push({ key: 'label-builtin', searchText: '', selectable: false, render: () => <SectionLabel label="Built-in" count={restBuiltIns.length} /> });
      restBuiltIns.forEach(push);
    }
    const restCustoms = customs.filter((p) => p.id !== current?.id);
    if (restCustoms.length > 0) {
      result.push({ key: 'label-custom', searchText: '', selectable: false, render: () => <SectionLabel label="Custom" count={restCustoms.length} /> });
      restCustoms.forEach(push);
    }
    return result;
  }, [current, builtIns, customs, isCustomProvider, isConfigured, providerConfig.model]);

  return (
    <>
      <ComboPopover<SelectableProvider>
        wrapperClassName="flex-1 min-w-0"
        minWidth={280}
        rows={rows}
        placeholder="Search providers…"
        ariaLabel="Providers"
        listboxId="chat-provider-listbox"
        onSelect={(row) => {
          if (row.item) selectProvider(row.item);
        }}
        footer={({ close }) => (
          <button
            type="button"
            onClick={() => {
              close();
              setShowAdd(true);
            }}
            className="w-full h-9 rounded-md text-sm font-semibold text-primary flex items-center justify-center gap-1.5 hover:bg-primary/10 active:scale-[0.99] transition-all"
          >
            <PlusIcon size={14} strokeWidth={2.5} />
            Add custom provider
          </button>
        )}
        trigger={({ open, toggle, a11y }) => (
          <button
            type="button"
            onClick={toggle}
            {...a11y}
            className={`w-full h-9 flex items-center gap-2 px-2.5 text-left transition-all duration-150 select-none focus-visible:outline-none focus-visible:bg-muted/40 ${
              open ? 'bg-primary/10' : 'hover:bg-muted/30'
            }`}
            title={current ? `Provider — currently ${current.name}` : 'Select a provider'}
          >
            {current && <ProviderMark id={current.id} name={current.name} size={18} />}
            <span className={`flex-1 min-w-0 truncate text-xs font-semibold leading-tight ${open ? 'text-primary' : 'text-foreground'}`}>
              {current?.name ?? 'Select provider'}
            </span>
            <ChevronDownIcon
              size={13}
              strokeWidth={2.5}
              className={`shrink-0 text-muted-foreground/70 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      />

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
