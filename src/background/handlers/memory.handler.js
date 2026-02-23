/**
 * Memory Handler - Handles MEMORY_EXTRACT message for extracting memories from conversation
 * @module background/handlers/memory
 */

import { PROVIDER_PRESETS, formatRequest } from '../../providers';
import { getFriendlyErrorMessage } from '../utils/errors.js';

/**
 * Handle memory extract message
 * @param {Object} message - Memory extract message
 * @param {Function} sendResponse - Response callback
 * @returns {Promise<void>}
 */
export async function handleMemoryExtract(message, sendResponse) {
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

    // Build non-streaming request using formatRequest, then override stream: false
    const { url: streamUrl, options } = formatRequest(provider, messages, []);
    const body = JSON.parse(options.body);

    // Override to non-streaming
    let url = streamUrl;
    if (provider.format === 'openai') {
      body.stream = false;
    } else if (provider.format === 'anthropic') {
      body.stream = false;
    } else if (provider.format === 'gemini') {
      // Switch from streamGenerateContent to generateContent
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

    // Extract text content based on format
    let text = '';
    if (provider.format === 'openai') {
      const msg = data.choices?.[0]?.message;
      text = (msg?.content || '') + (msg?.reasoning_content || '');
    } else if (provider.format === 'anthropic') {
      text = data.content?.map(c => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    }

    // Parse JSON from response
    try {
      // Try to extract JSON array from the text
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const memories = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      sendResponse({ memories });
    } catch (e) {
      sendResponse({ memories: [] });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

/**
 * Register memory handlers on message listener
 * @param {chrome.runtime.onMessage} onMessage - Chrome message listener
 */
export function registerMemoryHandlers(onMessage) {
  onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'MEMORY_EXTRACT') {
      handleMemoryExtract(message, sendResponse);
      return true;
    }
    return false;
  });
}
