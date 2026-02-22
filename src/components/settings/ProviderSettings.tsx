import { useState, useEffect, useCallback } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import { PROVIDER_PRESETS } from '../../providers.ts';
import type { ProviderFormat, ProviderPreset } from '../../types/index.ts';
import { PlusIcon, XIcon } from 'lucide-react';

export function ProviderSettings() {
  const {
    providerConfig,
    customProviders,
    getProvider,
    isCustomProvider,
    switchProvider,
    updateProviderConfig,
    fetchAndCacheModels,
    getAvailableModels,
    addModelToCustomProvider,
    removeModelFromCustomProvider,
  } = useProvider();

  const [showKey, setShowKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [newModelInput, setNewModelInput] = useState('');

  const currentProvider = getProvider(providerConfig.providerId) as ProviderPreset;
  const isBuiltIn = !!PROVIDER_PRESETS[providerConfig.providerId];
  const isCustom = isCustomProvider(providerConfig.providerId);

  useEffect(() => {
    const models = getAvailableModels(providerConfig.providerId);
    setAvailableModels(models);
  }, [providerConfig.providerId, getAvailableModels]);

  useEffect(() => {
    // Fetch models if supported and has API key
    if (currentProvider?.supportsModelFetch && providerConfig.apiKey) {
      fetchAndCacheModels(providerConfig.providerId);
    }
  }, [providerConfig.providerId, providerConfig.apiKey, currentProvider?.supportsModelFetch, fetchAndCacheModels]);

  const handleProviderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    switchProvider(e.target.value);
  }, [switchProvider]);

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateProviderConfig({ apiKey: e.target.value });
    // Clear cache to force re-fetch
    if (currentProvider?.supportsModelFetch) {
      fetchAndCacheModels(providerConfig.providerId);
    }
  }, [updateProviderConfig, currentProvider?.supportsModelFetch, providerConfig.providerId, fetchAndCacheModels]);

  const handleAddModel = useCallback(() => {
    const model = newModelInput.trim();
    if (!model || !isCustom) return;
    addModelToCustomProvider(providerConfig.providerId, model);
    updateProviderConfig({ model });
    setNewModelInput('');
  }, [newModelInput, isCustom, providerConfig.providerId, addModelToCustomProvider, updateProviderConfig]);

  const handleRemoveModel = useCallback((modelName: string) => {
    if (!isCustom) return;
    removeModelFromCustomProvider(providerConfig.providerId, modelName);
  }, [isCustom, providerConfig.providerId, removeModelFromCustomProvider]);

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Active Provider</h3>
        <p className="text-xs text-muted-foreground leading-none">Choose and configure your AI model</p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Provider Selector */}
        <select
          className="w-full h-9 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
          value={providerConfig.providerId}
          onChange={handleProviderChange}
        >
          {Object.entries(PROVIDER_PRESETS)
            .filter(([id]) => id !== 'custom')
            .map(([id, preset]) => (
              <option key={id} value={id}>{preset.name}</option>
            ))}
          {customProviders.length > 0 && (
            <>
              <option disabled>── Custom ──</option>
              {customProviders.map((cp) => (
                <option key={cp.id} value={cp.id}>{cp.name}</option>
              ))}
            </>
          )}
        </select>

        <div className="flex flex-col gap-3">
          {/* API Key */}
          <div className="flex flex-col gap-1.5 px-0.5">
            <label htmlFor="api-key" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">API Key</label>
            <div className="relative flex items-center group">
              <input
                type={showKey ? 'text' : 'password'}
                id="api-key"
                className="w-full h-8 px-2.5 pr-9 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                placeholder="sk-..."
                value={providerConfig.apiKey}
                onChange={handleApiKeyChange}
              />
              <button
                className="absolute right-1 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                title="Toggle visibility"
                onClick={() => setShowKey(!showKey)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Base URL (only for non-built-in providers) */}
          {!isBuiltIn && (
            <div className="flex flex-col gap-1.5 px-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <label htmlFor="api-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Base URL</label>
              <input
                type="url"
                id="api-url"
                className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                placeholder="https://..."
                value={providerConfig.apiUrl}
                onChange={(e) => updateProviderConfig({ apiUrl: e.target.value })}
              />
            </div>
          )}

          {/* Model Selection */}
          <div className="flex flex-col gap-1.5 px-0.5">
            <label htmlFor="model-select" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Model</label>
            <div className="relative flex items-center group">
              {availableModels.length === 0 ? (
                <input
                  type="text"
                  id="model-custom"
                  className="w-full h-8 px-2.5 pr-8 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                  placeholder="Model name"
                  value={providerConfig.model}
                  onChange={(e) => updateProviderConfig({ model: e.target.value })}
                />
              ) : (
                <select
                  id="model-select"
                  className="w-full h-8 px-2.5 pr-8 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground appearance-none cursor-pointer"
                  value={providerConfig.model}
                  onChange={(e) => updateProviderConfig({ model: e.target.value })}
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Custom Model Management (only for custom providers) */}
            {isCustom && (
              <div className="flex flex-col gap-2 mt-1.5 p-2 rounded-lg bg-secondary/20 border border-border/40 animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Manage Models</span>
                </div>

                {availableModels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {availableModels.map(m => (
                      <div key={m} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${m === providerConfig.model ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted/30 border-border/50 text-muted-foreground'}`}>
                        <span className="cursor-pointer truncate max-w-[120px]" onClick={() => updateProviderConfig({ model: m })} title={m}>{m}</span>
                        <button
                          className="hover:text-destructive transition-colors shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveModel(m);
                          }}
                        >
                          <XIcon size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-1.5 pt-1 mt-1 border-t border-border/30">
                  <input
                    type="text"
                    className="flex-1 h-7 px-2 text-[11px] bg-muted/30 border border-border/40 rounded outline-none focus:border-primary/40 transition-all placeholder:text-muted-foreground/40 text-foreground"
                    placeholder="Add model name..."
                    value={newModelInput}
                    onChange={e => setNewModelInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                  />
                  <button
                    className="w-7 h-7 flex items-center justify-center bg-primary/10 text-primary hover:bg-primary/20 rounded transition-all disabled:opacity-30"
                    onClick={handleAddModel}
                    disabled={!newModelInput.trim()}
                  >
                    <PlusIcon size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Format (only for custom providers) */}
            {isCustom && (
              <div className="flex flex-col gap-1.5 px-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <label htmlFor="api-format" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Format</label>
                <select
                  id="api-format"
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
                  value={providerConfig.format}
                  onChange={(e) => updateProviderConfig({ format: e.target.value as ProviderFormat })}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
            )}

            {/* Context Window */}
            <div className="flex flex-col gap-1.5 px-0.5">
              <label htmlFor="active-window" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Context Window</label>
              <input
                type="number"
                id="active-window"
                className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                placeholder={String(currentProvider?.contextWindow || 128000)}
                value={providerConfig.contextWindow || ''}
                onChange={(e) => updateProviderConfig({ contextWindow: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
