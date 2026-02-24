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
import type { Message, MCPTool, ProviderConfig, ToolCall } from '../../types';
import { getFriendlyErrorMessage } from '../utils/errors';
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
}

interface StreamingResponseMessage extends ChatRequestMessage {
  requestId: string;
}

interface StreamDoneMessage {
  type: 'CHAT_STREAM_DONE';
  fullContent: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  groundingMetadata?: unknown;
  images?: Array<{ mimeType: string; data: string }>;
  usage?: TokenUsage;
  requestId?: string;
}

interface StreamChunkMessage {
  type: 'CHAT_STREAM_CHUNK';
  content: string;
  chunkType?: string;
  requestId?: string;
}

interface StreamErrorMessage {
  type: 'CHAT_STREAM_ERROR';
  error: string;
  requestId?: string;
}

export interface ChatServiceResponse {
  error?: string;
  started?: boolean;
  content?: string;
  reasoning_content?: string;
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

        if (!provider.apiKey) {
          sendResponse({ error: 'API key is required. Configure it in Settings.' });
          return;
        }

        // Format and send request
        const { url, options: fetchOptions } = formatRequest(
          provider,
          messages,
          tools || [],
          options || {}
        );
        fetchOptions.signal = abortController.signal;

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const error = await getFriendlyErrorMessage(response);
          sendResponse({ error });
          return;
        }

        // Handle non-streaming
        if (options?.stream === false) {
          const data = (await response.json()) as Record<string, unknown>;
          const result = streamingService.buildNonStreamingResponse(data, provider);
          sendResponse(result);
          return;
        }

        // Handle streaming
        await this.handleStreamingResponse(
          response,
          provider,
          message as StreamingResponseMessage,
          activeRequest,
          sendResponse as (response: { started?: boolean }) => void
        );
      } catch (e) {
        const error = e as Error;
        if (error.name === 'AbortError' || activeRequest.aborted) {
          sendResponse({ error: 'Request cancelled' });
        } else {
          sendResponse({ error: error.message });
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_ERROR',
            error: error.message,
            requestId: message.requestId,
          } as StreamErrorMessage);
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
      sendResponse: (response: { started?: boolean }) => void
    ): Promise<void> {
      const chunks: string[] = [];
      const reasoningChunks: string[] = [];
      const toolCalls: ToolCallFragment[] = [];
      const images: Array<{ mimeType: string; data: string }> = [];
      let currentToolCall: ToolCallFragment | null = null;
      let groundingMetadata: unknown = null;
      let tokenUsage: TokenUsage | undefined;

      for await (const chunk of streamingService.processStream(
        response,
        provider,
        activeRequest.abortController.signal
      )) {
        // Check if request was aborted
        if (activeRequest.aborted) {
          console.log('[ChatService] Request aborted during streaming');
          return;
        }

        if (chunk.type === 'text') {
          chunks.push(chunk.content || '');
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_CHUNK',
            content: chunk.content,
            requestId: message.requestId,
          } as StreamChunkMessage);
        } else if (chunk.type === 'reasoning') {
          reasoningChunks.push(chunk.content || '');
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_CHUNK',
            chunkType: 'reasoning',
            content: chunk.content,
            requestId: message.requestId,
          } as StreamChunkMessage);
        } else if (chunk.type === 'image') {
          images.push({ mimeType: chunk.mimeType || 'image/png', data: chunk.imageData || '' });
        } else if (chunk.type === 'error') {
          const errorContent = `\n\n⚠️ ${chunk.content}`;
          chunks.push(errorContent);
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_CHUNK',
            content: errorContent,
            requestId: message.requestId,
          } as StreamChunkMessage);
        } else if (chunk.type === 'tool_call' || chunk.type === 'tool_call_start') {
          if (chunk.type === 'tool_call_start') {
            currentToolCall = {
              id: chunk.id,
              name: chunk.name,
              arguments: '',
            };
            toolCalls.push(currentToolCall);
          } else if (chunk.name) {
            currentToolCall = {
              id: chunk.id || `tc_${Date.now()}`,
              name: chunk.name,
              arguments: chunk.arguments || '',
            };
            toolCalls.push(currentToolCall);
          }
        } else if (chunk.type === 'tool_call_delta' && currentToolCall) {
          currentToolCall.arguments += chunk.content || '';
        } else if (chunk.type === 'grounding_metadata') {
          groundingMetadata = chunk.groundingMetadata;
        } else if (chunk.type === 'usage') {
          // Update token usage - keep the latest (cumulative) count
          tokenUsage = chunk.usage;
        }
      }

      // Merge tool calls
      const mergedToolCalls = streamingService.mergeToolCalls(toolCalls);

      // Signal stream complete
      chrome.runtime.sendMessage({
        type: 'CHAT_STREAM_DONE',
        fullContent: chunks.join(''),
        reasoningContent:
          reasoningChunks.length > 0 ? reasoningChunks.join('') : undefined,
        toolCalls:
          mergedToolCalls.length > 0
            ? (mergedToolCalls as ToolCall[])
            : undefined,
        groundingMetadata: groundingMetadata,
        images: images.length > 0 ? images : undefined,
        usage: tokenUsage,
        requestId: message.requestId,
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
        console.log('[ChatService] Stopping stream for requestId:', requestId);
        activeRequest.aborted = true;
        activeRequest.abortController?.abort();
        activeRequests.delete(requestId);
        return true;
      }
      console.log('[ChatService] No active request found for requestId:', requestId);
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
