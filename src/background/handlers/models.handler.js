/**
 * Models Handler - Handles FETCH_MODELS message for fetching available models
 * @module background/handlers/models
 */

import { fetchModels } from '../../providers';

/**
 * Handle fetch models message
 * @param {Object} message - Fetch models message
 * @param {Function} sendResponse - Response callback
 * @returns {Promise<void>}
 */
export async function handleFetchModels(message, sendResponse) {
  const { providerConfig } = message;

  try {
    const result = await fetchModels(providerConfig);
    sendResponse(result);
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

/**
 * Register models handlers on message listener
 * @param {chrome.runtime.onMessage} onMessage - Chrome message listener
 */
export function registerModelsHandlers(onMessage) {
  onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FETCH_MODELS') {
      handleFetchModels(message, sendResponse);
      return true;
    }
    return false;
  });
}
