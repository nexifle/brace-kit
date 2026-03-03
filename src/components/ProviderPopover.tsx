import { useState, useRef, useCallback, useEffect } from 'react';
import { useProvider } from '../hooks';
import { PROVIDER_PRESETS } from '../providers';
import type { ProviderFormat, ProviderPreset } from '../types/index.ts';
import { XIcon } from 'lucide-react';

interface ProviderPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProviderPopover({ isOpen, onClose }: ProviderPopoverProps) {
  const {
    providerConfig,
    availableProviders,
    getAvailableModels,
    isCustomProvider,
    switchProvider,
    updateProviderConfig,
    addCustomProvider,
    addModelToCustomProvider,
    removeModelFromCustomProvider,
    fetchAndCacheModels,
  } = useProvider();

  const [localSelectedProvider, setLocalSelectedProvider] = useState(providerConfig.providerId);
  const [newModelInput, setNewModelInput] = useState('');
  const [showNewProviderForm, setShowNewProviderForm] = useState(false);
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderUrl, setNewProviderUrl] = useState('');
  const [newProviderFormat, setNewProviderFormat] = useState<ProviderFormat>('openai');
  const newModelInputRef = useRef<HTMLInputElement>(null);

  const handleSelectModel = useCallback((modelName: string) => {
    if (localSelectedProvider !== providerConfig.providerId) {
      switchProvider(localSelectedProvider);
    }
    updateProviderConfig({ model: modelName });
    onClose();
  }, [localSelectedProvider, providerConfig.providerId, switchProvider, updateProviderConfig, onClose]);

  const handleAddModel = useCallback(() => {
    const model = newModelInput.trim();
    if (!model || !isCustomProvider(localSelectedProvider)) return;
    addModelToCustomProvider(localSelectedProvider, model);
    setNewModelInput('');
  }, [newModelInput, localSelectedProvider, isCustomProvider, addModelToCustomProvider]);

  const handleAddProvider = useCallback(() => {
    const name = newProviderName.trim();
    const url = newProviderUrl.trim();
    if (!name || !url) return;

    addCustomProvider(name, url, newProviderFormat);
    setNewProviderName('');
    setNewProviderUrl('');
    setNewProviderFormat('openai');
    setShowNewProviderForm(false);
    onClose();
  }, [newProviderName, newProviderUrl, newProviderFormat, addCustomProvider, onClose]);

  const handleNewModelKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddModel();
    }
  }, [handleAddModel]);

  // Auto-fetch models when browsing a provider that supports it
  useEffect(() => {
    if (!isOpen) return;
    const provider = availableProviders.find(p => p.id === localSelectedProvider);
    if ((provider as ProviderPreset)?.supportsModelFetch) {
      fetchAndCacheModels(localSelectedProvider);
    }
  }, [isOpen, localSelectedProvider, availableProviders, fetchAndCacheModels]);

  if (!isOpen) return null;

  const localProvider = availableProviders.find(p => p.id === localSelectedProvider);
  const models = getAvailableModels(localSelectedProvider);

  // Built-in providers list (exclude 'custom' catch-all)
  const builtInProviders = Object.values(PROVIDER_PRESETS).filter(p => p.id !== 'custom');
  // Custom providers
  const customProviders = availableProviders.filter(p => isCustomProvider(p.id));

  const displayProviders = [...builtInProviders, ...customProviders];

  return (
    <div className="absolute bottom-full left-3 right-3 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[420px]">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">AI Provider & Model</span>
          <button className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all rounded-sm" onClick={onClose} title="Close">
            <XIcon size={12} />
          </button>
        </div>

        <div className="overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-4">
          {/* Providers Section */}
          <div className="flex flex-col gap-2">
            <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60 px-0.5">Providers</div>
            <div className="grid grid-cols-3 gap-1.5">
              {displayProviders.map(provider => {
                const isActive = provider.id === providerConfig.providerId;
                const isSelected = provider.id === localSelectedProvider;
                return (
                  <button
                    key={provider.id}
                    className={`px-2 py-1.5 text-2xs font-bold uppercase tracking-tight text-center transition-all border rounded-sm ${isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/60 hover:text-foreground'
                      } ${isActive && !isSelected ? 'ring-1 ring-primary/30 ring-inset' : ''}`}
                    onClick={() => setLocalSelectedProvider(provider.id)}
                    title={provider.name}
                  >
                    {provider.name}
                  </button>
                );
              })}
              <button
                className={`flex items-center justify-center px-2 py-1.5 text-2xs font-bold uppercase border border-dashed rounded-sm transition-all ${showNewProviderForm
                  ? 'bg-primary/20 text-primary border-primary/40'
                  : 'bg-transparent text-muted-foreground border-border/60 hover:bg-muted/30 hover:text-foreground'
                  }`}
                onClick={() => setShowNewProviderForm(v => !v)}
                title="Add new provider"
              >
                + NEW
              </button>
            </div>
          </div>

          {/* New Provider Form */}
          {showNewProviderForm && (
            <div className="flex flex-col gap-2 p-3 bg-secondary/30 border border-border/50 animate-in fade-in slide-in-from-top-2 rounded-md">
              <div className="text-2xs font-bold uppercase tracking-widest text-primary px-0.5 mb-1">Add New Provider</div>
              <input
                className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-sm focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                type="text"
                placeholder="Name (e.g. My LLM)"
                value={newProviderName}
                onChange={e => setNewProviderName(e.target.value)}
              />
              <input
                className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded-sm focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                type="text"
                placeholder="API URL"
                value={newProviderUrl}
                onChange={e => setNewProviderUrl(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 h-8 px-2 text-xs bg-muted/40 border border-input rounded-sm focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
                  value={newProviderFormat}
                  onChange={e => setNewProviderFormat(e.target.value as ProviderFormat)}
                >
                  <option value="openai">OpenAI format</option>
                  <option value="anthropic">Anthropic format</option>
                  <option value="gemini">Gemini format</option>
                </select>
                <button
                  className="px-3 h-8 text-2xs font-bold uppercase bg-primary text-primary-foreground rounded-sm shadow-sm hover:brightness-110 active:scale-95 disabled:opacity-30 transition-all"
                  onClick={handleAddProvider}
                  disabled={!newProviderName.trim() || !newProviderUrl.trim()}
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {/* Models Section */}
          {localProvider && (
            <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between px-0.5">
                <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60">
                  Available Models
                  {localSelectedProvider !== providerConfig.providerId && (
                    <span className="text-primary ml-1 lowpan opacity-80">(browsing)</span>
                  )}
                </div>
              </div>

              {models.length > 0 ? (
                <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
                  {models.map(model => {
                    const isActiveModel = model === providerConfig.model && localSelectedProvider === providerConfig.providerId;
                    return (
                      <div key={model} className="group flex items-center gap-1">
                        <button
                          className={`flex-1 flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-all rounded-sm border ${isActiveModel
                            ? 'bg-primary/10 text-primary border-primary/30 font-medium'
                            : 'bg-muted/20 text-muted-foreground border-transparent hover:bg-muted/40 hover:text-foreground'
                            }`}
                          onClick={() => handleSelectModel(model)}
                        >
                          <div className={`w-1.5 h-1.5 rounded-full ${isActiveModel ? 'bg-primary animate-pulse' : 'bg-muted-foreground/40'}`} />
                          <span className="truncate flex-1">{model}</span>
                          {isActiveModel && <span className="text-2xs font-bold uppercase tracking-tighter opacity-70">active</span>}
                        </button>
                        {isCustomProvider(localSelectedProvider) && (
                          <button
                            className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm transition-all opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeModelFromCustomProvider(localSelectedProvider, model);
                            }}
                            title="Remove model"
                          >
                            <XIcon size={10} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 px-2 text-center rounded-md border border-dashed border-border/40 bg-muted/10">
                  <p className="text-2xs text-muted-foreground italic">No models found for this provider.</p>
                </div>
              )}

              {/* Add model input — hanya untuk custom provider */}
              {isCustomProvider(localSelectedProvider) && (
                <div className="flex gap-1.5 p-1 bg-muted/20 border border-border/40 rounded-md">
                  <input
                    ref={newModelInputRef}
                    className="flex-1 h-7 px-2 text-xs bg-transparent border-none outline-none placeholder:text-muted-foreground/40 text-foreground"
                    type="text"
                    placeholder="Add model name..."
                    value={newModelInput}
                    onChange={e => setNewModelInput(e.target.value)}
                    onKeyDown={handleNewModelKeyDown}
                  />
                  <button
                    className="px-2 h-7 text-2xs font-bold uppercase bg-primary/20 text-primary hover:bg-primary/30 rounded-sm transition-all disabled:opacity-30"
                    onClick={handleAddModel}
                    disabled={!newModelInput.trim()}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
