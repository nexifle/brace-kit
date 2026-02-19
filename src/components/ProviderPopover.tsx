import { useState, useRef, useCallback, useEffect } from 'react';
import { useProvider } from '../hooks/useProvider.ts';
import { PROVIDER_PRESETS } from '../providers.ts';
import type { ProviderFormat, ProviderPreset } from '../types/index.ts';

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
    <div className="provider-popover">
      {/* Header */}
      <div className="provider-popover-header">
        <span className="provider-popover-title">AI Provider &amp; Model</span>
        <button className="provider-popover-close" onClick={onClose} title="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="provider-popover-body">
        {/* Providers Section */}
        <div className="provider-popover-section">
          <div className="provider-popover-label">Providers</div>
          <div className="provider-grid">
            {displayProviders.map(provider => {
              const isActive = provider.id === providerConfig.providerId;
              const isSelected = provider.id === localSelectedProvider;
              return (
                <button
                  key={provider.id}
                  className={`provider-grid-item${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`}
                  onClick={() => setLocalSelectedProvider(provider.id)}
                  title={provider.name}
                >
                  {provider.name}
                </button>
              );
            })}
            <button
              className={`provider-grid-item add-new${showNewProviderForm ? ' selected' : ''}`}
              onClick={() => setShowNewProviderForm(v => !v)}
              title="Add new provider"
            >
              + New
            </button>
          </div>
        </div>

        {/* New Provider Form */}
        {showNewProviderForm && (
          <div className="provider-popover-section popover-new-provider-form">
            <div className="provider-popover-label">New Provider</div>
            <input
              className="popover-input"
              type="text"
              placeholder="Name (e.g. My LLM)"
              value={newProviderName}
              onChange={e => setNewProviderName(e.target.value)}
            />
            <input
              className="popover-input"
              type="text"
              placeholder="API URL"
              value={newProviderUrl}
              onChange={e => setNewProviderUrl(e.target.value)}
            />
            <div className="add-model-row">
              <select
                className="popover-select"
                value={newProviderFormat}
                onChange={e => setNewProviderFormat(e.target.value as ProviderFormat)}
              >
                <option value="openai">OpenAI format</option>
                <option value="anthropic">Anthropic format</option>
                <option value="gemini">Gemini format</option>
              </select>
              <button
                className="popover-add-btn"
                onClick={handleAddProvider}
                disabled={!newProviderName.trim() || !newProviderUrl.trim()}
              >
                Add Provider
              </button>
            </div>
          </div>
        )}

        {/* Models Section */}
        {localProvider && (
          <div className="provider-popover-section">
            <div className="provider-popover-label">
              Models
              {localSelectedProvider !== providerConfig.providerId && (
                <span className="provider-popover-browse-hint"> (browsing)</span>
              )}
            </div>

            {models.length > 0 ? (
              <div className="model-list">
                {models.map(model => {
                  const isActiveModel = model === providerConfig.model && localSelectedProvider === providerConfig.providerId;
                  return (
                    <div key={model} className={`model-list-item${isActiveModel ? ' active' : ''}`}>
                      <button
                        className="model-list-item-btn"
                        onClick={() => handleSelectModel(model)}
                      >
                        <span className="model-radio-dot" />
                        <span className="model-list-item-name">{model}</span>
                        {isActiveModel && <span className="model-active-label">active</span>}
                      </button>
                      {isCustomProvider(localSelectedProvider) && (
                        <button
                          className="model-list-item-remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeModelFromCustomProvider(localSelectedProvider, model);
                          }}
                          title="Remove model"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="model-list-empty">No models listed</div>
            )}

            {/* Add model input — hanya untuk custom provider */}
            {isCustomProvider(localSelectedProvider) && (
              <div className="add-model-row">
                <input
                  ref={newModelInputRef}
                  className="popover-input"
                  type="text"
                  placeholder="Add model..."
                  value={newModelInput}
                  onChange={e => setNewModelInput(e.target.value)}
                  onKeyDown={handleNewModelKeyDown}
                />
                <button
                  className="popover-add-btn"
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
  );
}
