/**
 * useStreamProcessor Hook
 *
 * Stream processing utilities for handling streaming responses.
 * Provides functions to process stream chunks and track tool call state.
 */

import { useRef, useCallback } from 'react';
import type { ToolCall, GroundingMetadata, GeneratedImage } from '../../types/index.ts';

/**
 * Stream chunk type for processing
 */
export interface StreamChunk {
  type: string;
  content?: string;
  id?: string;
  name?: string;
  arguments?: string;
  index?: number;
  groundingMetadata?: GroundingMetadata;
  mimeType?: string;
  imageData?: string;
}

/**
 * Add inline citations to text based on grounding metadata
 */
export function addInlineCitations(text: string, groundingMetadata?: GroundingMetadata): string {
  if (!groundingMetadata?.groundingSupports || !groundingMetadata?.groundingChunks) {
    return text;
  }

  const supports = groundingMetadata.groundingSupports;
  const chunks = groundingMetadata.groundingChunks;

  // Sort by endIndex descending to avoid index shifting
  const sorted = [...supports].sort(
    (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
  );

  let result = text;
  for (const support of sorted) {
    const endIndex = support.segment?.endIndex;
    if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;

    const citations = support.groundingChunkIndices
      .filter((i) => i < chunks.length)
      .map((i) => `[${i + 1}]`)
      .join('');

    if (citations) {
      result = result.slice(0, endIndex) + citations + result.slice(endIndex);
    }
  }

  return result;
}

/**
 * Stream processing result
 */
export interface StreamResult {
  content: string;
  toolCalls?: ToolCall[];
  groundingMetadata?: GroundingMetadata;
  images?: GeneratedImage[];
  reasoningContent?: string;
}

/**
 * Stream processing utilities
 */
export function useStreamProcessor() {
  const toolCallsRef = useRef<ToolCall[]>([]);
  const currentToolCallRef = useRef<Partial<ToolCall> | null>(null);
  const groundingMetadataRef = useRef<GroundingMetadata | null>(null);
  const imagesRef = useRef<GeneratedImage[]>([]);
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  const reasoningContentRef = useRef<string>('');

  /**
   * Reset all refs
   */
  const reset = useCallback(() => {
    toolCallsRef.current = [];
    currentToolCallRef.current = null;
    groundingMetadataRef.current = null;
    imagesRef.current = [];
    reasoningContentRef.current = '';
  }, []);

  /**
   * Process a stream chunk and update refs
   */
  const processChunk = useCallback(
    (
      chunk: StreamChunk,
      onTextChunk?: (content: string) => void,
      onReasoningChunk?: (content: string) => void
    ) => {
      switch (chunk.type) {
        case 'text':
          if (chunk.content && onTextChunk) {
            onTextChunk(chunk.content);
          }
          break;

        case 'reasoning':
          if (chunk.content) {
            reasoningContentRef.current += chunk.content;
            if (onReasoningChunk) {
              onReasoningChunk(chunk.content);
            }
          }
          break;

        case 'image':
          if (chunk.mimeType && chunk.imageData) {
            imagesRef.current.push({
              mimeType: chunk.mimeType,
              data: chunk.imageData,
            });
          }
          break;

        case 'tool_call_start':
          currentToolCallRef.current = {
            id: chunk.id,
            name: chunk.name,
            arguments: '',
          };
          toolCallsRef.current.push(currentToolCallRef.current as ToolCall);
          break;

        case 'tool_call':
          if (chunk.name) {
            currentToolCallRef.current = {
              id: chunk.id || `tc_${Date.now()}`,
              name: chunk.name,
              arguments: chunk.arguments || '',
            };
            toolCallsRef.current.push(currentToolCallRef.current as ToolCall);
          }
          break;

        case 'tool_call_delta':
          if (currentToolCallRef.current && chunk.content) {
            currentToolCallRef.current.arguments += chunk.content;
          }
          break;

        case 'grounding_metadata':
          groundingMetadataRef.current = chunk.groundingMetadata || null;
          break;
      }
    },
    []
  );

  /**
   * Get final streaming result
   */
  const getFinalResult = useCallback(
    (fullContent: string, reasoningContent?: string): StreamResult => {
      // Add inline citations
      const contentWithCitations = addInlineCitations(
        fullContent,
        groundingMetadataRef.current || undefined
      );

      // Merge tool calls by index
      const mergedToolCalls = mergeToolCalls(toolCallsRef.current);

      return {
        content: contentWithCitations,
        toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
        groundingMetadata: groundingMetadataRef.current || undefined,
        images: imagesRef.current.length > 0 ? imagesRef.current : undefined,
        reasoningContent:
          reasoningContent || reasoningContentRef.current || undefined,
      };
    },
    []
  );

  /**
   * Check if tool calls have been processed
   */
  const isToolCallProcessed = useCallback((toolCallKey: string): boolean => {
    return processedToolCallsRef.current.has(toolCallKey);
  }, []);

  /**
   * Mark tool calls as processed
   */
  const markToolCallsProcessed = useCallback((toolCallKey: string) => {
    processedToolCallsRef.current.add(toolCallKey);

    // Clean up old entries
    if (processedToolCallsRef.current.size > 50) {
      const iterator = processedToolCallsRef.current.values();
      const first = iterator.next();
      if (!first.done) {
        processedToolCallsRef.current.delete(first.value);
      }
    }
  }, []);

  /**
   * Get current reasoning content
   */
  const getReasoningContent = useCallback(() => {
    return reasoningContentRef.current;
  }, []);

  /**
   * Get current tool calls
   */
  const getToolCalls = useCallback(() => {
    return toolCallsRef.current;
  }, []);

  /**
   * Get current grounding metadata
   */
  const getGroundingMetadata = useCallback(() => {
    return groundingMetadataRef.current;
  }, []);

  /**
   * Get current images
   */
  const getImages = useCallback(() => {
    return imagesRef.current;
  }, []);

  return {
    reset,
    processChunk,
    getFinalResult,
    isToolCallProcessed,
    markToolCallsProcessed,
    getReasoningContent,
    getToolCalls,
    getGroundingMetadata,
    getImages,
    addInlineCitations,
    // Expose refs for advanced use cases
    toolCallsRef,
    groundingMetadataRef,
    imagesRef,
    reasoningContentRef,
  };
}

/**
 * Merge tool calls by index
 */
function mergeToolCalls(toolCalls: ToolCall[]): ToolCall[] {
  const merged = new Map<number | string, ToolCall>();

  for (const tc of toolCalls) {
    if ((tc as ToolCall & { index?: number }).index !== undefined) {
      const index = (tc as ToolCall & { index?: number }).index!;
      const existing = merged.get(index);
      if (existing) {
        if (tc.arguments) existing.arguments += tc.arguments;
        if (tc.name) existing.name = tc.name;
        if (tc.id) existing.id = tc.id;
      } else {
        merged.set(index, { ...tc });
      }
    } else {
      merged.set(tc.id || merged.size, tc);
    }
  }

  return Array.from(merged.values());
}
