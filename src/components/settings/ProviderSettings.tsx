import { useState, useEffect, useCallback, useMemo } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import { PROVIDER_PRESETS, GROQ_BUILTIN_TOOLS } from '../../providers';
import { isOllamaLocalhost } from '../../utils/providerUtils.ts';
import type { ProviderFormat, ProviderPreset, CustomProvider } from '../../types/index.ts';
import { PlusIcon, XIcon, LayersIcon, SlidersHorizontalIcon, Settings2Icon, WrenchIcon } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { ModelParameterSettings } from './ModelParameterSettings.tsx';
import { AddProviderModal } from './AddProviderModal.tsx';
import { useStore } from '../../store/index.ts';

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

  const groqEnabledBuiltinTools = useStore((s) => s.groqEnabledBuiltinTools);
  const setGroqEnabledBuiltinTools = useStore((s) => s.setGroqEnabledBuiltinTools);

  const [showKey, setShowKey] = useState(false);
  const [newModelInput, setNewModelInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Confirmation state
  const [providerToDelete, setProviderToDelete] = useState<{ id: string, name: string } | null>(null);

  const currentProvider = getProvider(providerConfig.providerId) as ProviderPreset;
  const isCustom = isCustomProvider(providerConfig.providerId);
  const isOllama = currentProvider?.format === 'ollama';

  // Setup readiness
  const hasApiKey = !!providerConfig.apiKey || isOllama;
  const hasModel = !!providerConfig.model;
  const isReady = hasApiKey && hasModel;

  // Whether custom provider uses fetched dropdown instead of chip UI
  const customUsesDropdown = isCustom && !!(currentProvider as CustomProvider)?.supportsModelFetch;
  const availableModels = useMemo(
    () => getAvailableModels(providerConfig.providerId),
    [providerConfig.providerId, getAvailableModels]
  );

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

  const handleAddFromModal = useCallback((fields: { name: string; apiUrl: string; format: import('../../types/index.ts').ProviderFormat; apiKey: string; model: string; supportsModelFetch: boolean }) => {
    addCustomProvider(fields.name, fields.apiUrl, fields.format, undefined, fields.apiKey, fields.model, fields.supportsModelFetch);
    setShowAddModal(false);
  }, [addCustomProvider]);

  const handleConfirmRemoveProvider = useCallback(() => {
    if (!providerToDelete) return;
    removeCustomProvider(providerToDelete.id);
    setProviderToDelete(null);
  }, [providerToDelete, removeCustomProvider]);

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">AI Provider</h3>
        <p className="text-sm text-muted-foreground leading-none">Select and configure your AI service</p>
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
                      className={`w-full h-10 px-2 flex items-center justify-center text-xs font-bold uppercase tracking-tight rounded-md border transition-all truncate
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
                className="h-10 border border-dashed rounded-md flex items-center justify-center gap-1.5 transition-all text-xs font-bold uppercase tracking-tight bg-transparent border-border/60 text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                onClick={() => setShowAddModal(true)}
              >
                <PlusIcon size={14} />
                Add
              </button>
            </div>

          </div>
        </SectionCard>

        {/* ── SETUP STATUS ── */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
          isReady
            ? 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400'
        }`}>
          {isReady ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <span>Ready to chat</span>
              <span className="text-muted-foreground font-normal ml-1">— {providerConfig.model} on {currentProvider?.name || 'Provider'}</span>
            </>
          ) : !hasApiKey ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span>API Key required</span>
              <span className="text-muted-foreground font-normal ml-1">— Enter your key below to start</span>
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Select a model</span>
              <span className="text-muted-foreground font-normal ml-1">— Choose a model to start chatting</span>
            </>
          )}
        </div>

        {/* ── CONFIGURATION (API Key + Base URL + Model) ── */}
        <SectionCard>
          <SectionHeader icon={<Settings2Icon size={12} />} title="Configuration" />
          <div className="p-3 flex flex-col gap-3">

            {/* API Key */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="api-key" className="text-sm font-bold uppercase tracking-wider text-muted-foreground">API Key</label>
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
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Base URL</label>
                <input
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground"
                  value={providerConfig.apiUrl}
                  onChange={(e) => updateProviderConfig({ apiUrl: e.target.value })}
                />
              </div>
            )}

            {/* API Format — custom providers only */}
            {isCustom && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">API Format</label>
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

            {/* Model */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Model</label>
              {customUsesDropdown && availableModels.length > 0 ? (
                // Custom provider with auto-fetch: dropdown (same as preset)
                <select
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
                  value={providerConfig.model}
                  onChange={(e) => updateProviderConfig({ model: e.target.value })}
                >
                  {availableModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : isCustom ? (
                // Custom providers without fetch: chip-based selector + add model
                <div className="flex flex-col gap-2">
                  {availableModels.length === 0 ? (
                    <p className="text-sm text-muted-foreground/60 py-1">
                      No models added yet. Type a model name below to add one.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {availableModels.map(m => (
                        <div
                          key={m}
                          className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-sm font-medium border cursor-pointer transition-all select-none
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
                      className="flex-1 h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Context Window</label>
              <input
                type="number"
                className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground placeholder:text-muted-foreground/40"
                placeholder={String(currentProvider?.contextWindow || 128000)}
                value={providerConfig.contextWindow || ''}
                onChange={(e) => updateProviderConfig({ contextWindow: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              />
            </div>

            <ModelParameterSettings />
          </div>
        </SectionCard>

        {/* ── GROQ BUILT-IN TOOLS ── */}
        {providerConfig.providerId === 'groq' && (
          <SectionCard>
            <SectionHeader icon={<WrenchIcon size={12} />} title="Built-in Tools" />
            <div className="p-3 flex flex-col gap-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enable Groq's built-in tools sent via <code className="text-xs bg-muted/60 px-1 py-0.5 rounded">compound_custom</code>. These run server-side without consuming function call tokens.
              </p>
              <div className="flex flex-col gap-1">
                {GROQ_BUILTIN_TOOLS.map((tool) => {
                  const enabled = groqEnabledBuiltinTools.includes(tool.id);
                  return (
                    <label
                      key={tool.id}
                      className="flex items-start gap-2.5 px-2 py-2 rounded-md cursor-pointer hover:bg-muted/30 transition-colors select-none"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 accent-primary"
                        checked={enabled}
                        onChange={() => {
                          const next = enabled
                            ? groqEnabledBuiltinTools.filter((id) => id !== tool.id)
                            : [...groqEnabledBuiltinTools, tool.id];
                          setGroqEnabledBuiltinTools(next);
                        }}
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">{tool.label}</span>
                        <span className="text-xs text-muted-foreground">{tool.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        )}

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

      <AddProviderModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddFromModal}
      />
    </section>
  );
}
