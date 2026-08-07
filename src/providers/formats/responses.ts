/**
 * OpenAI Responses API Format Module
 *
 * Request formatting and stream parsing for the OpenAI Responses API
 * (POST /v1/responses, Responses SSE events). Used by the Grok (OAuth)
 * provider, whose chat backend speaks this protocol.
 */

import type { MCPTool, Message } from '../../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import { cleanSchema } from '../utils/schema.ts';
import { xaiReasoningEffort } from '../utils/reasoning.ts';

// The xAI CLI chat proxy version-gates requests: it rejects an unknown or
// outdated Grok CLI version with HTTP 426. These are the identity headers the
// Grok CLI sends so the proxy accepts the request.
const XAI_CHAT_PROXY_HOST = 'cli-chat-proxy.grok.com';
const XAI_CLI_VERSION = '0.2.120';

// ==================== Request Formatting ====================

/**
 * Format a request for the OpenAI Responses API.
 *
 * Handles:
 * - System messages → top-level `instructions` (removed from `input`)
 * - User/assistant messages → input items with typed content parts
 * - Assistant tool calls → `function_call` content parts
 * - Tool results → `function_call_output` items
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages
 * @param tools - Available MCP tools
 * @param options - Chat options (thinking params, stream, model parameters, …)
 * @returns Request configuration with URL and fetch options
 */
