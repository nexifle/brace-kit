/**
 * Models Handler - Handles FETCH_MODELS message for fetching available models
 * @module background/handlers/models
 */

import { fetchModels, type ProviderWithConfig, PROVIDER_PRESETS } from '../../providers';
import type { ProviderConfig, CustomProvider, ProviderPreset } from '../../types';

type SendResponse = (response?: unknown) => void;

interface FetchModelsMessage {
  type: 'FETCH_MODELS';
  providerConfig?: ProviderConfig;
  providerId?: string;
}

interface ModelsResponse {
  models?: string[];
  error?: string;
}

/**
 * Handle fetch models message
 * @param message - Fetch models message
 * @param sendResponse - Response callback
 */
export async function handleFetchModels(
  message: FetchModelsMessage,
  sendResponse: SendResponse
): Promise<void> {
  try {
    const data = await chrome.storage.local.get(['providerKeys', 'customProviders']);
    const providerKeys = (data.providerKeys || {}) as Record<string, { apiKey: string }>;
    const customProviders = (data.customProviders || []) as CustomProvider[];

    let activeConfig: ProviderConfig;

    if (message.providerId) {
      // Reconstruct config from storage + presets
      const id = message.providerId;
      const isCustom = id.startsWith('custom_') || id === 'custom';

      let baseProvider: ProviderPreset | CustomProvider | undefined;

      if (isCustom) {
        baseProvider = customProviders.find(p => p.id === id);
      } else {
        baseProvider = PROVIDER_PRESETS[id as keyof typeof PROVIDER_PRESETS] as ProviderPreset;
      }

      if (!baseProvider) {
        throw new Error(`Provider ${id} not found`);
      }

      activeConfig = {
        providerId: id,
        apiUrl: (baseProvider as CustomProvider).apiUrl || (baseProvider as ProviderPreset).apiUrl,
        format: (baseProvider as CustomProvider).format || (baseProvider as ProviderPreset).format,
        apiKey: providerKeys[id]?.apiKey || '',
        model: baseProvider.defaultModel || '',
        systemPrompt: '',
      };
    } else if (message.providerConfig) {
      // Fallback for older interface, but try to enrich with API key if missing
      activeConfig = { ...message.providerConfig };
      if (!activeConfig.apiKey && providerKeys[activeConfig.providerId]?.apiKey) {
        activeConfig.apiKey = providerKeys[activeConfig.providerId].apiKey;
      }
    } else {
      throw new Error('No provider config or ID provided');
    }

    const provider: ProviderWithConfig = {
      ...activeConfig,
      id: activeConfig.providerId,
      name: activeConfig.providerId,
      defaultModel: activeConfig.model,
      format: activeConfig.format,
      apiUrl: activeConfig.apiUrl,
      apiKey: activeConfig.apiKey,
    };

    const result = await fetchModels(provider);
    sendResponse(result as ModelsResponse);
  } catch (e) {
    sendResponse({ error: (e as Error).message });
  }
}

/**
 * Register models handlers on message listener
 * @param onMessage - Chrome message listener
 */
export function registerModelsHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
      if (message.type === 'FETCH_MODELS') {
        handleFetchModels(message as FetchModelsMessage, sendResponse);
        return true;
      }
      return false;
    }
  );
}
