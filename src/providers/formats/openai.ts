/**
 * OpenAI Format Module
 *
 * Request formatting, stream parsing, and model fetching for OpenAI-compatible APIs.
 * Also used by xAI and DeepSeek providers.
 */

import type { MCPTool, Message } from '../../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import { cleanSchema } from '../utils/schema.ts';
import { createThinkTagParser } from '../utils/thinkTagParser.ts';
import {
  deepseekReasoningEffort,
  openaiReasoningEffort,
  xaiReasoningEffort,
} from '../utils/reasoning.ts';

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
  provider: {
    apiUrl: string;
    apiKey?: string;
    model?: string;
    defaultModel: string;
    supportsReasoningContent?: boolean;
    /** Provider preset id (openai, xai, deepseek, groq, custom, …) */
    id?: string;
  },
  messages: Message[],
  tools: MCPTool[],
  _options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;
  const supportsReasoningContent = provider.supportsReasoningContent === true;
  const providerId = provider.id ?? '';
  const shouldEnableReasoning = !!_options.enableReasoning;

  // Transform messages to OpenAI format
  const processedMessages = messages.map((msg) => {
    // Transform assistant messages with tool calls to OpenAI format
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const result: Record<string, unknown> = {
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
      // Only include reasoning_content for providers that explicitly support it (e.g. DeepSeek).
      // Groq and most other OpenAI-compatible endpoints reject this field with a 400 error.
      if (msg.reasoningContent && supportsReasoningContent) {
        result.reasoning_content = msg.reasoningContent;
      }
      return result;
    }

    // Transform tool result messages to OpenAI format
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
    }

    // For all assistant messages, return a clean object — strip internal fields like
    // reasoningContent, toolCalls, toolCallId which are not valid OpenAI API fields.
    // Only add reasoning_content for providers that explicitly support it (e.g. DeepSeek).
    if (msg.role === 'assistant') {
      const result: Record<string, unknown> = {
        role: 'assistant',
        content: msg.content,
      };
      if (msg.reasoningContent && supportsReasoningContent) {
        result.reasoning_content = msg.reasoningContent;
      }
      return result;
    }

    return msg;
  });

  const body: Record<string, unknown> = {
    model,
    messages: processedMessages,
    stream: _options.stream !== false,
  };

  // Apply optional generation parameters (only if set by user)
  const p = _options.modelParameters;
  if (p?.temperature !== undefined) body.temperature = p.temperature;
  if (p?.maxTokens !== undefined) body.max_tokens = p.maxTokens;
  if (p?.topP !== undefined) body.top_p = p.topP;

  // Thinking / reasoning parameters.
  // OpenAI-compatible reasoning models take `reasoning_effort`. DeepSeek V4
  // also exposes a `thinking` toggle that defaults to ON server-side, so we
  // explicitly disable it when the user has reasoning turned off.
  if (shouldEnableReasoning) {
    const effort =
      providerId === 'xai'
        ? xaiReasoningEffort(_options.reasoningLevel)
        : providerId === 'deepseek'
          ? deepseekReasoningEffort(_options.reasoningLevel)
          : openaiReasoningEffort(_options.reasoningLevel);
    if (effort) body.reasoning_effort = effort;
    if (providerId === 'deepseek') {
      body.thinking = { type: 'enabled' };
    }
  } else if (providerId === 'deepseek') {
    // DeepSeek V4 thinks by default — honor the composer toggle.
    body.thinking = { type: 'disabled' };
  }

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

  // Groq built-in tools via compound_custom
  if (_options.groqBuiltinTools && _options.groqBuiltinTools.length > 0) {
    body.compound_custom = {
      tools: {
        enabled_tools: _options.groqBuiltinTools,
      },
    };
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
 * - Three reasoning formats:
 *     1. delta.reasoning_content  (DeepSeek, OpenAI o1/o3)
 *     2. delta.reasoning          (Groq and some OpenAI-compatible endpoints)
 *     3. <think>...</think> tags  (Qwen3 and models that embed thinking in content)
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
  const thinkParser = createThinkTagParser();

  try {
    while (true) {
      if (signal?.aborted) {
        try { reader.cancel(); } catch {}
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

          if (json.usage) {
            const usage: TokenUsage = {
              promptTokenCount: json.usage.prompt_tokens ?? 0,
              candidatesTokenCount: json.usage.completion_tokens ?? 0,
              totalTokenCount: json.usage.total_tokens ?? 0,
            };
            if (json.usage.prompt_tokens_details?.cached_tokens !== undefined) {
              usage.cachedContentTokenCount = json.usage.prompt_tokens_details.cached_tokens;
            }
            yield { type: 'usage', usage };
          }

          if (!delta) continue;

          // Dedicated reasoning fields take priority (no need to parse tags)
          // - delta.reasoning_content: DeepSeek, OpenAI o1/o3
          // - delta.reasoning: Groq gpt-oss and similar endpoints
          if (delta.reasoning_content) {
            yield { type: 'reasoning', content: delta.reasoning_content };
          } else if (delta.reasoning) {
            yield { type: 'reasoning', content: delta.reasoning };
          }

          // Text content — parsed through think-tag state machine
          if (delta.content) {
            yield* thinkParser.process(delta.content);
          }

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

    // Flush any content held back for partial tag detection
    const trailing = thinkParser.flush();
    if (trailing) yield trailing;
  } finally {
    try { reader.releaseLock(); } catch {}
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
