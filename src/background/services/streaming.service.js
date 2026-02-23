/**
 * Streaming Service - Handles stream chunk processing
 * @module background/services/streaming
 */

import { parseStream, parseXAIImageResponse } from '../../providers';
import { XAI_IMAGE_MODELS } from '../../providers';

/**
 * Create a streaming service instance
 * @returns {Object} Streaming service with stream processing methods
 */
export function createStreamingService() {
  return {
    /**
     * Process a streaming response
     * @param {Response} response - Fetch response object
     * @param {Object} provider - Provider configuration
     * @param {AbortSignal} signal - Abort signal for cancellation
     * @yields {Object} Stream chunks
     */
    async *processStream(response, provider, signal) {
      const isXAIImageModel = provider.id === 'xai' && XAI_IMAGE_MODELS.includes(provider.model || '');

      for await (const chunk of (isXAIImageModel
        ? parseXAIImageResponse(response)
        : parseStream(provider, response, signal))
      ) {
        yield chunk;
      }
    },

    /**
     * Merge tool call fragments from streaming responses
     * OpenAI streams tool call arguments in chunks that need to be merged by index
     * @param {Array} toolCalls - Array of tool call fragments
     * @returns {Array} Merged tool calls
     */
    mergeToolCalls(toolCalls) {
      const merged = new Map();
      for (const tc of toolCalls) {
        if (tc.index !== undefined) {
          const existing = merged.get(tc.index);
          if (existing) {
            if (tc.arguments) existing.arguments += tc.arguments;
            if (tc.name) existing.name = tc.name;
            if (tc.id) existing.id = tc.id;
          } else {
            merged.set(tc.index, { ...tc });
          }
        } else {
          merged.set(tc.id || merged.size, tc);
        }
      }
      return Array.from(merged.values());
    },

    /**
     * Build response object from non-streaming API response
     * @param {Object} data - Parsed JSON response
     * @param {Object} provider - Provider configuration
     * @returns {Object} Response with content and reasoning_content
     */
    buildNonStreamingResponse(data, provider) {
      let text = '';
      let reasoning = '';

      if (provider.format === 'openai') {
        const message = data.choices?.[0]?.message;
        text = message?.content || '';
        reasoning = message?.reasoning_content || '';
      } else if (provider.format === 'anthropic') {
        text = data.content?.map(c => c.text).filter(Boolean).join('') || '';
      } else if (provider.format === 'gemini') {
        text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
      }

      return { content: text, reasoning_content: reasoning };
    }
  };
}
