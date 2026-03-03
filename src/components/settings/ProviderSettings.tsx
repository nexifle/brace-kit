import { useState, useEffect, useCallback } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import { PROVIDER_PRESETS } from '../../providers';
import { isOllamaLocalhost } from '../../utils/providerUtils.ts';
import type { ProviderFormat, ProviderPreset } from '../../types/index.ts';
import { PlusIcon, XIcon } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { ModelParameterSettings } from './ModelParameterSettings.tsx';

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

  useEffect(() => {
    const models = getAvailableModels(providerConfig.providerId);
    setAvailableModels(models);
  }, [providerConfig.providerId, getAvailableModels]);

  useEffect(() => {
    // Fetch models if supported
    // Ollama localhost doesn't require API key
    const isLocalhost = isOllamaLocalhost(currentProvider?.format, providerConfig.apiUrl);
    if (currentProvider?.supportsModelFetch && (providerConfig.apiKey || isLocalhost)) {
      fetchAndCacheModels(providerConfig.providerId);
    }
  }, [providerConfig.providerId, providerConfig.apiKey, providerConfig.apiUrl, currentProvider?.supportsModelFetch, currentProvider?.format, fetchAndCacheModels]);

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
    <section className="flex flex-col gap-4 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">AI Provider</h3>
        <p className="text-xs text-muted-foreground leading-none">Select and configure your AI service</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Modern Provider Selection Grid */}
        <div className="grid grid-cols-3 gap-2 px-0.5">
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
          <div className="flex flex-col gap-3 p-3 bg-secondary/30 border border-border/40 rounded-lg animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="text-2xs font-bold uppercase tracking-[0.2em] text-primary">New Custom Provider</div>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded outline-none focus:border-primary/40 transition-all text-foreground"
                placeholder="Name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
              />
              <select
                className="w-full h-8 px-2 text-xs bg-muted/40 border border-input rounded outline-none cursor-pointer text-foreground"
                value={newFormat}
                onChange={e => setNewFormat(e.target.value as ProviderFormat)}
              >
                <option value="openai">OpenAI Format</option>
                <option value="anthropic">Anthropic Format</option>
                <option value="gemini">Gemini Format</option>
                <option value="ollama">Ollama Format</option>
              </select>
            </div>
            <input
              className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded outline-none focus:border-primary/40 transition-all text-foreground"
              placeholder="API Base URL (https://...)"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
            />
            <button
              className="w-full h-8 bg-primary text-primary-foreground text-xs font-bold uppercase tracking-wider rounded shadow-sm hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
              onClick={handleAddProvider}
              disabled={!newName.trim() || !newUrl.trim()}
            >
              Save Provider
            </button>
          </div>
        )}

        {/* Configuration Section (Active Provider) */}
        <div className="flex flex-col gap-3 pt-2 animate-in fade-in duration-500">
          <div className="flex items-center gap-2 px-0.5">
            <div className="h-px bg-border/40 flex-1" />
            <span className="text-2xs font-bold uppercase tracking-[0.3em] text-muted-foreground/40">Configuration</span>
            <div className="h-px bg-border/40 flex-1" />
          </div>

          <div className="flex flex-col gap-3">
            {/* API Key */}
            <div className="flex flex-col gap-1.5 px-0.5">
              <label htmlFor="api-key" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">API Key</label>
              <div className="relative flex items-center group">
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

            {/* Base URL - for custom providers and Ollama (can point to remote server) */}
            {(isCustom || currentProvider?.format === 'ollama') && (
              <div className="flex flex-col gap-1.5 px-0.5 animate-in fade-in slide-in-from-top-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Base URL</label>
                <input
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground"
                  value={providerConfig.apiUrl}
                  onChange={(e) => updateProviderConfig({ apiUrl: e.target.value })}
                />
              </div>
            )}

            {/* Model Selection */}
            <div className="flex flex-col gap-1.5 px-0.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Model</label>
              <div className="relative flex items-center group">
                {availableModels.length === 0 ? (
                  <input
                    className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground"
                    placeholder="Type model name..."
                    value={providerConfig.model}
                    onChange={(e) => updateProviderConfig({ model: e.target.value })}
                  />
                ) : (
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

              {/* Custom Model Management (only for custom providers) */}
              {isCustom && (
                <div className="flex flex-col gap-2 mt-2 p-3 rounded-lg bg-secondary/20 border border-border/40">
                  <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60">Manage Model List</span>

                  {availableModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableModels.map(m => (
                        <div key={m} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-medium border transition-all ${m === providerConfig.model ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-muted/30 border-border/40 text-muted-foreground'}`}>
                          <span className="cursor-pointer truncate max-w-[100px]" onClick={() => updateProviderConfig({ model: m })}>{m}</span>
                          <button onClick={(e) => { e.stopPropagation(); handleRemoveModel(m); }} className="hover:text-destructive transition-colors"><XIcon size={10} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 mt-1 border-t border-border/20">
                    <input
                      className="flex-1 h-7 px-2 text-2xs bg-muted/30 border-none outline-none rounded text-foreground"
                      placeholder="Add model..."
                      value={newModelInput}
                      onChange={e => setNewModelInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddModel()}
                    />
                    <button onClick={handleAddModel} className="w-7 h-7 bg-primary/10 text-primary rounded flex items-center justify-center hover:bg-primary/20 transition-all"><PlusIcon size={12} /></button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {isCustom && (
                <div className="flex flex-col gap-1.5 px-0.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Format</label>
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
              <div className="flex flex-col gap-1.5 px-0.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Context Window</label>
                <input
                  type="number"
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground"
                  placeholder={String(currentProvider?.contextWindow || 128000)}
                  value={providerConfig.contextWindow || ''}
                  onChange={(e) => updateProviderConfig({ contextWindow: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                />
              </div>
            </div>

            <ModelParameterSettings />
          </div>
        </div>
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