export function formatResponses(
  provider: {
    apiUrl: string;
    apiKey?: string;
    model?: string;
    defaultModel: string;
    /** Provider preset id (grok, …) */
    id?: string;
  },
  messages: Message[],
  tools: MCPTool[],
  options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;
  const shouldEnableReasoning = !!options.enableReasoning;

  // System messages become top-level instructions and are removed from input.
  const systemTexts = messages
    .filter((msg) => msg.role === 'system')
    .map((msg) => msg.content)
    .filter((text) => text.length > 0);

  // Transform messages to Responses API input items.
  const input: unknown[] = [];
  for (const msg of messages) {
    if (msg.role === 'error') continue; // internal error markers are not sent
    if (msg.role === 'system') continue; // handled via instructions above

    if (msg.role === 'user') {
      input.push({
        role: 'user',
        content: [{ type: 'input_text', text: msg.content }],
      });
    } else if (msg.role === 'assistant') {
      // Assistant messages carry only output_text content. Each tool call is
      // emitted as a separate top-level `function_call` input item — the shape
      // the chat proxy's untagged `ModelInput` enum accepts. Nesting a
      // `function_call` inside the message `content` array fails deserialization
      // with HTTP 422.
      input.push({
        role: 'assistant',
        content: [{ type: 'output_text', text: msg.content || '' }],
      });
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.name,
            arguments: tc.arguments || '{}',
          });
        }
      }
    } else if (msg.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: msg.toolCallId,
        output: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
    }
  }

  const body: Record<string, unknown> = {
    model,
    input,
    stream: options.stream !== false,
  };

  if (systemTexts.length > 0) {
    body.instructions = systemTexts.join('\n\n');
  }

  // Apply optional generation parameters (only if set by user).
  // Responses uses `max_output_tokens` — NOT `max_tokens`.
  const p = options.modelParameters;
  if (p?.temperature !== undefined) body.temperature = p.temperature;
  if (p?.maxTokens !== undefined) body.max_output_tokens = p.maxTokens;
  if (p?.topP !== undefined) body.top_p = p.topP;

  // Thinking / reasoning parameters. xAI Grok models accept
  // `reasoning: { effort: low|medium|high }`. When omitThinkingParams is set
  // (graceful-fallback retry) leave no thinking footprint at all.
  if (options.omitThinkingParams) {
    // no thinking params
  } else if (shouldEnableReasoning) {
    const effort = xaiReasoningEffort(options.reasoningLevel);
    if (effort) body.reasoning = { effort };
  }

  // Add tools if available
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: cleanSchema(t.inputSchema),
    }));
  }

  // Ensure URL ends with /responses
  let url = provider.apiUrl;
  if (!url.endsWith('/responses')) {
    url = url.replace(/\/+$/, '') + '/responses';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  };

  // Only the official xAI CLI chat proxy needs the Grok CLI identity headers;
  // other Responses-compatible endpoints get a plain Bearer request.
  if (url.includes(XAI_CHAT_PROXY_HOST)) {
    headers['X-XAI-Token-Auth'] = 'xai-grok-cli';
    headers['x-grok-client-version'] = XAI_CLI_VERSION;
    headers['User-Agent'] = `xai-grok-workspace/${XAI_CLI_VERSION}`;
    headers['x-grok-client-identifier'] = 'grok-shell';
    headers['x-authenticateresponse'] = 'authenticate-response';
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
 * Parse an OpenAI Responses API streaming response (SSE).
 *
 * Handles:
 * - `response.output_text.delta` → text deltas
 * - `response.output_item.added` (function_call) → tool call start
 * - `response.function_call_arguments.delta` → tool call argument deltas
 * - `response.reasoning_text.delta` / `response.reasoning_summary_text.delta` → reasoning
 * - `response.completed` → token usage
 * - Reasoning *items* (added/done) carry no streamed text — the deltas above do
 *
 * @param response - Fetch response with streaming body
 * @param signal - Optional abort signal for cancellation
 * @yields StreamChunk objects for each parsed element
 */
export async function* parseResponsesStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

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

        let json: Record<string, unknown>;
        try {
          json = JSON.parse(data) as Record<string, unknown>;
        } catch {
          continue; // skip malformed JSON
        }

        const type = json.type as string | undefined;
        if (!type) continue;

        if (type === 'response.output_text.delta') {
          // Per the Responses API schema, `delta` is a plain text string
          // ("The text delta that was added") — not an object. Normalize
          // both forms so the fragment is never dropped.
          const delta = json.delta;
          const text =
            typeof delta === 'string'
              ? delta
              : ((delta as { text?: string } | undefined)?.text ?? '');
          if (text) yield { type: 'text', content: text };
          continue;
        }

        if (
          type === 'response.reasoning_text.delta' ||
          type === 'response.reasoning_summary_text.delta'
        ) {
          // Grok streams its thinking as plaintext deltas when reasoning is
          // enabled. The proxy emits either `reasoning_text.delta` (full
          // reasoning content) or `reasoning_summary_text.delta` (a summary)
          // depending on the request/config — surface both like other
          // providers. `delta` is a plain string in both variants.
          const text = typeof json.delta === 'string' ? json.delta : '';
          if (text) yield { type: 'reasoning', content: text };
          continue;
        }

        if (type === 'response.output_item.added') {
          const item = json.item as Record<string, unknown> | undefined;
          const itemType = item?.type as string | undefined;
          if (item && itemType === 'function_call') {
            const id = item.id as string | undefined;
            const index = json.output_index as number | undefined;
            const name = item.name as string | undefined;
            yield { type: 'tool_call_start', id, index, name };
            const args = item.arguments as string | undefined;
            if (args) yield { type: 'tool_call_delta', id, index, content: args };
          }
          // Reasoning / summary items are skipped: xAI reasoning is encrypted
          // under the chat proxy — there is no plaintext to surface.
          continue;
        }

        if (type === 'response.function_call_arguments.delta') {
          const delta = json.delta as string | undefined;
          if (delta) {
            yield {
              type: 'tool_call_delta',
              id: json.item_id as string | undefined,
              index: json.output_index as number | undefined,
              content: delta,
            };
          }
          continue;
        }

        if (type === 'response.completed') {
          const response = json.response as Record<string, unknown> | undefined;
          const usage = response?.usage as Record<string, unknown> | undefined;
          if (usage) {
            const parsed: TokenUsage = {
              promptTokenCount: (usage.input_tokens as number) ?? 0,
              candidatesTokenCount: (usage.output_tokens as number) ?? 0,
              totalTokenCount: (usage.total_tokens as number) ?? 0,
            };
            yield { type: 'usage', usage: parsed };
          }
          continue;
        }

        if (type === 'error') {
          const err = json.error as Record<string, unknown> | undefined;
          yield { type: 'error', content: (err?.message as string) || 'Unknown Responses API error' };
          continue;
        }

        // Any other event type is skipped.
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

// ==================== Non-Streaming Extraction ====================

/**
 * Extract the assistant text from a non-streaming Responses API payload.
 *
 * Prefers the top-level `output_text` convenience field; otherwise joins the
 * `text` of every `output_text` content part in `output` message items.
 *
 * @param data - Parsed Responses API JSON payload
 * @returns Concatenated assistant text (possibly empty)
 */
export function extractResponsesText(data: Record<string, unknown>): string {
  const direct = data.output_text;
  if (typeof direct === 'string') return direct;

  const output = data.output;
  if (!Array.isArray(output)) return '';

  const texts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.type !== 'message') continue;
    const content = record.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== 'object') continue;
      const p = part as Record<string, unknown>;
      if (p.type === 'output_text' && typeof p.text === 'string') {
        texts.push(p.text);
      }
    }
  }
  return texts.join('');
}
