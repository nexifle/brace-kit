/**
 * Streaming Service - Handles stream chunk processing
 * @module background/services/streaming
 */

import {
  parseStream,
  parseXAIImageResponse,
  XAI_IMAGE_MODELS,
} from '../../providers';
import type { StreamChunk, ProviderWithConfig } from '../../providers';

export interface ToolCallFragment {
  id?: string;
  index?: number;
  name?: string;
  arguments?: string;
}

export interface StreamingService {
  processStream: (
    response: Response,
    provider: ProviderWithConfig,
    signal: AbortSignal
  ) => AsyncGenerator<StreamChunk>;
  mergeToolCalls: (toolCalls: ToolCallFragment[]) => ToolCallFragment[];
  buildNonStreamingResponse: (
    data: Record<string, unknown>,
    provider: ProviderWithConfig
  ) => { content: string; reasoning_content: string };
}

/**
 * Create a streaming service instance
 * @returns Streaming service with stream processing methods
 */
export function createStreamingService(): StreamingService {
  return {
    /**
     * Process a streaming response
     * @param response - Fetch response object
     * @param provider - Provider configuration
     * @param signal - Abort signal for cancellation
     * @yields Stream chunks
     */
    async *processStream(
      response: Response,
      provider: ProviderWithConfig,
      signal: AbortSignal
    ): AsyncGenerator<StreamChunk> {
      const isXAIImageModel =
        provider.id === 'xai' && XAI_IMAGE_MODELS.includes(provider.model || '');

      for await (const chunk of isXAIImageModel
        ? parseXAIImageResponse(response)
        : parseStream(provider, response, signal)) {
        yield chunk;
      }
    },

    /**
     * Merge tool call fragments from streaming responses
     * OpenAI streams tool call arguments in chunks that need to be merged by index
     * @param toolCalls - Array of tool call fragments
     * @returns Merged tool calls
     */
    mergeToolCalls(toolCalls: ToolCallFragment[]): ToolCallFragment[] {
      const merged = new Map<string | number, ToolCallFragment>();
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
     * @param data - Parsed JSON response
     * @param provider - Provider configuration
     * @returns Response with content and reasoning_content
     */
    buildNonStreamingResponse(
      data: Record<string, unknown>,
      provider: ProviderWithConfig
    ): { content: string; reasoning_content: string } {
      let text = '';
      let reasoning = '';

      if (provider.format === 'openai') {
        const choices = data.choices as Array<Record<string, unknown>> | undefined;
        const message = choices?.[0]?.message as Record<string, unknown> | undefined;
        text = (message?.content as string) || '';
        reasoning = (message?.reasoning_content as string) || '';
      } else if (provider.format === 'anthropic') {
        const content = data.content as Array<Record<string, unknown>> | undefined;
        text =
          content
            ?.map((c) => c.text as string | undefined)
            .filter(Boolean)
            .join('') || '';
      } else if (provider.format === 'gemini') {
        const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
        const parts = candidates?.[0]?.content as Record<string, unknown> | undefined;
        const partsArray = parts?.parts as Array<Record<string, unknown>> | undefined;
        text =
          partsArray
            ?.map((p) => p.text as string | undefined)
            .filter(Boolean)
            .join('') || '';
      }

      return { content: text, reasoning_content: reasoning };
    },
  };
}
