import { useState, useCallback, useMemo } from 'react';
import { useProvider } from '../hooks/useProvider.ts';
import { isOllamaLocalhost } from '../utils/providerUtils.ts';
import type { ProviderPreset } from '../types/index.ts';
import { CheckIcon, ChevronDownIcon, CpuIcon, XIcon } from 'lucide-react';
import { ComboPopover, type ComboRow } from './ui/ComboPopover.tsx';

/**
 * Chat composer model select — a compact segment that opens a searchable
 * popover with the active model pinned first. Custom providers get an inline
 * "add model" footer and per-row remove.
 */
export function ChatModelSelect() {
  const {
    providerConfig,
    availableProviders,
    isCustomProvider,
    getAvailableModels,
    updateProviderConfig,
    addModelToCustomProvider,
    removeModelFromCustomProvider,
    fetchAndCacheModels,
  } = useProvider();

  const [addInput, setAddInput] = useState('');

  const providerId = providerConfig.providerId;
  const currentModel = providerConfig.model;
  const isCustom = isCustomProvider(providerId);
  const provider = availableProviders.find((p) => p.id === providerId);
  const models = getAvailableModels(providerId);

  // Pinned active model first (mirrors the settings select behavior)
  const rows = useMemo<ComboRow<string>[]>(() => {
    const all = models.slice();
    const pinnedIdx = all.indexOf(currentModel);
    if (pinnedIdx > 0) {
      const [pinned] = all.splice(pinnedIdx, 1);
      all.unshift(pinned);
    }
    return all.map((model) => ({
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

            <span className={`flex-1 min-w-0 truncate font-mono text-xs ${isActive ? 'text-primary font-semibold' : 'text-foreground'}`}>
              {model}
            </span>

            {isActive && (
              <span className="shrink-0 flex items-center gap-1.5">
                <span className="text-2xs font-bold uppercase tracking-wide text-primary bg-primary/15 rounded-full px-2 py-0.5">
                  Active
                </span>
                <span className="w-4 h-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon size={9} strokeWidth={3.5} />
                </span>
              </span>
            )}

            {isCustom && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeModelFromCustomProvider(providerId, model);
                }}
                className="shrink-0 -mr-0.5 h-6.5 w-6.5 flex items-center justify-center rounded-md text-destructive dark:text-red-400 opacity-0 translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 dark:hover:bg-red-400/10 active:scale-90"
                title="Remove model"
                aria-label={`Remove ${model}`}
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        );
      },
    }));
  }, [models, currentModel, isCustom, providerId, removeModelFromCustomProvider]);

  const handleAddModel = useCallback(() => {
    const model = addInput.trim();
    if (!model || !isCustom) return;
    addModelToCustomProvider(providerId, model);
    setAddInput('');
  }, [addInput, isCustom, providerId, addModelToCustomProvider]);

  return (
    <ComboPopover<string>
      wrapperClassName="flex-1 min-w-0"
      minWidth={280}
      rows={rows}
      placeholder="Search models…"
      ariaLabel="Models"
      listboxId="chat-model-listbox"
      onOpen={() => {
        // Auto-fetch live models when the current provider supports it
        if (provider && (provider as ProviderPreset).supportsModelFetch) {
          const isLocalhost = isOllamaLocalhost(provider.format, provider.apiUrl);
          if (providerConfig.apiKey || isLocalhost) fetchAndCacheModels(providerId);
        }
      }}
      onSelect={(row) => {
        if (row.item) updateProviderConfig({ model: row.item });
      }}
      emptyState={
        models.length === 0 ? (
          <>
            <p className="text-sm font-medium text-foreground">No models available</p>
            <p className="text-2xs text-muted-foreground/60">Configure an API key in Settings to fetch models</p>
          </>
        ) : undefined
      }
      footer={
        isCustom
          ? () => (
              <div className="flex gap-1.5">
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
                  className="flex-1 h-8 px-2.5 text-xs bg-muted/40 border border-transparent focus:border-primary/40 rounded-md outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                />
                <button
                  type="button"
                  onClick={handleAddModel}
                  disabled={!addInput.trim()}
                  className="shrink-0 px-2.5 h-8 text-2xs font-bold uppercase bg-primary/15 text-primary hover:bg-primary/25 rounded-md transition-all disabled:opacity-30"
                >
                  Add
                </button>
              </div>
            )
          : undefined
      }
      trigger={({ open, toggle, a11y }) => (
        <button
          type="button"
          onClick={toggle}
          {...a11y}
          className={`w-full h-9 flex items-center gap-2 px-2.5 text-left transition-all duration-150 select-none focus-visible:outline-none focus-visible:bg-muted/40 ${
            open ? 'bg-primary/10' : 'hover:bg-muted/30'
          }`}
          title={currentModel ? `Model — currently ${currentModel}` : 'Select a model'}
        >
          <CpuIcon size={13} className={`shrink-0 ${currentModel ? 'text-primary/70' : 'text-muted-foreground/40'}`} />
          <span
            className={`flex-1 min-w-0 truncate text-xs leading-tight ${
              currentModel ? 'font-mono text-foreground' : 'italic text-muted-foreground/70'
            }`}
          >
            {currentModel || 'Select model'}
          </span>
          <ChevronDownIcon
            size={13}
            strokeWidth={2.5}
            className={`shrink-0 text-muted-foreground/70 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      )}
    />
  );
}
