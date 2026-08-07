import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import { GROQ_BUILTIN_TOOLS, FORMAT_LABELS } from '../../providers';
import { isOllamaLocalhost } from '../../utils/providerUtils.ts';
import type { ProviderFormat, ProviderPreset } from '../../types/index.ts';
import { PlusIcon, LayersIcon, SlidersHorizontalIcon, Settings2Icon, WrenchIcon } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { ModelParameterSettings } from './ModelParameterSettings.tsx';
import { AddProviderModal } from './AddProviderModal.tsx';
import { ProviderSelect } from './ProviderSelect.tsx';
import { ModelList } from './ModelList.tsx';
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
    updateProviderConfig,
    getProvider,
    isCustomProvider,
    getAvailableModels,
    fetchAndCacheModels,
    addCustomProvider,
    removeCustomProvider,
    addModelToCustomProvider,
    removeModelFromCustomProvider,
  } = useProvider();

  const groqEnabledBuiltinTools = useStore((s) => s.groqEnabledBuiltinTools);
  const setGroqEnabledBuiltinTools = useStore((s) => s.setGroqEnabledBuiltinTools);
  const grokAuthStatus = useStore((s) => s.grokAuthStatus);
  const refreshGrokAuthStatus = useStore((s) => s.refreshGrokAuthStatus);

  const [showKey, setShowKey] = useState(false);
  const [newModelInput, setNewModelInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Grok OAuth in-flight device flow (userCode + verification link + poll interval)
  const [grokFlow, setGrokFlow] = useState<{
    userCode: string;
    interval: number;
    verificationUri: string;
  } | null>(null);
  const [grokFlowError, setGrokFlowError] = useState('');

  // Confirmation state
  const [providerToDelete, setProviderToDelete] = useState<{ id: string, name: string } | null>(null);

  const currentProvider = getProvider(providerConfig.providerId) as ProviderPreset;
  const isCustom = isCustomProvider(providerConfig.providerId);
  const isOllama = currentProvider?.format === 'ollama';
  const isGrok = providerConfig.providerId === 'grok';

  // Setup readiness. For Grok (OAuth) "configured" means signed in with a
  // session that can still refresh — an expired one requires a reconnect.
  const hasApiKey = isGrok
    ? grokAuthStatus.connected && !grokAuthStatus.needsReauth
    : !!providerConfig.apiKey || isOllama;
  const hasModel = !!providerConfig.model;
  const isReady = hasApiKey && hasModel;

  // Grok OAuth actions
  const handleGrokSignIn = useCallback(async () => {
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GROK_OAUTH_START' });
      if (res?.ok) {
        setGrokFlow({
          userCode: res.userCode,
          interval: res.interval,
          verificationUri: res.verificationUri,
        });
        setGrokFlowError('');
      } else {
        setGrokFlowError(res?.error || 'Failed to start Grok sign-in');
      }
    } catch {
      setGrokFlowError('Failed to start Grok sign-in');
    }
  }, []);

  const handleGrokCancel = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'GROK_OAUTH_CANCEL' });
    setGrokFlow(null);
    setGrokFlowError('');
  }, []);

  const handleGrokSignout = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: 'GROK_OAUTH_SIGNOUT' });
    setGrokFlow(null);
    setGrokFlowError('');
    refreshGrokAuthStatus();
  }, [refreshGrokAuthStatus]);

  // Poll the token endpoint while a flow is active. The effect is keyed on
  // grokFlow so a slow_down interval bump simply re-schedules the timer.
  useEffect(() => {
    if (!grokFlow) return;
    const timeoutMs = Math.max(grokFlow.interval, 5) * 1000;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      if (cancelled) return;
      let res: unknown;
      try {
        res = await chrome.runtime.sendMessage({ type: 'GROK_OAUTH_POLL' });
      } catch {
        res = { status: 'error', error: 'Background not responding' };
      }
      const r = res as {
        status?: string;
        interval?: number;
        error?: string;
      };
      if (r?.status === 'success') {
        setGrokFlow(null);
        setGrokFlowError('');
        refreshGrokAuthStatus();
      } else if (r?.status === 'pending') {
        setGrokFlow((prev) =>
          prev ? { ...prev, interval: r.interval ?? prev.interval } : prev
        );
      } else {
        setGrokFlow(null);
        setGrokFlowError(
          r?.error ||
            (r?.status === 'denied'
              ? 'Access denied'
              : r?.status === 'expired'
                ? 'Code expired — try signing in again'
                : 'Grok sign-in failed')
        );
      }
    };

    timer = setInterval(poll, timeoutMs);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [grokFlow, refreshGrokAuthStatus]);

  // Track the last URL we fetched against, so edits to the endpoint force a
  // refresh while unrelated re-renders stay throttled.
  const prevFetchUrl = useRef<string | undefined>(undefined);

  // Whether custom provider uses fetched dropdown instead of chip UI
  const availableModels = useMemo(
    () => getAvailableModels(providerConfig.providerId),
    [providerConfig.providerId, getAvailableModels]
  );

  useEffect(() => {
    const isLocalhost = isOllamaLocalhost(currentProvider?.format, providerConfig.apiUrl);
    if (currentProvider?.supportsModelFetch && (providerConfig.apiKey || isLocalhost)) {
      // Force a re-fetch when the user changes the endpoint URL (a failed
      // attempt otherwise backs off for a few minutes). API-key edits and
      // unrelated re-renders stay throttled by the cache.
      const urlChanged =
        prevFetchUrl.current !== undefined && prevFetchUrl.current !== providerConfig.apiUrl;
      prevFetchUrl.current = providerConfig.apiUrl;
      fetchAndCacheModels(providerConfig.providerId, { force: urlChanged });
    }
  }, [providerConfig.providerId, providerConfig.apiKey, providerConfig.apiUrl, currentProvider?.supportsModelFetch, currentProvider?.format, fetchAndCacheModels]);

  const handleApiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // The fetch-on-change effect above handles model refresh (throttled).
    updateProviderConfig({ apiKey: e.target.value });
  }, [updateProviderConfig]);

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
          <div className="p-3 flex flex-col gap-2.5">
            <ProviderSelect
              onAddClick={() => setShowAddModal(true)}
              onRequestRemove={(p) => setProviderToDelete(p)}
            />
            <p className="text-2xs text-muted-foreground leading-relaxed px-0.5">
              Pick a provider to chat with — search, then hit{' '}
              <span className="font-mono">Enter</span>. Add your own service with the{' '}
              <span className="font-semibold">+ Add</span> button.
            </p>
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
              {isGrok && grokAuthStatus.connected && grokAuthStatus.needsReauth ? (
                <>
                  <span>Grok session expired — Reconnect below</span>
                  <span className="text-muted-foreground font-normal ml-1">— Reconnect to keep chatting</span>
                </>
              ) : isGrok ? (
                <>
                  <span>Grok sign-in required — Connect below</span>
                  <span className="text-muted-foreground font-normal ml-1">— Sign in with Grok to start</span>
                </>
              ) : (
                <>
                  <span>API Key required</span>
                  <span className="text-muted-foreground font-normal ml-1">— Enter your key below to start</span>
                </>
              )}
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

            {/* API Key — hidden for Grok (OAuth), which uses the device flow */}
            {!isGrok && (
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
            )}

            {/* Grok (OAuth) sign-in card */}
            {isGrok && (
              <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                {grokFlow ? (
                  <>
                    <p className="text-sm text-foreground">
                      Waiting for authorization — open the opened tab (or{' '}
                      <a
                        href={grokFlow.verificationUri}
                        target="_blank"
                        rel="noreferrer"
                        className="underline text-primary hover:text-primary/80"
                      >
                        this link
                      </a>
                      ) and enter code{' '}
                      <span className="font-mono font-bold text-primary">{grokFlow.userCode}</span>.
                    </p>
                    <button
                      onClick={handleGrokCancel}
                      className="h-8 px-3 text-sm bg-muted/40 border border-input rounded-md hover:bg-accent transition-all text-foreground self-start"
                    >
                      Cancel
                    </button>
                  </>
                ) : grokAuthStatus.connected ? (
                  <>
                    <p className="text-sm text-foreground">
                      Connected as <strong>{grokAuthStatus.email || 'Grok account'}</strong>
                    </p>
                    {grokAuthStatus.needsReauth && (
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                        Session expired — reconnect to continue chatting.
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={handleGrokSignIn}
                        className="h-8 px-3 text-sm bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-all"
                      >
                        Reconnect
                      </button>
                      <button
                        onClick={handleGrokSignout}
                        className="h-8 px-3 text-sm bg-muted/40 border border-input rounded-md hover:bg-accent transition-all text-foreground"
                      >
                        Sign out
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={handleGrokSignIn}
                    className="h-8 px-3 text-sm bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-all self-start"
                  >
                    Sign in with Grok
                  </button>
                )}
                {grokFlowError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{grokFlowError}</p>
                )}
              </div>
            )}

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
                  {(Object.keys(FORMAT_LABELS) as ProviderFormat[]).map((f) => (
                    <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
                  ))}
                </select>
              </div>
            )}

              {/* Model — custom providers are user-managed: chips + add input.
                  Preset providers use a fetched dropdown or free-text input. */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Model</label>
                {isCustom ? (
                  // Custom providers: user-managed model list — searchable,
                  // bounded (internal scroll), with add/remove.
                  <div className="flex flex-col gap-2">
                    <ModelList
                      models={availableModels}
                      activeModel={providerConfig.model}
                      onSelect={(m) => updateProviderConfig({ model: m })}
                      onRemove={handleRemoveModel}
                      emptyText="No models added yet. Type a model name below to add one."
                    />

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
                // Preset provider with fetched model list: same searchable,
                // bounded list as custom providers for a consistent view.
                <ModelList
                  models={availableModels}
                  activeModel={providerConfig.model}
                  onSelect={(m) => updateProviderConfig({ model: m })}
                  emptyText="No models detected yet."
                />
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
