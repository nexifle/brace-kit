import { useState, useEffect, useCallback } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import { PROVIDER_PRESETS } from '../../providers';
import { isOllamaLocalhost } from '../../utils/providerUtils.ts';
import type { ProviderFormat, ProviderPreset } from '../../types/index.ts';
import { PlusIcon, XIcon, LayersIcon, SlidersHorizontalIcon, Settings2Icon } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { ModelParameterSettings } from './ModelParameterSettings.tsx';

// =============================================================================
// Shared sub-components (mirrors ChatSettings.tsx pattern)
// =============================================================================

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border/60 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 border-b border-border/50">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

// =============================================================================
// ProviderSettings Component
// =============================================================================

export function ProviderSettings() {
  const {
    providerConfig,
    switchProvider,
    updateProviderConfig,
    getProvider,
    isCustomProvider,
    getAvailableModels,
    fetchAndCacheModels,
    availableProviders,
    addCustomProvider,
    removeCustomProvider,
    addModelToCustomProvider,
    removeModelFromCustomProvider,
  } = useProvider();

  const [showKey, setShowKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [newModelInput, setNewModelInput] = useState('');
  const [showAddProvider, setShowAddProvider] = useState(false);

  // New provider form state
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newFormat, setNewFormat] = useState<ProviderFormat>('openai');

  // Confirmation state
  const [providerToDelete, setProviderToDelete] = useState<{ id: string, name: string } | null>(null);

  const currentProvider = getProvider(providerConfig.providerId) as ProviderPreset;
  const isCustom = isCustomProvider(providerConfig.providerId);
  const isOllama = currentProvider?.format === 'ollama';

  useEffect(() => {
    const models = getAvailableModels(providerConfig.providerId);
    setAvailableModels(models);
  }, [providerConfig.providerId, getAvailableModels]);

  useEffect(() => {
    const isLocalhost = isOllamaLocalhost(currentProvider?.format, providerConfig.apiUrl);
    if (currentProvider?.supportsModelFetch && (providerConfig.apiKey || isLocalhost)) {
      fetchAndCacheModels(providerConfig.providerId);
    }
  }, [providerConfig.providerId, providerConfig.apiKey, providerConfig.apiUrl, currentProvider?.supportsModelFetch, currentProvider?.format, fetchAndCacheModels]);

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    updateProviderConfig({ apiKey: e.target.value });
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

  const handleAddProvider = useCallback(() => {
    if (!newName.trim() || !newUrl.trim()) return;
    addCustomProvider(newName.trim(), newUrl.trim(), newFormat);
    setNewName('');
    setNewUrl('');
    setNewFormat('openai');
    setShowAddProvider(false);
  }, [newName, newUrl, newFormat, addCustomProvider]);

  const handleConfirmRemoveProvider = useCallback(() => {
    if (!providerToDelete) return;
    removeCustomProvider(providerToDelete.id);
    setProviderToDelete(null);
  }, [providerToDelete, removeCustomProvider]);

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">AI Provider</h3>
        <p className="text-xs text-muted-foreground leading-none">Select and configure your AI service</p>
      </div>

      <div className="flex flex-col gap-2">

        {/* ── PROVIDER SELECTION ── */}
        <SectionCard>
          <SectionHeader icon={<LayersIcon size={12} />} title="Provider" />
          <div className="p-3 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {availableProviders.map((p) => {
                const isActive = p.id === providerConfig.providerId;
                const isPreset = !!PROVIDER_PRESETS[p.id];
                return (
                  <div key={p.id} className="group relative">
                    <button
                      className={`w-full h-10 px-2 flex items-center justify-center text-2xs font-bold uppercase tracking-tight rounded-md border transition-all truncate
                        ${isActive
                          ? 'bg-primary border-primary text-primary-foreground shadow-md'
                          : 'bg-muted/30 border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
                      onClick={() => switchProvider(p.id)}
                      title={p.name}
                    >
                      {p.name}
                    </button>
                    {!isPreset && (
                      <button
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 active:scale-95 z-10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProviderToDelete({ id: p.id, name: p.name });
                        }}
                        title="Remove Provider"
                      >
                        <XIcon size={12} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                );
              })}

              <button
                className={`h-10 border border-dashed rounded-md flex items-center justify-center gap-1.5 transition-all text-2xs font-bold uppercase tracking-tight
                  ${showAddProvider
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'bg-transparent border-border/60 text-muted-foreground hover:bg-muted/20 hover:text-foreground'}`}
                onClick={() => setShowAddProvider(!showAddProvider)}
              >
                <PlusIcon size={14} />
                {showAddProvider ? 'Cancel' : 'Add'}
              </button>
            </div>

            {/* Inline Add Provider Form */}
            {showAddProvider && (
              <div className="flex flex-col gap-2.5 p-3 bg-secondary/30 border border-border/40 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
                <p className="text-xs text-muted-foreground">Enter a name, API format, and base URL for your custom provider.</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                    placeholder="Provider name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                  <select
                    className="w-full h-8 px-2 text-xs bg-muted/40 border border-input rounded-md outline-none cursor-pointer text-foreground"
                    value={newFormat}
                    onChange={e => setNewFormat(e.target.value as ProviderFormat)}
                  >
                    <option value="openai">OpenAI format</option>
                    <option value="anthropic">Anthropic format</option>
                    <option value="gemini">Gemini format</option>
                    <option value="ollama">Ollama format</option>
                  </select>
                </div>
                <input
                  className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                  placeholder="Base URL  (e.g. https://api.example.com/v1)"
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                />
                <button
                  className="w-full h-8 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded-md shadow-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                  onClick={handleAddProvider}
                  disabled={!newName.trim() || !newUrl.trim()}
                >
                  Save Provider
                </button>
              </div>
            )}
          </div>
        </SectionCard>

        {/* ── CONFIGURATION (API Key + Base URL + Model) ── */}
        <SectionCard>
          <SectionHeader icon={<Settings2Icon size={12} />} title="Configuration" />
          <div className="p-3 flex flex-col gap-3">

            {/* API Key */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="api-key" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">API Key</label>
              <div className="relative flex items-center">
                <input
                  type={showKey ? 'text' : 'password'}
                  id="api-key"
                  className="w-full h-8 px-2.5 pr-9 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                  placeholder="Paste your key here"
                  value={providerConfig.apiKey}
                  onChange={handleApiKeyChange}
                />
                <button
                  className="absolute right-1 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                  onClick={() => setShowKey(!showKey)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    {showKey ? (
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    ) : (
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    )}
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Base URL — custom providers and Ollama only */}
            {(isCustom || isOllama) && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Base URL</label>
                <input
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground"
                  value={providerConfig.apiUrl}
                  onChange={(e) => updateProviderConfig({ apiUrl: e.target.value })}
                />
              </div>
            )}

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Model</label>
              {isCustom ? (
                // Custom providers: chip-based selector + add model
                // Clicking a chip selects it; the active chip is highlighted
                <div className="flex flex-col gap-2">
                  {availableModels.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 py-1">
                      No models added yet. Type a model name below to add one.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableModels.map(m => (
                        <div
                          key={m}
                          className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border cursor-pointer transition-all select-none
                            ${m === providerConfig.model
                              ? 'bg-primary/15 border-primary/40 text-primary'
                              : 'bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border'}`}
                          onClick={() => updateProviderConfig({ model: m })}
                        >
                          {m === providerConfig.model && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                          )}
                          <span className="truncate max-w-30">{m}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRemoveModel(m); }}
                            className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 ml-0.5"
                            title="Remove model"
                          >
                            <XIcon size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      className="flex-1 h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                      placeholder="Add model name…"
                      value={newModelInput}
                      onChange={e => setNewModelInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                    />
                    <button
                      onClick={handleAddModel}
                      disabled={!newModelInput.trim()}
                      className="h-8 w-8 bg-primary/10 text-primary rounded-md flex items-center justify-center hover:bg-primary/20 transition-all disabled:opacity-40 shrink-0"
                      title="Add model"
                    >
                      <PlusIcon size={14} />
                    </button>
                  </div>
                </div>
              ) : availableModels.length === 0 ? (
                // No known models: free-text input
                <input
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground placeholder:text-muted-foreground/40"
                  placeholder="Type model name…"
                  value={providerConfig.model}
                  onChange={(e) => updateProviderConfig({ model: e.target.value })}
                />
              ) : (
                // Preset provider with fetched model list: dropdown
                <select
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
                  value={providerConfig.model}
                  onChange={(e) => updateProviderConfig({ model: e.target.value })}
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>

          </div>
        </SectionCard>

        {/* ── ADVANCED CONFIGURATION ── */}
        <SectionCard>
          <SectionHeader icon={<SlidersHorizontalIcon size={12} />} title="Advanced" />
          <div className="p-3 flex flex-col gap-3">
            <div className={isCustom ? 'grid grid-cols-2 gap-3' : ''}>
              {isCustom && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">API Format</label>
                  <select
                    className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground cursor-pointer"
                    value={providerConfig.format}
                    onChange={(e) => updateProviderConfig({ format: e.target.value as ProviderFormat })}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="gemini">Gemini</option>
                    <option value="ollama">Ollama</option>
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Context Window</label>
                <input
                  type="number"
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground placeholder:text-muted-foreground/40"
                  placeholder={String(currentProvider?.contextWindow || 128000)}
                  value={providerConfig.contextWindow || ''}
                  onChange={(e) => updateProviderConfig({ contextWindow: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                />
              </div>
            </div>

            <ModelParameterSettings />
          </div>
        </SectionCard>

      </div>

      {providerToDelete && (
        <ConfirmDialog
          isOpen={!!providerToDelete}
          title="Remove Provider?"
          message={`Are you sure you want to remove "${providerToDelete.name}"? This will delete all associated configuration for this provider.`}
          confirmLabel="Remove Provider"
          cancelLabel="Cancel"
          onConfirm={handleConfirmRemoveProvider}
          onCancel={() => setProviderToDelete(null)}
          variant="danger"
        />
      )}
    </section>
  );
}
