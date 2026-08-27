/**
 * Chat Service - Handles chat request processing
 * @module background/services/chat
 */

import {
  PROVIDER_PRESETS,
  formatRequest,
  type ProviderWithConfig,
  type ChatOptions,
  type TokenUsage,
} from '../../providers';
import { createThinkTagParser } from '../../providers/utils/thinkTagParser.ts';
import type { Message, MCPTool, ProviderConfig, ToolCall, StreamingBufferEntry } from '../../types';
import { isOllamaLocalhost } from '../../utils/providerUtils.ts';
import { getGrokAccessToken } from '../../utils/grokOAuth.ts';
import { getFriendlyErrorMessage, isThinkingParamError } from '../utils/errors';
import { extractHostedWebSearchItems } from '../../providers';
import {
  createStreamingService,
  type StreamingService,
  type ToolCallFragment,
} from './streaming.service';

interface ActiveRequest {
  abortController: AbortController;
  aborted: boolean;
}

export interface ChatRequestMessage {
  messages: Message[];
  providerConfig: ProviderConfig;
  tools?: MCPTool[];
  options?: ChatOptions;
  requestId?: string;
  conversationId?: string;
}

interface StreamingResponseMessage extends ChatRequestMessage {
  requestId: string;
}

interface StreamDoneMessage {
  type: 'CHAT_STREAM_DONE';
  fullContent: string;
  reasoningContent?: string;
  reasoningSignature?: string;
  toolCalls?: ToolCall[];
  groundingMetadata?: unknown;
  images?: Array<{ mimeType: string; data: string }>;
  backendItems?: Record<string, unknown>[];
  usage?: TokenUsage;
  requestId?: string;
  conversationId?: string;
}

interface StreamChunkMessage {
  type: 'CHAT_STREAM_CHUNK';
  content: string;
  chunkType?: string;
  id?: string;
  arguments?: string;
  requestId?: string;
  conversationId?: string;
}

interface StreamErrorMessage {
  type: 'CHAT_STREAM_ERROR';
  error: string;
  requestId?: string;
  conversationId?: string;
}

export interface ChatServiceResponse {
  error?: string;
  started?: boolean;
  content?: string;
  reasoning_content?: string;
  reasoning_signature?: string;
  toolCalls?: ToolCall[];
  backendItems?: Record<string, unknown>[];
  usage?: TokenUsage;
}

function parseUsageFromBody(data: Record<string, unknown>): TokenUsage | undefined {
  const usage = (data.usage || data.usageMetadata) as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== 'object') return undefined;
  const promptTokenCount = Number(
    usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? 0,
  );
  const candidatesTokenCount = Number(
    usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? 0,
  );
  const totalTokenCount = Number(
    usage.total_tokens ?? usage.totalTokenCount ?? promptTokenCount + candidatesTokenCount,
  );
  if (!totalTokenCount && !promptTokenCount && !candidatesTokenCount) return undefined;
  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: totalTokenCount || promptTokenCount + candidatesTokenCount,
  };
}

export interface ChatService {
  executeRequest: (
    message: ChatRequestMessage,
    sendResponse: (response: ChatServiceResponse) => void
  ) => Promise<void>;
  handleStreamingResponse: (
    response: Response,
    provider: ProviderWithConfig,
    message: StreamingResponseMessage,
    activeRequest: ActiveRequest,
    sendResponse: (response: { started?: boolean }) => void
  ) => Promise<void>;
  abortRequest: (requestId: string) => boolean;
  getActiveRequestCount: () => number;
}

// Track active streaming requests for cancellation
const activeRequests = new Map<string, ActiveRequest>();

// ===================== Streaming Buffer =====================
// In-memory buffer in the background worker. Each stream is buffered so the sidebar
// can recover when closed and reopened mid-stream or after streaming completes.

const BUFFER_COMPLETED_TTL_MS = 30_000; // purge 30s after completed/error
const MAX_BUFFER_ENTRIES = 20;

const streamingBuffers = new Map<string, StreamingBufferEntry>();

