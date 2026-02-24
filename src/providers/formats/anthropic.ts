/**
 * Anthropic Format Module
 *
 * Request formatting and stream parsing for Anthropic Claude API.
 */

import type { MCPTool, Message } from '../../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import { supportsReasoning } from '../presets.ts';

// ==================== Request Formatting ====================

/**
 * Format request for Anthropic Claude API
 *
 * Handles:
 * - System prompts (extracted from system messages)
 * - Tool batching (consecutive tool results in single user message)
 * - Tool calls in assistant messages
 * - Image content (base64 and URL)
 * - Extended thinking/reasoning mode
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages
 * @param tools - Available MCP tools
 * @param _options - Chat options including enableReasoning
 * @returns Request configuration with URL and fetch options
 */
export function formatAnthropic(
  provider: { apiUrl: string; apiKey?: string; model?: string; defaultModel: string },
  messages: Message[],
  tools: MCPTool[],
  _options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;
  let system = '';
  const filtered: Record<string, unknown>[] = [];

  // Check if reasoning is enabled and model supports it
  const shouldEnableReasoning = !!_options.enableReasoning && supportsReasoning('anthropic', model);

  if (_options.enableReasoning !== undefined) {
    console.log(
      '[formatAnthropic] enableReasoning:',
      _options.enableReasoning,
      'model:',
      model,
      'shouldEnableReasoning:',
      shouldEnableReasoning
    );
  }

  // First pass: batch consecutive tool results together
  // Anthropic expects all tool results in a single user message
  const batchedMessages: (Message | { role: 'tool_batch'; tools: Message[] })[] = [];
  let toolBatch: Message[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolBatch.push(msg);
    } else {
      // Flush any pending tool batch
      if (toolBatch.length > 0) {
        batchedMessages.push({ role: 'tool_batch', tools: toolBatch });
        toolBatch = [];
      }
      batchedMessages.push(msg);
    }
  }

  // Flush remaining tool batch
  if (toolBatch.length > 0) {
    batchedMessages.push({ role: 'tool_batch', tools: toolBatch });
  }

  // Second pass: format messages for Anthropic API
  for (const msg of batchedMessages) {
    if ('role' in msg && msg.role === 'tool_batch') {
      // Batch all tool results into a single user message
      const toolResults = (msg as { tools: Message[] }).tools;
      const content: Record<string, unknown>[] = toolResults.map((t) => ({
        type: 'tool_result',
        tool_use_id: t.toolCallId,
        content: typeof t.content === 'string' ? t.content : JSON.stringify(t.content),
        is_error: t.content?.startsWith('Error:') || t.content?.includes('[DUPLICATE_CALL_SKIPPED]'),
      }));
      filtered.push({ role: 'user', content });
    } else if ((msg as Message).role === 'system') {
      // Accumulate system messages
      system += (system ? '\n' : '') + (msg as Message).content;
    } else if ((msg as Message).role === 'assistant' && (msg as Message).toolCalls && (msg as Message).toolCalls!.length > 0) {
      // Transform assistant messages with tool calls to Anthropic format
      const content: Record<string, unknown>[] = [];
      if ((msg as Message).content) {
        content.push({ type: 'text', text: (msg as Message).content });
      }
      for (const tc of (msg as Message).toolCalls!) {
        let input = {};
        try {
          input = JSON.parse(tc.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input,
        });
      }
      filtered.push({ role: 'assistant', content });
    } else if ((msg as Message).role && Array.isArray((msg as Message).content)) {
      // Handle multimodal content (images)
      const m = msg as Message;
      const anthropicContent: Record<string, unknown>[] = [];
      const contentArray = m.content as unknown as Array<{ type: string; text?: string; image_url?: { url: string } }>;

      for (const part of contentArray) {
        if (part.type === 'text' && part.text) {
          anthropicContent.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            // Base64 data URL: data:image/jpeg;base64,....
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              anthropicContent.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: match[1],
                  data: match[2],
                },
              });
            }
          } else {
            // Regular URL
            anthropicContent.push({
              type: 'image',
              source: {
                type: 'url',
                url,
              },
            });
          }
        }
      }
      filtered.push({ role: m.role, content: anthropicContent });
    } else if ((msg as Message).role) {
      // Regular message (user or assistant without tool calls)
      const m = msg as Message;
      filtered.push({ role: m.role, content: m.content });
    }
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: _options.stream !== false,
    messages: filtered,
  };

  // Add thinking parameter for Anthropic models when reasoning is enabled
  if (shouldEnableReasoning) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: 4096, // Minimum recommended for meaningful thinking
    };
  }

  if (system) body.system = system;

  // Add tools if available
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  // Ensure URL ends with /v1/messages
  let url = provider.apiUrl;
  if (!url.endsWith('/v1/messages') && !url.endsWith('/messages')) {
    url = url.replace(/\/+$/, '') + '/v1/messages';
  }

  return {
    url,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    },
  };
}

// ==================== Stream Parsing ====================

/**
 * Parse Anthropic streaming response
 *
 * Handles:
 * - Text content deltas
 * - Thinking/reasoning content
 * - Tool call start and deltas
 * - Abort signal for cancellation
 *
 * @param response - Fetch response with streaming body
 * @param signal - Optional abort signal for cancellation
 * @yields StreamChunk objects for each parsed element
 */
export async function* parseAnthropicStream(
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
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const json = JSON.parse(data);

          // Content block delta
          if (json.type === 'content_block_delta') {
            // Text content
            if (json.delta?.type === 'text_delta') {
              yield { type: 'text', content: json.delta.text };
            }
            // Thinking/reasoning content
            if (json.delta?.type === 'thinking_delta') {
              yield { type: 'reasoning', content: json.delta.thinking };
            }
            // Tool call JSON delta
            if (json.delta?.type === 'input_json_delta') {
              yield { type: 'tool_call_delta', content: json.delta.partial_json };
            }
          }

          // Content block start (tool use)
          if (json.type === 'content_block_start') {
            if (json.content_block?.type === 'tool_use') {
              yield {
                type: 'tool_call_start',
                id: json.content_block.id,
                name: json.content_block.name,
              };
            }
            // Note: thinking blocks start with type: "thinking" but content comes in deltas
          }

          // Message delta - contains usage information
          if (json.type === 'message_delta' && json.usage) {
            const usage: TokenUsage = {
              promptTokenCount: json.usage.input_tokens ?? 0,
              candidatesTokenCount: json.usage.output_tokens ?? 0,
              totalTokenCount: (json.usage.input_tokens ?? 0) + (json.usage.output_tokens ?? 0),
            };

            // Add cached tokens if available (Anthropic prompt caching)
            if (json.usage.cache_read_input_tokens !== undefined) {
              usage.cachedContentTokenCount = json.usage.cache_read_input_tokens;
            }

            yield { type: 'usage', usage };
          }

          // Message complete
          if (json.type === 'message_stop') return;
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
