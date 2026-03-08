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
  ) => { content: string; reasoning_content: string; tool_calls?: ToolCallFragment[] };
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
     * @returns Response with content, reasoning_content, and tool_calls
     */
    buildNonStreamingResponse(
      data: Record<string, unknown>,
      provider: ProviderWithConfig
    ): { content: string; reasoning_content: string; tool_calls?: ToolCallFragment[] } {
      let text = '';
      let reasoning = '';
      let toolCalls: ToolCallFragment[] | undefined;

      if (provider.format === 'openai') {
        const choices = data.choices as Array<Record<string, unknown>> | undefined;
        const message = choices?.[0]?.message as Record<string, unknown> | undefined;
        text = (message?.content as string) || '';
        reasoning = (message?.reasoning_content as string) || '';

        // Extract tool calls from OpenAI format
        const rawToolCalls = message?.tool_calls as Array<{
          id?: string;
          type?: string;
          function?: { name?: string; arguments?: string };
        }> | undefined;

        if (rawToolCalls && rawToolCalls.length > 0) {
          toolCalls = rawToolCalls.map((tc, index) => ({
            id: tc.id,
            index,
            name: tc.function?.name,
            arguments: tc.function?.arguments,
          }));
        }
      } else if (provider.format === 'anthropic') {
        const content = data.content as Array<{
          type?: string;
          text?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }> | undefined;

        // Anthropic content blocks: filter text blocks (backward compatible with test data that lacks 'type')
        const textBlocks = content?.filter((c) => !c.type || c.type === 'text');
        text = textBlocks?.map((c) => c.text).filter(Boolean).join('') || '';

        // Extract tool calls from Anthropic format (tool_use blocks)
        const toolUseBlocks = content?.filter((c) => c.type === 'tool_use');
        if (toolUseBlocks && toolUseBlocks.length > 0) {
          toolCalls = toolUseBlocks.map((tc, index) => ({
            id: tc.id,
            index,
            name: tc.name,
            arguments: tc.input ? JSON.stringify(tc.input) : '{}',
          }));
        }
      } else if (provider.format === 'gemini') {
        const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
        const parts = candidates?.[0]?.content as Record<string, unknown> | undefined;
        const partsArray = parts?.parts as Array<{
          text?: string;
          functionCall?: { name?: string; args?: Record<string, unknown> };
        }> | undefined;

        text =
          partsArray
            ?.filter((p) => p.text)
            ?.map((p) => p.text)
            .filter(Boolean)
            .join('') || '';

        // Extract tool calls from Gemini format (functionCall)
        const functionCalls = partsArray?.filter((p) => p.functionCall);
        if (functionCalls && functionCalls.length > 0) {
          toolCalls = functionCalls.map((fc, index) => ({
            id: `fc_${index}_${Date.now()}`,
            index,
            name: fc.functionCall?.name,
            arguments: fc.functionCall?.args ? JSON.stringify(fc.functionCall.args) : '{}',
          }));
        }
      } else if (provider.format === 'ollama') {
        const message = data.message as Record<string, unknown> | undefined;
        text = (message?.content as string) || '';
        // Ollama stores thinking in message.thinking (newer) or top-level thinking (older)
        reasoning = ((message?.thinking ?? data.thinking) as string) || '';

        // Extract tool calls from Ollama format
        const rawToolCalls = message?.tool_calls as Array<{
          id?: string;
          function?: { index?: number; name?: string; arguments?: unknown };
        }> | undefined;

        if (rawToolCalls && rawToolCalls.length > 0) {
          toolCalls = rawToolCalls.map((tc, index) => ({
            id: tc.id,
            index: tc.function?.index ?? index,
            name: tc.function?.name,
            // Ollama returns arguments as an object (not a string) — serialize it
            arguments:
              tc.function?.arguments !== undefined
                ? typeof tc.function.arguments === 'string'
                  ? tc.function.arguments
                  : JSON.stringify(tc.function.arguments)
                : '{}',
          }));
        }
      }

      return { content: text, reasoning_content: reasoning, tool_calls: toolCalls };
    },
  };
}