function createBufferEntry(requestId: string, conversationId: string): StreamingBufferEntry {
  if (streamingBuffers.size >= MAX_BUFFER_ENTRIES) {
    const oldestKey = streamingBuffers.keys().next().value;
    if (oldestKey !== undefined) streamingBuffers.delete(oldestKey);
  }
  const entry: StreamingBufferEntry = {
    requestId,
    conversationId,
    status: 'in_progress',
    chunks: [],
    reasoningChunks: [],
    startedAt: Date.now(),
  };
  streamingBuffers.set(conversationId, entry);
  return entry;
}

function scheduleBufferCleanup(conversationId: string): void {
  setTimeout(() => streamingBuffers.delete(conversationId), BUFFER_COMPLETED_TTL_MS);
}

function clearBufferEntry(conversationId: string): void {
  streamingBuffers.delete(conversationId);
}

export function getActiveStreamingBuffers(): Record<string, StreamingBufferEntry> {
  const result: Record<string, StreamingBufferEntry> = {};
  for (const [convId, entry] of streamingBuffers.entries()) {
    result[convId] = { ...entry, chunks: [...entry.chunks], reasoningChunks: [...entry.reasoningChunks] };
  }
  return result;
}

/**
 * Remove a buffer entry once the sidebar has consumed it (stream done/error
 * handled and persisted). Matching by requestId prevents clearing a newer
 * in-progress buffer created for the same conversation (e.g. tool-call
 * follow-ups), which would break recovery for that newer stream.
 */
export function clearStreamingBuffer(requestId?: string, conversationId?: string): void {
  for (const [convId, entry] of streamingBuffers.entries()) {
    if (requestId !== undefined && entry.requestId !== requestId) continue;
    if (conversationId !== undefined && convId !== conversationId) continue;
    streamingBuffers.delete(convId);
  }
}

/**
 * Create a chat service instance
 * @returns Chat service with request execution methods
 */
