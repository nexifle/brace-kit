import { useState, useEffect, useCallback } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import { PROVIDER_PRESETS } from '../../providers.ts';
import type { ProviderFormat, ProviderPreset } from '../../types/index.ts';

export function ProviderSettings() {
  const {
    providerConfig,
    customProviders,
    showCustomModel,
    getProvider,
    isCustomProvider,
    switchProvider,
    updateProviderConfig,
    fetchAndCacheModels,
    getAvailableModels,
    setShowCustomModel,
  } = useProvider();

  const [showKey, setShowKey] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  const currentProvider = getProvider(providerConfig.providerId) as ProviderPreset;
  const isBuiltIn = !!PROVIDER_PRESETS[providerConfig.providerId];

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

  return (
    <section className="settings-section">
      <h3>Active Provider</h3>
      <div className="provider-card">
        <select value={providerConfig.providerId} onChange={handleProviderChange}>
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

        <div className="provider-fields">
          <div className="field-row">
            <div className="form-group compact">
              <label htmlFor="api-key">API Key</label>
              <div className="input-with-toggle">
                <input
                  type={showKey ? 'text' : 'password'}
                  id="api-key"
                  placeholder="sk-..."
                  value={providerConfig.apiKey}
                  onChange={handleApiKeyChange}
                />
                <button
                  className="toggle-vis-btn"
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
          </div>

          {!isBuiltIn && (
            <div className="field-row" id="url-row">
              <div className="form-group compact">
                <label htmlFor="api-url">Base URL</label>
                <input
                  type="url"
                  id="api-url"
                  placeholder="https://..."
                  value={providerConfig.apiUrl}
                  onChange={(e) => updateProviderConfig({ apiUrl: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="field-row-grid">
            <div className="form-group compact">
              <label htmlFor="model-select">Model</label>
              <div className="model-input-row">
                {showCustomModel || availableModels.length === 0 ? (
                  <input
                    type="text"
                    id="model-custom"
                    placeholder="Model name"
                    value={providerConfig.model}
                    onChange={(e) => updateProviderConfig({ model: e.target.value })}
                  />
                ) : (
                  <select
                    id="model-select"
                    value={providerConfig.model}
                    onChange={(e) => updateProviderConfig({ model: e.target.value })}
                  >
                    {availableModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                )}
                <button
                  className="toggle-vis-btn"
                  title="Custom model"
                  onClick={() => setShowCustomModel(!showCustomModel)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                  </svg>
                </button>
              </div>
            </div>
            {isCustomProvider(providerConfig.providerId) && (
              <div className="form-group compact" id="format-group">
                <label htmlFor="api-format">Format</label>
                <select
                  id="api-format"
                  value={providerConfig.format}
                  onChange={(e) => updateProviderConfig({ format: e.target.value as ProviderFormat })}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Gemini</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
