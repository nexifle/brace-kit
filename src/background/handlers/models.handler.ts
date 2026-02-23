/**
 * Models Handler - Handles FETCH_MODELS message for fetching available models
 * @module background/handlers/models
 */

import { fetchModels, type ProviderWithConfig } from '../../providers';
import type { ProviderConfig } from '../../types';

type SendResponse = (response?: unknown) => void;

interface FetchModelsMessage {
  type: 'FETCH_MODELS';
  providerConfig: ProviderConfig;
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
  const { providerConfig } = message;

  try {
    const provider: ProviderWithConfig = {
      ...providerConfig,
      id: providerConfig.providerId,
      name: providerConfig.providerId,
      defaultModel: providerConfig.model,
      format: providerConfig.format,
      apiUrl: providerConfig.apiUrl,
      apiKey: providerConfig.apiKey,
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
