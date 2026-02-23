/**
 * Title Handler - Handles TITLE_GENERATE message for generating conversation titles
 * @module background/handlers/title
 */

import { PROVIDER_PRESETS, formatRequest } from '../../providers';
import { getFriendlyErrorMessage } from '../utils/errors.js';

/**
 * Handle title generate message
 * @param {Object} message - Title generate message
 * @param {Function} sendResponse - Response callback
 * @returns {Promise<void>}
 */
export async function handleTitleGenerate(message, sendResponse) {
  const { messages, providerConfig } = message;

  try {
    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider = {
      ...preset,
      ...providerConfig,
      format: providerConfig.format || preset.format,
      apiUrl: providerConfig.apiUrl || preset.apiUrl,
    };

    if (!provider.apiKey) {
      sendResponse({ error: 'No API key' });
      return;
    }

    const { url: streamUrl, options } = formatRequest(provider, messages, []);
    const body = JSON.parse(options.body);

    // Non-streaming request
    let url = streamUrl;
    if (provider.format === 'openai') {
      body.stream = false;
    } else if (provider.format === 'anthropic') {
      body.stream = false;
    } else if (provider.format === 'gemini') {
      url = url.replace(':streamGenerateContent', ':generateContent').replace('alt=sse&', '');
    }

    options.body = JSON.stringify(body);
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response);
      sendResponse({ error });
      return;
    }

    const data = await response.json();

    let title = '';
    if (provider.format === 'openai') {
      const msg = data.choices?.[0]?.message;
      title = (msg?.content || '') + (msg?.reasoning_content || '');
    } else if (provider.format === 'anthropic') {
      title = data.content?.map(c => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      title = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    }

    sendResponse({ title: title.trim() });
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

/**
 * Register title handlers on message listener
 * @param {chrome.runtime.onMessage} onMessage - Chrome message listener
 */
export function registerTitleHandlers(onMessage) {
  onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TITLE_GENERATE') {
      handleTitleGenerate(message, sendResponse);
      return true;
    }
    return false;
  });
}
