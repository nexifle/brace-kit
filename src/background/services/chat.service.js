/**
 * Chat Service - Handles chat request processing
 * @module background/services/chat
 */

import { PROVIDER_PRESETS, formatRequest } from '../../providers';
import { getFriendlyErrorMessage } from '../utils/errors.js';
import { createStreamingService } from './streaming.service.js';

// Track active streaming requests for cancellation
const activeRequests = new Map(); // requestId -> { abortController, aborted }

/**
 * Create a chat service instance
 * @returns {Object} Chat service with request execution methods
 */
export function createChatService() {
  const streamingService = createStreamingService();

  return {
    /**
     * Execute a chat request
     * @param {Object} message - Chat request message
     * @param {Function} sendResponse - Response callback
     * @returns {Promise<void>}
     */
    async executeRequest(message, sendResponse) {
      const { messages, providerConfig, tools, options, requestId } = message;

      // Create AbortController
      const abortController = new AbortController();
      const activeRequest = { abortController, aborted: false };
      if (requestId) {
        activeRequests.set(requestId, activeRequest);
      }

      try {
        // Merge provider preset with user config
        const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
        const provider = {
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
        const { url, options: fetchOptions } = formatRequest(provider, messages, tools || [], options || {});
        fetchOptions.signal = abortController.signal;

        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const error = await getFriendlyErrorMessage(response);
          sendResponse({ error });
          return;
        }

        // Handle non-streaming
        if (options?.stream === false) {
          const data = await response.json();
          const result = streamingService.buildNonStreamingResponse(data, provider);
          sendResponse(result);
          return;
        }

        // Handle streaming
        await this.handleStreamingResponse(response, provider, message, activeRequest, sendResponse);
      } catch (e) {
        if (e.name === 'AbortError' || activeRequest.aborted) {
          sendResponse({ error: 'Request cancelled' });
        } else {
          sendResponse({ error: e.message });
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_ERROR',
            error: e.message,
            requestId: message.requestId,
          });
        }
      } finally {
        if (requestId) activeRequests.delete(requestId);
      }
    },

    /**
     * Handle streaming response
     * @param {Response} response - Fetch response object
     * @param {Object} provider - Provider configuration
     * @param {Object} message - Original request message
     * @param {Object} activeRequest - Active request tracking object
     * @param {Function} sendResponse - Response callback
     * @returns {Promise<void>}
     */
    async handleStreamingResponse(response, provider, message, activeRequest, sendResponse) {
      const chunks = [];
      const reasoningChunks = [];
      const toolCalls = [];
      const images = [];
      let currentToolCall = null;
      let groundingMetadata = null;

      for await (const chunk of streamingService.processStream(response, provider, activeRequest.abortController.signal)) {
        // Check if request was aborted
        if (activeRequest.aborted) {
          console.log('[ChatService] Request aborted during streaming');
          return;
        }

        if (chunk.type === 'text') {
          chunks.push(chunk.content);
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_CHUNK',
            content: chunk.content,
            requestId: message.requestId,
          });
        } else if (chunk.type === 'reasoning') {
          reasoningChunks.push(chunk.content);
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_CHUNK',
            chunkType: 'reasoning',
            content: chunk.content,
            requestId: message.requestId,
          });
        } else if (chunk.type === 'image') {
          images.push({ mimeType: chunk.mimeType, data: chunk.imageData });
        } else if (chunk.type === 'error') {
          const errorContent = `\n\n⚠️ ${chunk.content}`;
          chunks.push(errorContent);
          chrome.runtime.sendMessage({
            type: 'CHAT_STREAM_CHUNK',
            content: errorContent,
            requestId: message.requestId,
          });
        } else if (chunk.type === 'tool_call' || chunk.type === 'tool_call_start') {
          if (chunk.type === 'tool_call_start') {
            currentToolCall = { id: chunk.id, name: chunk.name, arguments: '' };
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
          currentToolCall.arguments += chunk.content;
        } else if (chunk.type === 'grounding_metadata') {
          groundingMetadata = chunk.groundingMetadata;
        }
      }

      // Merge tool calls
      const mergedToolCalls = streamingService.mergeToolCalls(toolCalls);

      // Signal stream complete
      chrome.runtime.sendMessage({
        type: 'CHAT_STREAM_DONE',
        fullContent: chunks.join(''),
        reasoningContent: reasoningChunks.length > 0 ? reasoningChunks.join('') : undefined,
        toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
        groundingMetadata: groundingMetadata,
        images: images.length > 0 ? images : undefined,
        requestId: message.requestId,
      });

      sendResponse({ started: true });
    },

    /**
     * Abort a streaming request
     * @param {string} requestId - Request ID to abort
     * @returns {boolean} True if request was found and aborted
     */
    abortRequest(requestId) {
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
     * @returns {number} Number of active requests
     */
    getActiveRequestCount() {
      return activeRequests.size;
    }
  };
}
