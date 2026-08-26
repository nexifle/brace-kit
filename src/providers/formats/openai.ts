/**
 * OpenAI Format Module
 *
 * Request formatting, stream parsing, and model fetching for OpenAI-compatible APIs.
 * Also used by xAI and DeepSeek providers.
 */

import type { MCPTool, Message, ModelSpec } from '../../types/index.ts';
import { extractToolResultMedia } from '../utils/toolResultMedia.ts';
import type { ChatOptions, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import { parseOpenAICompatModel } from '../modelSpecs.ts';
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
 * @param options - Chat options (thinking params, stream, model parameters, …)
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
  options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;
  const supportsReasoningContent = provider.supportsReasoningContent === true;
  const providerId = provider.id ?? '';
  const shouldEnableReasoning = !!options.enableReasoning;

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
      const media = extractToolResultMedia(msg);
      const content = media.images.length === 0
        ? media.text
        : [
            ...(media.text ? [{ type: 'text', text: media.text }] : []),
            ...media.images.map((image) => ({
              type: 'image_url',
              image_url: { url: image.dataUrl },
            })),
          ];
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content,
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
    stream: options.stream !== false,
  };

  // Apply optional generation parameters (only if set by user)
  const p = options.modelParameters;
  if (p?.temperature !== undefined) body.temperature = p.temperature;
  if (p?.maxTokens !== undefined) body.max_tokens = p.maxTokens;
  if (p?.topP !== undefined) body.top_p = p.topP;

  // Thinking / reasoning parameters.
  // OpenAI-compatible reasoning models take `reasoning_effort`. DeepSeek V4
  // also exposes a `thinking` toggle that defaults to ON server-side, so we
  // explicitly disable it when the user has reasoning turned off. When
  // omitThinkingParams is set (graceful-fallback retry) leave no thinking
  // footprint at all — DeepSeek's disabled toggle included.
  if (options.omitThinkingParams) {
    // no thinking params
  } else if (shouldEnableReasoning) {
    const effort =
      providerId === 'xai'
        ? xaiReasoningEffort(options.reasoningLevel)
        : providerId === 'deepseek'
          ? deepseekReasoningEffort(options.reasoningLevel)
          : openaiReasoningEffort(options.reasoningLevel);
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
  if (options.groqBuiltinTools && options.groqBuiltinTools.length > 0) {
    body.compound_custom = {
      tools: {
        enabled_tools: options.groqBuiltinTools,
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
              const id = tc.id;
              const index = tc.index;
              const name = tc.function?.name;
              const args = tc.function?.arguments;
              if (name) {
                // First delta for this tool call: start a fragment. Some
                // providers send the complete arguments in this same chunk.
                yield { type: 'tool_call_start', id, index, name };
                if (args) yield { type: 'tool_call_delta', id, index, content: args };
              } else if (args) {
                // Continuation delta: partial JSON fragment for an in-flight
                // call. Carry the index so the caller can route it to the
                // right call when parallel tool calls interleave — the old
                // single 'tool_call' emission dropped these entirely, so the
                // MCP server received empty {} arguments.
                yield { type: 'tool_call_delta', id, index, content: args };
              }
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
): Promise<{ models: string[]; specs?: ModelSpec[] }> {
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

  // Standard: {"data": [ … ]}. Some gateways wrap again (OpenRouter wrapped
  // mode returns {"data": {"data": [ … ]}, "success": true}). Handle both.
  const inner = data?.data;
  const list: { id: string }[] | undefined = Array.isArray(inner)
    ? (inner as { id: string }[])
    : inner && typeof inner === 'object' && Array.isArray((inner as { data?: unknown }).data)
      ? ((inner as { data: unknown }).data as { id: string }[])
      : undefined;

  // Filter and sort models
  const parsed = (list || [])
    .map((m) => parseOpenAICompatModel(m))
    .filter((s): s is ModelSpec => !!s && !EXCLUDED_MODEL_PATTERNS.some((p) => p.test(s.id)))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { models: parsed.map((s) => s.id), specs: parsed };
}
