import { useCallback, useMemo } from 'react';
import { useStore } from '../store/index.ts';
import { PROVIDER_PRESETS, fetchModels } from '../providers';
import type { ProviderPreset, CustomProvider, ProviderFormat } from '../types/index.ts';
import { getProvider as getProviderUtil, isCustomProvider as isCustomProviderUtil, isOllamaLocalhost } from '../utils/providerUtils.ts';

function normalizeModelList(models?: string[]): string[] {
  if (!models?.length) return [];

  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || unique.has(trimmed)) continue;
    unique.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function useProvider() {
  const store = useStore();
  const getState = useStore.getState;

  const getProvider = useCallback(
    (providerId: string): ProviderPreset | CustomProvider => getProviderUtil(providerId, store.customProviders),
    [store.customProviders]
  );

  const isCustomProvider = useCallback(
    (providerId: string): boolean => isCustomProviderUtil(providerId, store.customProviders),
    [store.customProviders]
  );

  const availableProviders = useMemo(() => {
    const builtIn = Object.values(PROVIDER_PRESETS);
    return [...builtIn, ...store.customProviders];
  }, [store.customProviders]);

  const getAvailableModels = useCallback((providerId: string): string[] => {
    const provider = getProvider(providerId);

    if (isCustomProvider(providerId)) {
      const cp = provider as CustomProvider;

      // If custom provider supports model fetch, prefer fetched cache
      if (cp.supportsModelFetch) {
        const cached = store.fetchedModels[providerId];
        if (cached?.models?.length) return normalizeModelList(cached.models);
      }

      return normalizeModelList(cp.models);
    }

    const providerPreset = provider as ProviderPreset;
    const cached = store.fetchedModels[providerId];

    if (cached?.models && cached.models.length > 0) {
      return normalizeModelList(cached.models);
    } else if (providerPreset?.staticModels?.length && providerPreset.staticModels.length > 0) {
      return normalizeModelList(providerPreset.staticModels);
    } else if (providerPreset?.models?.length && providerPreset.models.length > 0) {
      return normalizeModelList(providerPreset.models);
    }

    return [];
  }, [store.fetchedModels, getProvider, isCustomProvider]);

  const fetchAndCacheModels = useCallback(async (providerId: string) => {
    const initialState = getState();
    if (initialState.fetchingModels) return;

    // Check if we have a valid cache (less than 1 hour old)
    const cached = initialState.fetchedModels[providerId];
    if (cached && Date.now() - cached.fetchedAt < 3600000) {
      return;
    }

    const provider = getProviderUtil(providerId, initialState.customProviders);
    const isCustom = isCustomProviderUtil(providerId, initialState.customProviders);

    // Use the stored API key for this specific provider, fallback to the
    // active config if it's the same provider, or the custom provider entry
    // if the provider has just been added and providerKeys has not been synced yet.
    const apiKey = initialState.providerKeys[providerId]?.apiKey
      || (providerId === initialState.providerConfig.providerId ? initialState.providerConfig.apiKey : '')
      || (isCustom ? (provider as CustomProvider).apiKey : '');

    const isLocalhost = isOllamaLocalhost(provider?.format, provider?.apiUrl);

    // Skip if no API key and not Ollama localhost
    if (!apiKey && !isLocalhost) return;

    store.setFetchingModels(true);

    try {
      const result = await fetchModels({
        ...provider,
        apiKey,
      });

      if (result?.models && result.models.length > 0) {
        const models = normalizeModelList(result.models);
        if (models.length === 0) return;

        store.setFetchedModels(providerId, {
          models,
          fetchedAt: Date.now(),
        });

        // Persist fetched models to the custom provider's models array
        if (isCustom) {
          store.updateCustomProvider(providerId, { models: models.slice() });
        }
      }
    } catch (e) {
      console.warn('Failed to fetch models:', e);
    } finally {
      store.setFetchingModels(false);
    }
  }, [store, getState]);

  const switchProvider = useCallback((newId: string, modelOverride?: string) => {
    const state = getState();
    const oldId = state.providerConfig.providerId;
    const provider = getProviderUtil(newId, state.customProviders);
    const isCustom = isCustomProviderUtil(newId, state.customProviders);

    // Save current provider's API key and model before switching
    store.setProviderKeys({
      ...state.providerKeys,
      [oldId]: {
        apiKey: state.providerConfig.apiKey,
        model: state.providerConfig.model,
      },
    });

    // Load the new provider's stored key and model
    const saved = state.providerKeys[newId] || {};
    const nextApiKey = saved.apiKey || (isCustom ? (provider as CustomProvider).apiKey : '') || '';
    const nextAvailableModels = normalizeModelList(
      isCustom
        ? (state.fetchedModels[newId]?.models?.length
          ? state.fetchedModels[newId]?.models
          : (provider as CustomProvider).models)
        : (state.fetchedModels[newId]?.models?.length
          ? state.fetchedModels[newId]?.models
          : (provider as ProviderPreset).staticModels?.length
            ? (provider as ProviderPreset).staticModels
            : (provider as ProviderPreset).models)
    );
    const nextModel = modelOverride || saved.model || provider.defaultModel || nextAvailableModels[0] || '';

    store.setProviderConfig({
      providerId: newId,
      apiUrl: provider.apiUrl,
      format: provider.format as ProviderFormat,
      apiKey: nextApiKey,
      model: nextModel,
      // Clear model parameters when switching providers so settings from
      // one provider do not unexpectedly carry over to another.
      modelParameters: undefined,
    });

    store.saveToStorage();

    // Fetch models for the new provider if supported
    // Ollama localhost doesn't require API key, others do
    const isLocalhost = isOllamaLocalhost(provider.format, provider.apiUrl);
    if ((provider as ProviderPreset).supportsModelFetch && (nextApiKey || isLocalhost)) {
      fetchAndCacheModels(newId);
    }
  }, [store, getState, fetchAndCacheModels]);

  const updateProviderConfig = useCallback((updates: Partial<typeof store.providerConfig>) => {
    const state = getState();
    const providerId = state.providerConfig.providerId;

    store.setProviderConfig(updates);

    // Keep providerKeys in sync
    if (updates.apiKey !== undefined || updates.model !== undefined) {
      store.setProviderKeys({
        ...state.providerKeys,
        [providerId]: {
          apiKey: updates.apiKey ?? state.providerConfig.apiKey,
          model: updates.model ?? state.providerConfig.model,
        },
      });
    }

    // If the active provider is custom, sync back to the custom provider entry
    if (isCustomProviderUtil(providerId, state.customProviders)) {
      store.updateCustomProvider(providerId, {
        apiKey: updates.apiKey ?? state.providerConfig.apiKey,
        apiUrl: updates.apiUrl ?? state.providerConfig.apiUrl,
        model: updates.model ?? state.providerConfig.model,
        format: (updates.format as ProviderFormat) ?? state.providerConfig.format,
      });
    }

    store.saveToStorage();
  }, [store, getState]);

  const addCustomProvider = useCallback((name: string, apiUrl: string, format: ProviderFormat, contextWindow?: number, apiKey?: string, model?: string, supportsModelFetch?: boolean) => {
    const id = 'custom_' + Date.now();
    const shouldAutoFetch = supportsModelFetch !== false;
    const initialModels = normalizeModelList(model ? [model] : []);

    const newProvider: CustomProvider = {
      id,
      name,
      apiUrl,
      apiKey: apiKey || '',
      model: model || '',
      defaultModel: model || '',
      format,
      models: initialModels,
      contextWindow,
      supportsModelFetch: shouldAutoFetch,
    };

    store.addCustomProvider(newProvider);
    store.setProviderKeys({
      ...getState().providerKeys,
      [id]: {
        apiKey: apiKey || '',
        model: model || '',
      },
    });

    // Auto-select the new provider with all config pre-filled
    store.setProviderConfig({
      providerId: id,
      apiUrl,
      apiKey: apiKey || '',
      model: model || '',
      format,
    });

    store.saveToStorage();

    // Auto-fetch models if supported and possible
    const isLocalhost = isOllamaLocalhost(format, apiUrl);
    if (shouldAutoFetch && (apiKey || isLocalhost)) {
      fetchModels({ ...newProvider, apiKey: apiKey || '' })
        .then((result) => {
          if (result?.models && result.models.length > 0) {
            const models = normalizeModelList(result.models);
            const firstModel = models[0];
            if (!firstModel) return;

            // Persist fetched models to provider's models array
            store.updateCustomProvider(id, {
              models,
              supportsModelFetch: true,
            });

            // Auto-select first model if no model was provided
            if (!model) {
              store.updateCustomProvider(id, { model: firstModel, defaultModel: firstModel });
              store.setProviderConfig({ model: firstModel });
            }

            // Also cache in fetchedModels for getAvailableModels
            store.setFetchedModels(id, {
              models: models.slice(),
              fetchedAt: Date.now(),
            });

            store.saveToStorage();
          }
        })
        .catch(() => {
          // Silently skip - provider still works with manual model entry
        });
    }
  }, [store, getState]);

  const addModelToCustomProvider = useCallback((providerId: string, modelName: string) => {
    const cp = getState().customProviders.find(p => p.id === providerId);
    const normalizedModel = modelName.trim();
    if (!cp || !normalizedModel || cp.models.includes(normalizedModel)) return;
    store.updateCustomProvider(providerId, {
      models: normalizeModelList([...cp.models, normalizedModel]),
    });
    store.saveToStorage();
  }, [store, getState]);

  const removeModelFromCustomProvider = useCallback((providerId: string, modelName: string) => {
    const state = getState();
    const cp = state.customProviders.find(p => p.id === providerId);
    if (!cp) return;
    const updatedModels = cp.models.filter(m => m !== modelName);
    const newActiveModel = cp.model === modelName ? (updatedModels[0] || '') : cp.model;
    store.updateCustomProvider(providerId, {
      models: updatedModels,
      model: newActiveModel,
    });
    // Sync providerConfig.model if this is the active provider and the removed model was selected
    if (providerId === state.providerConfig.providerId && state.providerConfig.model === modelName) {
      store.setProviderConfig({ model: newActiveModel });
    }
    store.saveToStorage();
  }, [store, getState]);

  const removeCustomProvider = useCallback((id: string) => {
    const state = getState();
    store.removeCustomProvider(id);

    // If the removed provider was active, switch to openai
    if (state.providerConfig.providerId === id) {
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
  }, [store, getState]);

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
    addModelToCustomProvider,
    removeModelFromCustomProvider,
    setShowCustomModel: store.setShowCustomModel,
  };
}
