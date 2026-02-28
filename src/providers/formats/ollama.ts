/**
 * Ollama Native Format Module
 *
 * Request formatting, stream parsing, and model fetching for Ollama native API.
 * Uses /api/chat endpoint with NDJSON streaming format.
 *
 * Supports Ollama-specific features:
 * - think: Enable reasoning/thinking mode
 * - num_ctx: Context window size
 * - keep_alive: Model memory management
 */

import type { MCPTool, Message } from '../../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import { cleanSchema } from '../utils/schema.ts';

// ==================== Request Formatting ====================

/**
 * Format request for Ollama native /api/chat endpoint
 *
 * Handles:
 * - Standard user/assistant/system messages
 * - Tool calls in assistant messages
 * - Tool result messages (using tool_name field)
 * - Ollama-specific options (num_ctx, keep_alive, think)
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages
 * @param tools - Available MCP tools
 * @param options - Chat options including Ollama-specific parameters
 * @returns Request configuration with URL and fetch options
 */
export function formatOllama(
  provider: { apiUrl: string; apiKey?: string; model?: string; defaultModel: string },
  messages: Message[],
  tools: MCPTool[],
  options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;

  // Transform messages to Ollama format
  const processedMessages = messages.map((msg) => {
    // Transform assistant messages with tool calls
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const result: Record<string, unknown> = {
        role: 'assistant',
        content: msg.content || '',
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments || '{}',
          },
        })),
      };
      // Include thinking/reasoning content for conversation history replay
      if (msg.reasoningContent) {
        result.thinking = msg.reasoningContent;
      }
      return result;
    }

    // Transform tool result messages
    // Ollama uses role='tool' with tool_name field (not tool_call_id)
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        tool_name: msg.name, // Ollama uses tool_name instead of tool_call_id
      };
    }

    // Assistant messages with thinking/reasoning content (no tool calls)
    if (msg.role === 'assistant' && msg.reasoningContent) {
      return {
        role: msg.role,
        content: msg.content || '',
        thinking: msg.reasoningContent,
      };
    }

    // Standard messages
    return {
      role: msg.role,
      content: msg.content,
    };
  });

  const body: Record<string, unknown> = {
    model,
    messages: processedMessages,
    stream: options.stream !== false,
  };

  // Build Ollama options object
  const ollamaOptions: Record<string, unknown> = {};
  const p = options.modelParameters;

  // Standard parameters
  if (p?.temperature !== undefined) ollamaOptions.temperature = p.temperature;
  if (p?.topP !== undefined) ollamaOptions.top_p = p.topP;
  if (p?.topK !== undefined) ollamaOptions.top_k = p.topK;
  if (p?.maxTokens !== undefined) ollamaOptions.num_predict = p.maxTokens;

  // Ollama-specific parameters from modelParameters
  if (p?.minP !== undefined) ollamaOptions.min_p = p.minP;
  if (p?.numCtx !== undefined) ollamaOptions.num_ctx = p.numCtx;

  // Legacy support: also check ChatOptions for backward compatibility
  if (options.num_ctx !== undefined && p?.numCtx === undefined) {
    ollamaOptions.num_ctx = options.num_ctx;
  }

  // Add options to body if any are set
  if (Object.keys(ollamaOptions).length > 0) {
    body.options = ollamaOptions;
  }

  // Ollama-specific: keep_alive (model memory management)
  // Prefer modelParameters.keepAlive, fallback to options.keep_alive
  const keepAliveValue = p?.keepAlive ?? options.keep_alive;
  if (keepAliveValue !== undefined) {
    body.keep_alive = keepAliveValue;
  }

  // Ollama-specific: thinking/reasoning mode
  if (options.enableReasoning) {
    body.think = true;
  }

  // Add tools if available (OpenAI-compatible format)
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

  // Build URL - ensure it ends with /api/chat
  let url = provider.apiUrl;
  if (!url.endsWith('/api/chat')) {
    url = url.replace(/\/+$/, '') + '/api/chat';
  }

  // Build headers - API key is optional for localhost
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add Authorization header if API key is provided (for remote Ollama)
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  return {
    url,
    options: {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
  };
}

// ==================== Stream Parsing ====================

/**
 * Parse Ollama streaming response (NDJSON format)
 *
 * Ollama streams responses as newline-delimited JSON (NDJSON).
 * Each line is a complete JSON object with the following structure:
 * {
 *   "model": "llama3.2",
 *   "created_at": "2024-01-01T00:00:00Z",
 *   "message": {
 *     "role": "assistant",
 *     "content": "...",
 *     "thinking": "reasoning content...",
 *     "tool_calls": [...]
 *   },
 *   "done": false
 * }
 *
 * Note: Ollama API versions may differ in where 'thinking' is located:
 * - Newer versions: json.message.thinking (inside message object)
 * - Older versions: json.thinking (top-level)
 * We check both locations for backward compatibility.
 *
 * @param response - Fetch response with streaming body
 * @param signal - Optional abort signal for cancellation
 * @yields StreamChunk objects for each parsed element
 */
export async function* parseOllamaStream(
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
        if (!trimmed) continue;

        try {
          const json = JSON.parse(trimmed);

          // Handle error responses
          if (json.error) {
            yield { type: 'error', content: json.error };
            return;
          }

          // Thinking/reasoning content (Ollama think feature)
          // Check both message.thinking (new format) and top-level thinking (old format)
          const thinkingContent = json.message?.thinking ?? json.thinking;
          if (thinkingContent) {
            yield { type: 'reasoning', content: thinkingContent };
          }

          // Text content from message
          if (json.message?.content) {
            yield { type: 'text', content: json.message.content };
          }

          // Tool calls (streaming)
          if (json.message?.tool_calls) {
            for (const tc of json.message.tool_calls) {
              yield {
                type: 'tool_call',
                id: tc.id,
                index: tc.index,
                name: tc.function?.name,
                arguments: tc.function?.arguments,
              };
            }
          }

          // Token usage (in final chunk when done: true)
          if (json.done && (json.eval_count !== undefined || json.prompt_eval_count !== undefined)) {
            const usage: TokenUsage = {
              promptTokenCount: json.prompt_eval_count ?? 0,
              candidatesTokenCount: json.eval_count ?? 0,
              totalTokenCount: (json.prompt_eval_count ?? 0) + (json.eval_count ?? 0),
            };
            yield { type: 'usage', usage };
          }

          // Ollama signals stream completion with done: true
          // Must exit the generator to stop streaming
          if (json.done) {
            return;
          }
        } catch {
          // Skip malformed JSON lines
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
 * Fetch available models from Ollama /api/tags endpoint
 *
 * Ollama uses a different endpoint and response format than OpenAI:
 * GET /api/tags returns:
 * {
 *   "models": [
 *     { "name": "llama3.2:latest", "modified_at": "...", "size": 4833... }
 *   ]
 * }
 *
 * @param apiUrl - Ollama API base URL
 * @param _apiKey - Optional API key (not used for localhost)
 * @returns Object with models array
 * @throws Error if API request fails
 */
export async function fetchOllamaModels(
  apiUrl: string,
  _apiKey?: string
): Promise<{ models: string[] }> {
  let baseUrl = apiUrl.replace(/\/+$/, '');

  // Remove /api/chat suffix if present
  if (baseUrl.endsWith('/api/chat')) {
    baseUrl = baseUrl.slice(0, -'/api/chat'.length);
  }

  const url = `${baseUrl}/api/tags`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // Extract model names and sort alphabetically
  const models = (data.models || [])
    .map((m: { name: string }) => m.name)
    .sort((a: string, b: string) => a.localeCompare(b));

  return { models };
}
