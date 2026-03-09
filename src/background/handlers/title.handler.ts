/**
 * Title Handler - Handles TITLE_GENERATE message for generating conversation titles
 * @module background/handlers/title
 */

import {
  PROVIDER_PRESETS,
  formatRequest,
  type ProviderWithConfig,
} from '../../providers';
import type { Message, ProviderConfig } from '../../types';
import { getFriendlyErrorMessage } from '../utils/errors';

type SendResponse = (response?: unknown) => void;

interface TitleGenerateMessage {
  type: 'TITLE_GENERATE';
  messages: Message[];
  providerConfig: ProviderConfig;
}

interface TitleResponse {
  title?: string;
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
  };
}

interface AnthropicContent {
  text?: string;
}

/**
 * Handle title generate message
 * @param message - Title generate message
 * @param sendResponse - Response callback
 */
export async function handleTitleGenerate(
  message: TitleGenerateMessage,
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

    // Ollama doesn't require an API key (localhost)
    if (!provider.apiKey && provider.format !== 'ollama') {
      sendResponse({ error: 'No API key' });
      return;
    }

    // Separate system prompt from conversation messages
    const systemMsgs = messages.filter((m) => m.role === 'system');
    const conversationMsgs = messages.filter((m) => m.role !== 'system');

    // Serialize conversation into a single user message so the model responds
    // to a user turn (not continues a dangling assistant message)
    const conversationText = conversationMsgs
      .map((m) => {
        const roleLabel = m.role === 'user' ? 'User' : 'Assistant';
        const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return `${roleLabel}: ${content}`;
      })
      .join('\n\n');

    const titleMessages: Message[] = [
      ...systemMsgs,
      { role: 'user', content: conversationText },
    ];

    const { url: streamUrl, options } = formatRequest(provider, titleMessages, []);
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    // Non-streaming request
    let url = streamUrl;
    if (provider.format === 'openai') {
      body.stream = false;
    } else if (provider.format === 'anthropic') {
      body.stream = false;
    } else if (provider.format === 'gemini') {
      url = url.replace(':streamGenerateContent', ':generateContent').replace('alt=sse&', '');
    } else if (provider.format === 'ollama') {
      body.stream = false;
    }

    options.body = JSON.stringify(body);
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response);
      sendResponse({ error });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;

    let title = '';
    if (provider.format === 'openai') {
      const choices = data.choices as OpenAIChoice[] | undefined;
      title = choices?.[0]?.message?.content || '';
    } else if (provider.format === 'anthropic') {
      const content = data.content as AnthropicContent[] | undefined;
      title = content?.map((c) => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      const candidates = data.candidates as GeminiCandidate[] | undefined;
      title =
        candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'ollama') {
      const msg = data.message as { content?: string } | undefined;
      title = msg?.content || '';
    }

    // Strip any <think>...</think> blocks that some models embed in their response
    title = title.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    sendResponse({ title } as TitleResponse);
  } catch (e) {
    sendResponse({ error: (e as Error).message });
  }
}

/**
 * Register title handlers on message listener
 * @param onMessage - Chrome message listener
 */
export function registerTitleHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
      if (message.type === 'TITLE_GENERATE') {
        handleTitleGenerate(message as TitleGenerateMessage, sendResponse);
        return true;
      }
      return false;
    }
  );
}
