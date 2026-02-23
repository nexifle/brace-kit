/**
 * Memory Handler - Handles MEMORY_EXTRACT message for extracting memories from conversation
 * @module background/handlers/memory
 */

import {
  PROVIDER_PRESETS,
  formatRequest,
  type ProviderWithConfig,
} from '../../providers';
import type { Message, ProviderConfig } from '../../types';
import { getFriendlyErrorMessage } from '../utils/errors';

type SendResponse = (response?: unknown) => void;

interface MemoryExtractMessage {
  type: 'MEMORY_EXTRACT';
  messages: Message[];
  providerConfig: ProviderConfig;
}

interface MemoryResponse {
  memories?: unknown[];
  error?: string;
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
}

interface OpenAIChoice {
  message?: {
    content?: string;
    reasoning_content?: string;
  };
}

interface AnthropicContent {
  text?: string;
}

/**
 * Handle memory extract message
 * @param message - Memory extract message
 * @param sendResponse - Response callback
 */
export async function handleMemoryExtract(
  message: MemoryExtractMessage,
  sendResponse: SendResponse
): Promise<void> {
  const { messages, providerConfig } = message;

  try {
    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider: ProviderWithConfig = {
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
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

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

    const data = (await response.json()) as Record<string, unknown>;

    // Extract text content based on format
    let text = '';
    if (provider.format === 'openai') {
      const choices = data.choices as OpenAIChoice[] | undefined;
      const msg = choices?.[0]?.message;
      text = (msg?.content || '') + (msg?.reasoning_content || '');
    } else if (provider.format === 'anthropic') {
      const content = data.content as AnthropicContent[] | undefined;
      text = content?.map((c) => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      const candidates = data.candidates as GeminiCandidate[] | undefined;
      text =
        candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') ||
        '';
    }

    // Parse JSON from response
    try {
      // Try to extract JSON array from the text
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const memories = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      sendResponse({ memories } as MemoryResponse);
    } catch {
      sendResponse({ memories: [] } as MemoryResponse);
    }
  } catch (e) {
    sendResponse({ error: (e as Error).message });
  }
}

/**
 * Register memory handlers on message listener
 * @param onMessage - Chrome message listener
 */
export function registerMemoryHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
      if (message.type === 'MEMORY_EXTRACT') {
        handleMemoryExtract(message as MemoryExtractMessage, sendResponse);
        return true;
      }
      return false;
    }
  );
}
