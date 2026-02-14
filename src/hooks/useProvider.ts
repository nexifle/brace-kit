import { useCallback, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { PROVIDER_PRESETS, fetchModels } from '../providers.ts';
import type { ProviderPreset, CustomProvider, ProviderFormat } from '../types/index.ts';

export function useProvider() {
  const store = useStore();

  const getProvider = useCallback((providerId: string): ProviderPreset | CustomProvider => {
    if (PROVIDER_PRESETS[providerId]) return PROVIDER_PRESETS[providerId];
    const custom = store.customProviders.find((cp) => cp.id === providerId);
    if (custom) return custom;
    return PROVIDER_PRESETS.openai;
  }, [store.customProviders]);

  const isCustomProvider = useCallback((providerId: string): boolean => {
    return store.customProviders.some((cp) => cp.id === providerId);
  }, [store.customProviders]);

  const availableProviders = useMemo(() => {
    const builtIn = Object.entries(PROVIDER_PRESETS)
      .filter(([id]) => id !== 'custom')
      .map(([_, preset]) => preset);
    return [...builtIn, ...store.customProviders];
  }, [store.customProviders]);

  const switchProvider = useCallback((newId: string) => {
    const oldId = store.providerConfig.providerId;
    const provider = getProvider(newId);

    // Save current provider's API key and model before switching
    store.setProviderKeys({
      ...store.providerKeys,
      [oldId]: {
        apiKey: store.providerConfig.apiKey,
        model: store.providerConfig.model,
      },
    });

    // Load the new provider's stored key and model
    const saved = store.providerKeys[newId] || {};

    store.setProviderConfig({
      providerId: newId,
      apiUrl: provider.apiUrl,
      format: provider.format as ProviderFormat,
      apiKey: saved.apiKey || (isCustomProvider(newId) ? (provider as CustomProvider).apiKey : '') || '',
      model: saved.model || provider.defaultModel || '',
    });

    store.saveToStorage();

    // Fetch models for the new provider if supported and has API key
    if ((provider as ProviderPreset).supportsModelFetch && store.providerConfig.apiKey) {
      fetchAndCacheModels(newId);
    }
  }, [store, getProvider, isCustomProvider]);

  const updateProviderConfig = useCallback((updates: Partial<typeof store.providerConfig>) => {
    store.setProviderConfig(updates);

    // Keep providerKeys in sync
    if (updates.apiKey !== undefined || updates.model !== undefined) {
      const providerId = store.providerConfig.providerId;
      store.setProviderKeys({
        ...store.providerKeys,
        [providerId]: {
          apiKey: updates.apiKey ?? store.providerConfig.apiKey,
          model: updates.model ?? store.providerConfig.model,
        },
      });

      // If the active provider is custom, sync back to the custom provider entry
      if (isCustomProvider(providerId)) {
        store.updateCustomProvider(providerId, {
          apiKey: updates.apiKey ?? store.providerConfig.apiKey,
          apiUrl: updates.apiUrl ?? store.providerConfig.apiUrl,
          model: updates.model ?? store.providerConfig.model,
          format: (updates.format as ProviderFormat) ?? store.providerConfig.format,
        });
      }
    }

    store.saveToStorage();
  }, [store, isCustomProvider]);

  const fetchAndCacheModels = useCallback(async (providerId: string) => {
    if (store.fetchingModels) return;

    // Check if we have a valid cache (less than 1 hour old)
    const cached = store.fetchedModels[providerId];
    if (cached && Date.now() - cached.fetchedAt < 3600000) {
      return;
    }

    store.setFetchingModels(true);

    try {
      const provider = getProvider(providerId);
      const result = await fetchModels({
        ...provider,
        apiKey: store.providerConfig.apiKey,
      });

      if (result?.models && result.models.length > 0) {
        store.setFetchedModels(providerId, {
          models: result.models,
          fetchedAt: Date.now(),
        });
      }
    } catch (e) {
      console.warn('Failed to fetch models:', e);
    } finally {
      store.setFetchingModels(false);
    }
  }, [store, getProvider]);

  const getAvailableModels = useCallback((providerId: string): string[] => {
    const provider = getProvider(providerId) as ProviderPreset;
    const cached = store.fetchedModels[providerId];

    if (cached?.models?.length && cached.models.length > 0) {
      return cached.models;
    } else if (provider?.staticModels?.length && provider.staticModels.length > 0) {
      return provider.staticModels;
    } else if (provider?.models?.length && provider.models.length > 0) {
      return provider.models ?? [];
    }

    return [];
  }, [store.fetchedModels, getProvider]);

  const addCustomProvider = useCallback((name: string, apiUrl: string, format: ProviderFormat) => {
    const id = 'custom_' + Date.now();
    const newProvider: CustomProvider = {
      id,
      name,
      apiUrl,
      apiKey: '',
      model: '',
      defaultModel: '',
      format,
      models: [],
    };

    store.addCustomProvider(newProvider);

    // Auto-select the new provider
    store.setProviderConfig({
      providerId: id,
      apiUrl,
      apiKey: '',
      model: '',
      format,
    });

    store.saveToStorage();
  }, [store]);

  const removeCustomProvider = useCallback((id: string) => {
    store.removeCustomProvider(id);

    // If the removed provider was active, switch to openai
    if (store.providerConfig.providerId === id) {
      const fallback = PROVIDER_PRESETS.openai;
      store.setProviderConfig({
        providerId: 'openai',
        apiUrl: fallback.apiUrl,
        format: fallback.format as ProviderFormat,
        apiKey: '',
        model: '',
      });
    }

    store.saveToStorage();
  }, [store]);

  const providerInfo = useMemo(() => {
    const provider = getProvider(store.providerConfig.providerId);
    const providerName = provider?.name || 'Custom';
    const model = store.providerConfig.model || provider?.defaultModel || '';
    const isConfigured = !!store.providerConfig.apiKey;

    return {
      providerName,
      model,
      isConfigured,
    };
  }, [store.providerConfig, getProvider]);

  return {
    providerConfig: store.providerConfig,
    customProviders: store.customProviders,
    showCustomModel: store.showCustomModel,
    availableProviders,
    providerInfo,
    getProvider,
    isCustomProvider,
    switchProvider,
    updateProviderConfig,
    fetchAndCacheModels,
    getAvailableModels,
    addCustomProvider,
    removeCustomProvider,
    setShowCustomModel: store.setShowCustomModel,
  };
}
