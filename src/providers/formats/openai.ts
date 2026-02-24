/**
 * OpenAI Format Module
 *
 * Request formatting, stream parsing, and model fetching for OpenAI-compatible APIs.
 * Also used by xAI and DeepSeek providers.
 */

import type { MCPTool, Message } from '../../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import { cleanSchema } from '../utils/schema.ts';

// ==================== Request Formatting ====================

/**
 * Format request for OpenAI-compatible APIs
 *
 * Handles:
 * - Standard user/assistant/system messages
 * - Tool calls in assistant messages
 * - Tool result messages
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages
 * @param tools - Available MCP tools
 * @param _options - Chat options (unused for OpenAI)
 * @returns Request configuration with URL and fetch options
 */
export function formatOpenAI(
  provider: { apiUrl: string; apiKey?: string; model?: string; defaultModel: string },
  messages: Message[],
  tools: MCPTool[],
  _options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;

  // Transform messages to OpenAI format
  const processedMessages = messages.map((msg) => {
    // Transform assistant messages with tool calls to OpenAI format
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments || '{}',
          },
        })),
      };
    }

    // Transform tool result messages to OpenAI format
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
    }

    return msg;
  });

  const body: Record<string, unknown> = {
    model,
    messages: processedMessages,
    stream: _options.stream !== false,
  };

  // Add tools if available
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: cleanSchema(t.inputSchema),
      },
    }));
  }

  // Ensure URL ends with /chat/completions
  let url = provider.apiUrl;
  if (!url.endsWith('/chat/completions')) {
    url = url.replace(/\/+$/, '') + '/chat/completions';
  }

  return {
    url,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  };
}

// ==================== Stream Parsing ====================

/**
 * Parse OpenAI streaming response
 *
 * Handles:
 * - Text content deltas
 * - Tool call deltas (streaming)
 * - Abort signal for cancellation
 *
 * @param response - Fetch response with streaming body
 * @param signal - Optional abort signal for cancellation
 * @yields StreamChunk objects for each parsed element
 */
export async function* parseOpenAIStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      // Check for abort before each read
      if (signal?.aborted) {
        try {
          reader.cancel();
        } catch {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;

          // Token usage metadata - OpenAI returns this in chunks with usage field
          // Some providers (GLM/Zhipu) include usage in final chunks
          // OpenAI native may include it with stream_options: { include_usage: true }
          if (json.usage) {
            const usage: TokenUsage = {
              promptTokenCount: json.usage.prompt_tokens ?? 0,
              candidatesTokenCount: json.usage.completion_tokens ?? 0,
              totalTokenCount: json.usage.total_tokens ?? 0,
            };

            // Add cached tokens if available (some providers like GLM support this)
            if (json.usage.prompt_tokens_details?.cached_tokens !== undefined) {
              usage.cachedContentTokenCount = json.usage.prompt_tokens_details.cached_tokens;
            }

            yield { type: 'usage', usage };
          }

          if (!delta) continue;

          // Text content
          if (delta.content) {
            yield { type: 'text', content: delta.content };
          }

          // Reasoning content (o1, o3, o4 models)
          if (delta.reasoning_content) {
            yield { type: 'reasoning', content: delta.reasoning_content };
          }

          // Tool calls (streaming)
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              yield {
                type: 'tool_call',
                id: tc.id,
                index: tc.index,
                name: tc.function?.name,
                arguments: tc.function?.arguments,
              };
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

// ==================== Model Fetching ====================

/**
 * Patterns to exclude from model list (non-chat models)
 */
const EXCLUDED_MODEL_PATTERNS = [
  /embedding/i,
  /tts/i,
  /whisper/i,
  /dall-e/i,
  /dall/i,
  /moderation/i,
  /audio/i,
  /realtime/i,
];

/**
 * Fetch available models from OpenAI-compatible API
 *
 * Filters out non-chat models (embeddings, TTS, image generation, etc.)
 *
 * @param apiUrl - API base URL
 * @param apiKey - API key for authentication
 * @returns Object with models array
 * @throws Error if API request fails
 */
export async function fetchOpenAIModels(
  apiUrl: string,
  apiKey: string
): Promise<{ models: string[] }> {
  let baseUrl = apiUrl.replace(/\/+$/, '');

  // Remove /chat/completions suffix if present
  if (baseUrl.endsWith('/chat/completions')) {
    baseUrl = baseUrl.slice(0, -'/chat/completions'.length);
  }

  const url = `${baseUrl}/models`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // Filter and sort models
  const models = (data.data || [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => !EXCLUDED_MODEL_PATTERNS.some((p) => p.test(id)))
    .sort((a: string, b: string) => a.localeCompare(b));

  return { models };
}