export function createChatService(): ChatService {
  const streamingService: StreamingService = createStreamingService();

  return {
    /**
     * Execute a chat request
     * @param message - Chat request message
     * @param sendResponse - Response callback
     */
    async executeRequest(
      message: ChatRequestMessage,
      sendResponse: (response: ChatServiceResponse) => void
    ): Promise<void> {
      const { messages, providerConfig, tools, options, requestId } = message;

      // Create AbortController
      const abortController = new AbortController();
      const activeRequest: ActiveRequest = { abortController, aborted: false };
      if (requestId) {
        activeRequests.set(requestId, activeRequest);
      }

      try {
        // Merge provider preset with user config
        const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
        const provider: ProviderWithConfig = {
          ...preset,
          ...providerConfig,
          format: providerConfig.format || preset.format,
          apiUrl: providerConfig.apiUrl || preset.apiUrl,
        };

        // Grok (OAuth) authenticates with a device-flow access token rather
        // than a static API key — resolve (and refresh) it here.
        if (provider.id === 'grok') {
          try {
            provider.apiKey = await getGrokAccessToken();
          } catch (e) {
            sendResponse({
              error:
                (e as Error).message === 'Grok OAuth: not connected'
                  ? 'Grok sign-in required. Open Settings → AI Provider → Grok to connect.'
                  : 'Grok session expired — reconnect from Settings → AI Provider → Grok.',
            });
            return;
          }
        }

        if (!provider.apiKey) {
          // Skip API key validation for Ollama localhost
          if (!isOllamaLocalhost(provider.format, provider.apiUrl)) {
            sendResponse({ error: 'API key is required. Configure it in Settings.' });
            return;
          }
        }

        // Format and send request
        const buildFetchOptions = (opts: ChatOptions) => {
          const { url: u, options: o } = formatRequest(provider, messages, tools || [], opts);
          o.signal = abortController.signal;
          return { url: u, options: o };
        };

        let { url, options: fetchOptions } = buildFetchOptions(options || {});
        let response = await fetch(url, fetchOptions);

        // Graceful fallback: some OpenAI/Anthropic/Gemini-compatible endpoints
        // reject thinking params (reasoning_effort, adaptive thinking,
        // thinkingLevel/budget…). Retry once without them instead of failing.
        // Reasoning display filtering still uses the ORIGINAL options, so the
        // model's reasoning chunks (if any) keep showing.
        if (!response.ok) {
          let probeBody = '';
          try {
            probeBody = await response.clone().text();
          } catch {
            probeBody = '';
          }
          if (isThinkingParamError(response.status, probeBody)) {
            const fallbackOptions: ChatOptions = {
              ...(options || {}),
              enableReasoning: false,
              reasoningLevel: undefined,
              // A clean retry: no thinking params at all, including provider
              // defaults like DeepSeek's `thinking: {type:'disabled'}`.
              omitThinkingParams: true,
            };
            const fb = buildFetchOptions(fallbackOptions);
            const retry = await fetch(fb.url, fb.options);
            if (retry.ok) {
              response = retry;
              console.info('[chat.service] Provider rejected thinking params — retried request without them.');
            }
          }
        }

        if (!response.ok) {
          const error = await getFriendlyErrorMessage(response);
          sendResponse({ error });
          return;
        }

        // Handle non-streaming
        if (options?.stream === false) {
          const raw = (await response.json()) as Record<string, unknown>;
          // Some OpenAI-compatible gateways (OpenRouter wrapped mode) return
          // {"data": {…}, "success": true} — unwrap before parsing.
          const data =
            raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
              ? (raw.data as Record<string, unknown>)
              : raw;
          const result = streamingService.buildNonStreamingResponse(data, provider);

          // Convert tool_calls to ToolCall format if present
          const toolCalls = result.tool_calls?.map((tc) => ({
            id: tc.id || `tc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: tc.name || 'unknown',
            arguments: tc.arguments || '{}',
            ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
          }));

          const thinkParser = createThinkTagParser();

          // Split embedded think tags: keep reasoning instead of dropping it
          // (the stream path surfaces it as reasoning chunks). Guard against a
          // non-string content (some gateways echo multimodal content as arrays).
          let content = typeof result.content === 'string' ? result.content : '';
          let reasoning = typeof result.reasoning_content === 'string' ? result.reasoning_content : '';
          if (content) {
            const parsed = thinkParser.nonStreamingParse(content);
            content = parsed.content;
            if (parsed.reasoning) {
              reasoning = [reasoning, parsed.reasoning].filter(Boolean).join('\n');
            }
          }
          // Match the stream path: drop reasoning when the user disabled it.
          if (message.options?.enableReasoning === false) {
            reasoning = '';
          }

          const backendItems = extractHostedWebSearchItems(data);
          sendResponse({
            content,
            reasoning_content: reasoning || undefined,
            reasoning_signature: result.reasoning_signature,
            toolCalls: toolCalls?.length ? toolCalls : undefined,
            backendItems: backendItems.length > 0 ? backendItems : undefined,
            usage: parseUsageFromBody(data),
          });
          return;
        }

        // Handle streaming
        await this.handleStreamingResponse(
          response,
          provider,
          message as StreamingResponseMessage,
          activeRequest,
          sendResponse as (response: { started?: boolean; error?: string }) => void
        );
      } catch (e) {
        const error = e as Error;
        // handleStreamingResponse handles its own mid-stream errors internally.
        // This catch handles errors before streaming begins (network, fetch errors, etc.)
        if (error.name === 'AbortError' || activeRequest.aborted) {
          sendResponse({ error: 'Request cancelled' });
        } else {
          sendResponse({ error: error.message });
        }
      } finally {
        if (requestId) activeRequests.delete(requestId);
      }
    },

    /**
     * Handle streaming response
     * @param response - Fetch response object
     * @param provider - Provider configuration
     * @param message - Original request message
     * @param activeRequest - Active request tracking object
     * @param sendResponse - Response callback
     */
    async handleStreamingResponse(
      response: Response,
      provider: ProviderWithConfig,
      message: StreamingResponseMessage,
      activeRequest: ActiveRequest,
      sendResponse: (response: { started?: boolean; error?: string }) => void
    ): Promise<void> {
      const chunks: string[] = [];
      const reasoningChunks: string[] = [];
      const reasoningSignatureChunks: string[] = [];
      const toolCalls: ToolCallFragment[] = [];
      const backendItemsById = new Map<string, Record<string, unknown>>();
      const images: Array<{ mimeType: string; data: string }> = [];
      let currentToolCall: ToolCallFragment | undefined = undefined;
      let groundingMetadata: unknown = null;
      let tokenUsage: TokenUsage | undefined;
      // Track whether any content chunks have been sent to the frontend.
      // If true, mid-stream errors are routed via CHAT_STREAM_ERROR only
      // (not sendResponse) to avoid double error messages.
      let streamingStarted = false;

      // Create buffer entry agar sidebar bisa recover jika ditutup saat streaming
      const bufferEntry = (message.requestId && message.conversationId)
        ? createBufferEntry(message.requestId, message.conversationId)
        : null;

      try {
        for await (const chunk of streamingService.processStream(
          response,
          provider,
          activeRequest.abortController.signal
        )) {
          // Check if request was aborted
          if (activeRequest.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          if (chunk.type === 'text') {
            chunks.push(chunk.content || '');
            if (bufferEntry) bufferEntry.chunks.push(chunk.content || '');
            streamingStarted = true;
            chrome.runtime.sendMessage({
              type: 'CHAT_STREAM_CHUNK',
              content: chunk.content,
              requestId: message.requestId,
              conversationId: message.conversationId,
            } as StreamChunkMessage);
          } else if (chunk.type === 'reasoning') {
            // Only forward reasoning chunks when the user has enabled reasoning mode.
            // OpenAI-compatible providers (e.g. Groq) always stream delta.reasoning
            // regardless of any request parameter, so we must filter here.
            if (message.options?.enableReasoning !== false) {
              reasoningChunks.push(chunk.content || '');
              if (bufferEntry) bufferEntry.reasoningChunks.push(chunk.content || '');
              streamingStarted = true;
              chrome.runtime.sendMessage({
                type: 'CHAT_STREAM_CHUNK',
                chunkType: 'reasoning',
                content: chunk.content,
                requestId: message.requestId,
                conversationId: message.conversationId,
              } as StreamChunkMessage);
            }
          } else if (chunk.type === 'reasoning_signature') {
            reasoningSignatureChunks.push(chunk.content || '');
          } else if (chunk.type === 'image') {
            images.push({ mimeType: chunk.mimeType || 'image/png', data: chunk.imageData || '' });
          } else if (chunk.type === 'error') {
            const errorContent = `\n\n⚠️ ${chunk.content}`;
            chunks.push(errorContent);
            if (bufferEntry) bufferEntry.chunks.push(errorContent);
            streamingStarted = true;
            chrome.runtime.sendMessage({
              type: 'CHAT_STREAM_CHUNK',
              content: errorContent,
              requestId: message.requestId,
              conversationId: message.conversationId,
            } as StreamChunkMessage);
          } else if (chunk.type === 'tool_call' || chunk.type === 'tool_call_start') {
            if (chunk.type === 'tool_call_start') {
              currentToolCall = {
                id: chunk.id,
                index: chunk.index,
                name: chunk.name,
                arguments: '',
              };
              toolCalls.push(currentToolCall);
            } else if (chunk.name) {
              currentToolCall = {
                id: chunk.id || `tc_${Date.now()}`,
                index: chunk.index,
                name: chunk.name,
                arguments: chunk.arguments || '',
                ...(chunk.thoughtSignature ? { thoughtSignature: chunk.thoughtSignature } : {}),
              };
              toolCalls.push(currentToolCall);
            }
          } else if (chunk.type === 'tool_call_delta') {
            // Route argument fragments to the right in-flight call. OpenAI-
            // compatible streams interleave deltas for parallel tool calls, so
            // match by id first, then by index (continuation deltas only carry
            // an index); fall back to the last-started call.
            let dest = chunk.id ? toolCalls.find((t) => t.id === chunk.id) : undefined;
            if (!dest && chunk.index !== undefined) {
              dest = [...toolCalls].reverse().find((t) => t.index === chunk.index);
            }
            if (!dest) dest = currentToolCall;
            if (dest) dest.arguments += chunk.content || '';
          } else if (chunk.type === 'hosted_web_search') {
            if (chunk.arguments) {
              try {
                const item = JSON.parse(chunk.arguments) as Record<string, unknown>;
                const key =
                  (typeof item.id === 'string' && item.id) ||
                  chunk.id ||
                  `ws_${backendItemsById.size}`;
                backendItemsById.set(key, item);
              } catch {
                // ignore malformed hosted-search payload
              }
            }
            streamingStarted = true;
            chrome.runtime.sendMessage({
              type: 'CHAT_STREAM_CHUNK',
              chunkType: 'hosted_web_search',
              content: chunk.content || '',
              id: chunk.id,
              arguments: chunk.arguments,
              requestId: message.requestId,
              conversationId: message.conversationId,
            } as StreamChunkMessage);
          } else if (chunk.type === 'grounding_metadata') {
            groundingMetadata = chunk.groundingMetadata;
          } else if (chunk.type === 'usage') {
            // Update token usage - keep the latest (cumulative) count
            tokenUsage = chunk.usage;
          }
        }
      } catch (streamError) {
        const error = streamError as Error;
        if (error.name === 'AbortError' || activeRequest.aborted) {
          // Clear buffer on user abort — tidak perlu recovery
          if (message.conversationId) clearBufferEntry(message.conversationId);
          // Re-throw so the outer catch in dispatchChatRequest calls sendResponse
          throw error;
        }
        // Mark buffer as error agar sidebar bisa menampilkan pesan error saat re-open
        if (bufferEntry && message.conversationId) {
          bufferEntry.status = 'error';
          bufferEntry.errorMessage = error.message;
          bufferEntry.completedAt = Date.now();
          scheduleBufferCleanup(message.conversationId);
        }
        if (streamingStarted) {
          // Partial content already in frontend — route error via broadcast only
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_ERROR',
            error: error.message,
            requestId: message.requestId,
            conversationId: message.conversationId,
          } as StreamErrorMessage);
        } else {
          // No content sent yet — use sendResponse so dispatchChatRequest shows the error
          sendResponse({ error: error.message });
        }
        return;
      }

      // Merge tool calls
      const mergedToolCalls = streamingService.mergeToolCalls(toolCalls);
      const backendItems = Array.from(backendItemsById.values());

      // Mark buffer entry as completed dengan semua final data
      if (bufferEntry && message.conversationId) {
        bufferEntry.status = 'completed';
        bufferEntry.fullContent = chunks.join('');
        bufferEntry.toolCalls = mergedToolCalls.length > 0 ? (mergedToolCalls as ToolCall[]) : undefined;
        bufferEntry.images = images.length > 0 ? images : undefined;
        bufferEntry.reasoningContent = reasoningChunks.length > 0 ? reasoningChunks.join('') : undefined;
        bufferEntry.reasoningSignature = reasoningSignatureChunks.length > 0 ? reasoningSignatureChunks.join('') : undefined;
        bufferEntry.groundingMetadata = groundingMetadata;
        bufferEntry.backendItems = backendItems.length > 0 ? backendItems : undefined;
        bufferEntry.usage = tokenUsage;
        bufferEntry.completedAt = Date.now();
        scheduleBufferCleanup(message.conversationId);
      }

      // Signal stream complete
      chrome.runtime.sendMessage({
        type: 'CHAT_STREAM_DONE',
        fullContent: chunks.join(''),
        reasoningContent:
          reasoningChunks.length > 0 ? reasoningChunks.join('') : undefined,
        reasoningSignature:
          reasoningSignatureChunks.length > 0 ? reasoningSignatureChunks.join('') : undefined,
        toolCalls:
          mergedToolCalls.length > 0
            ? (mergedToolCalls as ToolCall[])
            : undefined,
        groundingMetadata: groundingMetadata,
        images: images.length > 0 ? images : undefined,
        backendItems: backendItems.length > 0 ? backendItems : undefined,
        usage: tokenUsage,
        requestId: message.requestId,
        conversationId: message.conversationId,
      } as StreamDoneMessage);

      sendResponse({ started: true });
    },

    /**
     * Abort a streaming request
     * @param requestId - Request ID to abort
     * @returns True if request was found and aborted
     */
    abortRequest(requestId: string): boolean {
      const activeRequest = activeRequests.get(requestId);
      if (activeRequest) {
        activeRequest.aborted = true;
        activeRequest.abortController?.abort();
        activeRequests.delete(requestId);
        // Clear buffer — user abort tidak perlu recovery
        for (const [convId, entry] of streamingBuffers.entries()) {
          if (entry.requestId === requestId) {
            clearBufferEntry(convId);
            break;
          }
        }
        return true;
      }
      return false;
    },

    /**
     * Get active request count (for testing/debugging)
     * @returns Number of active requests
     */
    getActiveRequestCount(): number {
      return activeRequests.size;
    },
  };
}
