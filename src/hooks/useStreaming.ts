/**
 * useStreaming Hook (Simplified)
 *
 * Handles streaming responses using extracted sub-hooks.
 * Uses useMessageBuilder, useTools, useStreamProcessor, and useAutoCompact.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { ToolCall, GroundingMetadata, GeneratedImage, TokenUsage, Message } from '../types/index.ts';
import { GEMINI_NO_TOOLS_MODELS, XAI_IMAGE_MODELS } from '../providers/presets.ts';
import { TITLE_GENERATION_SYSTEM_PROMPT } from '../types/index.ts';
import { useMemory } from './useMemory.ts';
import { useMessageBuilder } from './chat/useMessageBuilder.ts';
import { useTools } from './tools/useTools.ts';
import { useAutoCompact } from './compact/index.ts';
import { useStreamProcessor } from './streaming/useStreamProcessor.ts';
import {
  getConversationMessages,
  saveConversationMessages,
  saveConversationMetadata,
} from '../utils/conversationDB.ts';

export function useStreaming() {
  const store = useStore();
  const { extractMemories } = useMemory();
  const { buildAPIMessages } = useMessageBuilder();
  const { getAllTools, supportsFunctionCalling, getChatOptions } = useTools();
  const { checkAndAutoCompact } = useAutoCompact();
  const streamProcessor = useStreamProcessor();

  // Track processed request IDs to prevent double processing
  const processedDoneRequestsRef = useRef<Set<string>>(new Set());

  /**
   * Save completed background stream to IndexedDB
   */
  const handleBackgroundStreamDone = useCallback(async (
    convId: string,
    message: {
      fullContent?: string;
      reasoningContent?: string;
      reasoningSignature?: string;
      toolCalls?: ToolCall[];
    }
  ) => {
    try {
      const existingMsgs = await getConversationMessages(convId) || [];

      const assistantMsg: Message = {
        role: 'assistant',
        content: message.fullContent || '',
        ...(message.toolCalls?.length && { toolCalls: message.toolCalls }),
        ...(message.reasoningContent && { reasoningContent: message.reasoningContent }),
        ...(message.reasoningSignature && { reasoningSignature: message.reasoningSignature }),
      };

      await saveConversationMessages(convId, [...existingMsgs, assistantMsg]);

      // Update conversation timestamp in store and IDB
      const freshState = useStore.getState();
      const convMeta = freshState.conversations.find(c => c.id === convId);
      if (convMeta) {
        const updatedConv = { ...convMeta, updatedAt: Date.now() };
        saveConversationMetadata(updatedConv).catch(e =>
          console.warn('[useStreaming] Failed to update bg conv timestamp:', e)
        );
        useStore.setState(s => ({
          conversations: s.conversations.map(c => c.id === convId ? updatedConv : c),
        }));
      }

      freshState.setConversationStreaming(convId, null);
    } catch (e) {
      console.warn('[useStreaming] handleBackgroundStreamDone failed:', e);
      useStore.getState().setConversationStreaming(convId, null);
    }
  }, []);

  /**
   * Clear streaming state for a background conversation on error
   */
  const handleBackgroundStreamError = useCallback((convId: string) => {
    useStore.getState().setConversationStreaming(convId, null);
  }, []);

  /**
   * Handle tool calls from stream
   */
  const handleToolCalls = useCallback(async (toolCalls: ToolCall[]) => {
    // Check if already processed
    const toolCallKey = toolCalls.map((tc) => tc.id).sort().join(',');
    if (streamProcessor.isToolCallProcessed(toolCallKey)) {
      return;
    }
    streamProcessor.markToolCallsProcessed(toolCallKey);

    store.setIsStreaming(true);
    for (const tc of toolCalls) {
      if (!useStore.getState().isStreaming) {
        return;
      }
      if (!tc.name) continue;
      
      let args = {};
      try {
        args = JSON.parse(tc.arguments || '{}');
      } catch {
        args = {};
      }

      // Check for cached result (duplicate tool call)
      // const freshMsgs = useStore.getState().messages;
      // const argsKey = JSON.stringify(args);
      // const previousSuccessful = freshMsgs.find(
      //   (m) =>
      //     m.role === 'tool' &&
      //     m.name === tc.name &&
      //     JSON.stringify(m.toolArguments ?? {}) === argsKey &&
      //     m.content !== '⏳ Calling...' &&
      //     (!m.content.includes('Error:') || !m.content.includes('error') || !m.content.includes('Error'))
      // );

      // if (previousSuccessful) {
      //   store.addMessage({
      //     role: 'tool',
      //     toolCallId: tc.id,
      //     name: tc.name,
      //     content: '[DUPLICATE_CALL_SKIPPED] This exact tool call was already executed with identical arguments. Refer to the previous result already in context.',
      //     toolArguments: args as Record<string, unknown>,
      //     isCachedResult: true,
      //   });
      //   continue;
      // }

      // Add "calling" status
      store.addMessage({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: '⏳ Calling...',
        toolArguments: args as Record<string, unknown>,
      });

      // Execute tool
      try {
        let resultText = '';
        if (tc.name === 'continue_message') {
          resultText = 'Chain message initiated. You may continue your response now.';
        } else {
          const result = await chrome.runtime.sendMessage({
            type: 'MCP_CALL_TOOL',
            name: tc.name,
            arguments: args,
          });
          resultText =
            result?.content?.map((c: { text?: string }) => c.text || JSON.stringify(c)).join('\n') ||
            JSON.stringify(result);
        }

        // Update message with result
        updateToolMessage(tc.id, resultText);
      } catch (e) {
        updateToolMessage(tc.id, `Error: ${(e as Error).message}`);
      }
    }

    // Auto compact check
    await checkAndAutoCompact();

    // Build follow-up request
    const msgs = buildAPIMessages(useStore.getState().messages);

    if (!useStore.getState().isStreaming) return;

    // Get tools using unified hook
    const tools = await getAllTools();

    const requestId = `req_${Date.now()}`;
    const activeConvId = useStore.getState().activeConversationId;
    store.setCurrentRequestId(requestId);
    store.setStreamingContent('');
    store.setStreamingReasoningContent('');
    if (activeConvId) {
      useStore.getState().setConversationStreaming(activeConvId, { requestId });
    }

    const chatOptions = getChatOptions();
    const currentModel = store.providerConfig.model || '';
    const canUseFunctionCalling = supportsFunctionCalling(currentModel);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: msgs,
        providerConfig: store.providerConfig,
        tools: canUseFunctionCalling ? tools : [],
        options: chatOptions,
        requestId,
        conversationId: activeConvId,
      });

      if (response?.error) {
        if (activeConvId) useStore.getState().setConversationStreaming(activeConvId, null);
        store.addMessage({ role: 'error', content: response.error });
        store.setIsStreaming(false);
      }
    } catch (e) {
      if (activeConvId) useStore.getState().setConversationStreaming(activeConvId, null);
      store.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      store.setIsStreaming(false);
    }
  }, [store, buildAPIMessages, getAllTools, supportsFunctionCalling, getChatOptions, streamProcessor]);

  /**
   * Finish stream and create assistant message
   */
  const finishStream = useCallback(
    (
      fullContent: string,
      toolCalls?: ToolCall[],
      _groundingMetadata?: GroundingMetadata,
      _generatedImages?: GeneratedImage[],
      reasoningContent?: string,
      reasoningSignature?: string
    ) => {
      const result = streamProcessor.getFinalResult(fullContent, reasoningContent);

      // Add assistant message
      // Use toolCalls from parameter (sent by background via CHAT_STREAM_DONE) as primary source,
      // fall back to result.toolCalls from streamProcessor for client-side processed chunks.
      const finalToolCalls = (toolCalls && toolCalls.length > 0) ? toolCalls : result.toolCalls;
      const assistantMsg: {
        role: 'assistant';
        content: string;
        toolCalls?: ToolCall[];
        groundingMetadata?: GroundingMetadata;
        generatedImages?: GeneratedImage[];
        reasoningContent?: string;
        reasoningSignature?: string;
      } = {
        role: 'assistant',
        content: result.content || '',
        ...(finalToolCalls && finalToolCalls.length > 0 && { toolCalls: finalToolCalls }),
        ...(result.groundingMetadata && { groundingMetadata: result.groundingMetadata }),
        ...(result.images && { generatedImages: result.images }),
        ...(result.reasoningContent && { reasoningContent: result.reasoningContent }),
        ...(reasoningSignature && { reasoningSignature }),
      };

      store.addMessage(assistantMsg);

      // Reset state
      store.setStreamingContent('');
      store.setStreamingReasoningContent('');
      streamProcessor.reset();
      // Clear per-conversation streaming state (handleToolCalls will re-set it if needed)
      if (!toolCalls || toolCalls.length === 0) {
        const activeConvId = useStore.getState().activeConversationId;
        if (activeConvId) store.setConversationStreaming(activeConvId, null);
      }
      store.setIsStreaming(false);
      store.setCurrentRequestId(null);
      store.saveActiveConversation();
      store.updateConversationTimestamp();

      // Extract memories if no tool calls
      if (store.memoryEnabled && !toolCalls?.length) {
        const currentMessages = [...store.messages, assistantMsg];
        setTimeout(() => extractMemories(currentMessages), 100);
      }

      // Auto-generate title
      if (!toolCalls?.length && store.activeConversationId) {
        const conv = store.conversations.find((c) => c.id === store.activeConversationId);
        if (conv?.title === 'New Chat' && store.messages.length >= 1) {
          setTimeout(async () => {
            const msgs = store.messages.slice(0, 4).map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.displayContent || m.content,
            }));

            try {
              const currentModel = store.providerConfig.model || '';
              const isGeminiImg = GEMINI_NO_TOOLS_MODELS.includes(currentModel);
              const isXAIImg = store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
              const titleProviderConfig = isGeminiImg
                ? { ...store.providerConfig, model: 'gemini-2.5-flash-lite' }
                : isXAIImg
                  ? { ...store.providerConfig, model: 'grok-4-1-fast-non-reasoning' }
                  : store.providerConfig;
              const response = await chrome.runtime.sendMessage({
                type: 'TITLE_GENERATE',
                messages: [
                  { role: 'system', content: TITLE_GENERATION_SYSTEM_PROMPT },
                  ...msgs
                ],
                providerConfig: titleProviderConfig,
              });

              if (response?.title && store.activeConversationId) {
                const title = response.title.trim().replace(/^["']|["']$/g, '').slice(0, 50);
                store.updateConversationTitle(store.activeConversationId, title);
              }
            } catch (e) {
              console.warn('[TitleGen] Failed:', e);
            }
          }, 1500);
        }
      }

      // Handle tool calls
      if (toolCalls && toolCalls.length > 0) {
        handleToolCalls(toolCalls);
      }

      return null;
    },
    [store, streamProcessor, extractMemories, handleToolCalls]
  );

  /**
   * Handle stream error
   */
  const handleStreamError = useCallback((error: string) => {
    const activeConvId = useStore.getState().activeConversationId;
    if (activeConvId) store.setConversationStreaming(activeConvId, null);
    store.addMessage({ role: 'error', content: error });
    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.setStreamingContent('');
    streamProcessor.reset();
  }, [store, streamProcessor]);

  // Listen for stream messages
  useEffect(() => {
    const listener = (message: {
      type: string;
      requestId?: string;
      conversationId?: string;
      content?: string;
      fullContent?: string;
      reasoningContent?: string;
      reasoningSignature?: string;
      chunkType?: string;
      toolCalls?: ToolCall[];
      groundingMetadata?: GroundingMetadata;
      images?: GeneratedImage[];
      usage?: TokenUsage;
      error?: string;
    }) => {
      const state = useStore.getState();
      const isActiveConv = message.requestId === state.currentRequestId;
      const bgConvId = message.conversationId;
      const isBackgroundConv = !!(
        bgConvId &&
        bgConvId !== state.activeConversationId &&
        state.streamingConversations[bgConvId]?.requestId === message.requestId
      );

      if (!isActiveConv && !isBackgroundConv) return;

      // Route messages for background conversations (not active)
      if (isBackgroundConv && bgConvId) {
        if (message.type === 'CHAT_STREAM_CHUNK') {
          // Akumulasikan chunk ke streamingConversations agar saat user switch kembali,
          // konten yang sudah diterima tidak hilang
          if (message.content) {
            useStore.setState(s => {
              const current = s.streamingConversations[bgConvId];
              if (!current) return s;
              return {
                streamingConversations: {
                  ...s.streamingConversations,
                  [bgConvId]: {
                    ...current,
                    streamingContent: (current.streamingContent || '') + message.content,
                  },
                },
              };
            });
          }
        } else if (message.type === 'CHAT_STREAM_DONE') {
          if (message.requestId && processedDoneRequestsRef.current.has(message.requestId)) return;
          if (message.requestId) {
            processedDoneRequestsRef.current.add(message.requestId);
            if (processedDoneRequestsRef.current.size > 100) {
              const iterator = processedDoneRequestsRef.current.values();
              const first = iterator.next();
              if (!first.done) processedDoneRequestsRef.current.delete(first.value);
            }
          }
          handleBackgroundStreamDone(bgConvId, message);
        } else if (message.type === 'CHAT_STREAM_ERROR') {
          handleBackgroundStreamError(bgConvId);
        }
        return;
      }

      // Active conversation handling
      switch (message.type) {
        case 'CHAT_STREAM_CHUNK':
          if (message.chunkType === 'reasoning' && message.content) {
            store.setStreamingReasoningContent(
              useStore.getState().streamingReasoningContent + message.content
            );
          } else if (message.content) {
            const currentContent = useStore.getState().streamingContent;
            store.setStreamingContent(currentContent + message.content);
          }
          break;

        case 'CHAT_STREAM_DONE':
          // Guard: prevent processing the same request twice
          if (message.requestId && processedDoneRequestsRef.current.has(message.requestId)) {
            return;
          }
          if (message.requestId) {
            processedDoneRequestsRef.current.add(message.requestId);
          }
          // Clean up old entries if too many
          if (processedDoneRequestsRef.current.size > 100) {
            const iterator = processedDoneRequestsRef.current.values();
            const first = iterator.next();
            if (!first.done) {
              processedDoneRequestsRef.current.delete(first.value);
            }
          }

          // Update token usage in store for auto-compact
          if (message.usage) {
            store.setTokenUsage(message.usage);
          }

          const finalContent = message.fullContent || useStore.getState().streamingContent;
          const finalReasoningContent = message.reasoningContent || streamProcessor.getReasoningContent() || undefined;
          finishStream(
            finalContent,
            message.toolCalls || streamProcessor.getToolCalls(),
            message.groundingMetadata || streamProcessor.getGroundingMetadata() || undefined,
            message.images || streamProcessor.getImages(),
            finalReasoningContent,
            message.reasoningSignature
          );
          break;

        case 'CHAT_STREAM_ERROR':
          handleStreamError(message.error || 'Unknown error');
          break;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [finishStream, handleStreamError, handleBackgroundStreamDone, handleBackgroundStreamError, streamProcessor, store]);

  return {
    handleToolCalls,
    finishStream,
    handleStreamError,
  };
}

/**
 * Helper function to update tool message content
 */
function updateToolMessage(toolCallId: string, content: string) {
  const store = useStore.getState();
  const freshMessages = store.messages;
  const callingIdx = [...freshMessages]
    .reverse()
    .findIndex(
      (m) =>
        m.role === 'tool' &&
        String(m.toolCallId) === String(toolCallId) &&
        String(m.content).includes('Calling...')
    );

  if (callingIdx !== -1) {
    const actualIdx = freshMessages.length - 1 - callingIdx;
    const updated = [...freshMessages];
    updated[actualIdx] = { ...updated[actualIdx], content };
    store.setMessages(updated);
  }
}
