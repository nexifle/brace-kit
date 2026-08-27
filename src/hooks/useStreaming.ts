/**
 * useStreaming Hook (Simplified)
 *
 * Handles streaming responses using extracted sub-hooks.
 * Uses useMessageBuilder, useTools, useStreamProcessor, and useAutoCompact.
 */

import { useEffect, useRef, useCallback } from 'react';
import { toolSnapshot } from '../utils/estimateTokens.ts';
import { prepareChatRequest } from '../utils/chatOptions.ts';
import { useStore } from '../store/index.ts';
import { useToast } from '../components/ui/toast/useToast.ts';
import type { ToolCall, GroundingMetadata, GeneratedImage, TokenUsage, Message, ActiveStreamsResponse, StreamingBufferEntry, MCPTool } from '../types/index.ts';
import { MCP_DISCONNECT_PREFIX } from '../types/index.ts';
import { executeChatToolCall, finishRequestAsSuspended, updateToolMessage } from '../services/chatToolExecutor.ts';
import { useMemory } from './useMemory.ts';
import { useMessageBuilder } from './chat/useMessageBuilder.ts';
import { useTools } from './tools/useTools.ts';
import { useAutoCompact } from './compact/index.ts';
import { useStreamProcessor } from './streaming/useStreamProcessor.ts';
import { generateConversationTitle } from './useChat.ts';
import {
  getConversationMessages,
  saveConversationMessages,
  saveConversationMetadata,
} from '../utils/conversationDB.ts';

export function useStreaming() {
  const store = useStore();
  const { extractMemories } = useMemory();
  const { buildAPIMessages } = useMessageBuilder();
  const { getAllTools, supportsFunctionCalling } = useTools();
  const { checkAndAutoCompact, tryOverflowRecovery } = useAutoCompact();
  const streamProcessor = useStreamProcessor();
  const { warning } = useToast();

  // Track processed request IDs to prevent double processing
  const processedDoneRequestsRef = useRef<Set<string>>(new Set());
  const requestToolsRef = useRef<MCPTool[]>([]);

  /**
   * Tell the background that a stream has been consumed and persisted, so it
   * removes the buffer entry. Without this, recovery on the next sidebar open
   * would re-process a completed/errored stream and append a duplicate message.
   */
  const notifyStreamConsumed = useCallback((requestId: string | null | undefined, conversationId: string | null | undefined) => {
    if (!requestId && !conversationId) return;
    chrome.runtime.sendMessage({
      type: 'STREAM_CONSUMED',
      requestId: requestId ?? undefined,
      conversationId: conversationId ?? undefined,
    }).catch(() => {
      // Background mungkin belum siap — buffer auto-purge via TTL sebagai fallback
    });
  }, []);

  /**
   * Save completed background stream to IndexedDB
   */
  const handleBackgroundStreamDone = useCallback(async (
    convId: string,
    requestId: string | undefined,
    message: {
      fullContent?: string;
      reasoningContent?: string;
      reasoningSignature?: string;
      toolCalls?: ToolCall[];
      usage?: TokenUsage;
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
        ...(message.usage && { usage: message.usage }),
      };

      await saveConversationMessages(convId, [...existingMsgs, assistantMsg]);

      // Persisted — remove the buffer so reopen recovery doesn't re-append it
      notifyStreamConsumed(requestId, convId);

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
  }, [notifyStreamConsumed]);

  /**
   * Clear streaming state for a background conversation on error
   */
  const handleBackgroundStreamError = useCallback((convId: string, requestId?: string) => {
    notifyStreamConsumed(requestId, convId);
    useStore.getState().setConversationStreaming(convId, null);
  }, [notifyStreamConsumed]);

  /**
   * Handle MCP server disconnect detected during a tool call.
   * Stops the current request, notifies the user, and initiates auto-reconnect.
   */
  const handleMCPDisconnect = useCallback((toolCallId: string, serverName: string) => {
    // Update the calling tool bubble to show disconnect status
    updateToolMessage(toolCallId, `Disconnected from MCP server "${serverName}"`);

    // Mark server as disconnected in store so the InputArea banner appears
    const state = useStore.getState();
    const server = state.mcpServers.find(s => s.name === serverName);
    if (server) {
      state.updateMCPServer(server.id, { connected: false });
    }

    // Stop the current streaming request
    const activeConvId = state.activeConversationId;
    if (activeConvId) state.setConversationStreaming(activeConvId, null);
    state.setIsStreaming(false);
    state.setCurrentRequestId(null);
    state.setStreamingContent('');
    state.setStreamingReasoningContent('');
    streamProcessor.reset();

    // Toast warning
    warning(`MCP server "${serverName}" disconnected`, 'Request stopped. Choose how to continue below.');

    // Inject a recovery prompt into the chat
    state.addMessage({
      role: 'error',
      content: `${MCP_DISCONNECT_PREFIX}${serverName}`,
    });

    // Auto-reconnect in the background (fire and forget)
    if (server) {
      chrome.runtime.sendMessage({ type: 'MCP_CONNECT', config: server })
        .then((result) => {
          if (result?.success) {
            useStore.getState().updateMCPServer(server.id, {
              connected: true,
              toolCount: result.tools?.length || 0,
            });
          }
        })
        .catch(() => {});
    }
  }, [warning, streamProcessor]);

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

      const execution = await executeChatToolCall(tc, handleMCPDisconnect);
      if (execution === 'suspended') {
        finishRequestAsSuspended();
        return;
      }
      if (execution === 'disconnected') return;
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

    const currentModel = store.providerConfig.model || '';
    const prepared = prepareChatRequest({
      getState: () => useStore.getState(),
      rawTools: tools,
      supportsFunctionCalling: supportsFunctionCalling(currentModel),
    });
    requestToolsRef.current = prepared.tools;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: msgs,
        providerConfig: store.providerConfig,
        tools: prepared.tools,
        options: prepared.options,
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
  }, [store, buildAPIMessages, getAllTools, supportsFunctionCalling, streamProcessor, handleMCPDisconnect]);

  /**
   * Finish stream and create assistant message
   */
  const finishStream = useCallback(
    (
      fullContent: string,
      toolCalls?: ToolCall[],
      _groundingMetadata?: GroundingMetadata,
      generatedImages?: GeneratedImage[],
      reasoningContent?: string,
      reasoningSignature?: string,
      usage?: TokenUsage,
    ) => {
      const result = streamProcessor.getFinalResult(fullContent, reasoningContent);

      // Capture request/conv identity before state is reset below
      const preResetState = useStore.getState();
      const requestId = preResetState.currentRequestId;
      const activeConvId = preResetState.activeConversationId;

      // Add assistant message
      // Use toolCalls from parameter (sent by background via CHAT_STREAM_DONE) as primary source,
      // fall back to result.toolCalls from streamProcessor for client-side processed chunks.
      const finalToolCalls = (toolCalls && toolCalls.length > 0) ? toolCalls : result.toolCalls;
      // Images are sent via CHAT_STREAM_DONE (too large for individual chunks), so prefer the
      // parameter value. Fall back to result.images for any client-side path that uses processChunk.
      const finalImages = (generatedImages && generatedImages.length > 0) ? generatedImages : result.images;
      const assistantMsg: {
        role: 'assistant';
        content: string;
        toolCalls?: ToolCall[];
        groundingMetadata?: GroundingMetadata;
        generatedImages?: GeneratedImage[];
        reasoningContent?: string;
        reasoningSignature?: string;
        usage?: TokenUsage;
        toolsTokens?: number;
        toolNames?: string[];
      } = {
        role: 'assistant',
        content: result.content || '',
        ...(finalToolCalls && finalToolCalls.length > 0 && { toolCalls: finalToolCalls }),
        ...(result.groundingMetadata && { groundingMetadata: result.groundingMetadata }),
        ...(finalImages && finalImages.length > 0 && { generatedImages: finalImages }),
        ...(result.reasoningContent && { reasoningContent: result.reasoningContent }),
        ...(reasoningSignature && { reasoningSignature }),
        ...(usage && { usage }),
        ...toolSnapshot(requestToolsRef.current),
      };

      store.addMessage(assistantMsg);

      // Reset state
      store.setStreamingContent('');
      store.setStreamingReasoningContent('');
      streamProcessor.reset();
      // Clear per-conversation streaming state (handleToolCalls will re-set it if needed)
      if (!toolCalls || toolCalls.length === 0) {
        if (activeConvId) store.setConversationStreaming(activeConvId, null);
      }
      store.setIsStreaming(false);
      store.setCurrentRequestId(null);
      const savePromise = store.saveActiveConversation();
      store.updateConversationTimestamp();

      // Once persisted, remove the background buffer so the recovery logic on a
      // future sidebar reopen does not append this message a second time.
      savePromise.then(() => {
        notifyStreamConsumed(requestId, activeConvId);
      });

      // Extract memories if no tool calls
      if (store.memoryEnabled && !toolCalls?.length) {
        const currentMessages = [...store.messages, assistantMsg];
        setTimeout(() => extractMemories(currentMessages), 100);
      }

      // Auto-generate title
      if (!toolCalls?.length && store.activeConversationId) {
        const conv = store.conversations.find((c) => c.id === store.activeConversationId);
        if (conv?.title === 'New Chat') {
          const capturedConvId = store.activeConversationId;
          setTimeout(() => generateConversationTitle(capturedConvId, true), 1500);
        }
      }

      // Handle tool calls
      if (toolCalls && toolCalls.length > 0) {
        handleToolCalls(toolCalls);
      }

      return null;
    },
    [store, streamProcessor, extractMemories, handleToolCalls, notifyStreamConsumed]
  );

  /**
   * Handle stream error
   */
  const handleStreamError = useCallback((error: string) => {
    void (async () => {
      const state = useStore.getState();
      const activeConvId = state.activeConversationId;
      const requestId = state.currentRequestId;

      const partialContent = state.streamingContent;
      const partialReasoning = state.streamingReasoningContent;
      if (partialContent.trim()) {
        store.addMessage({
          role: 'assistant',
          content: partialContent,
          ...(partialReasoning ? { reasoningContent: partialReasoning } : {}),
          truncated: true,
          truncatedReason: 'network_error',
        });
      }

      const recovered = await tryOverflowRecovery(error, Boolean(partialContent.trim()));
      if (recovered) {
        notifyStreamConsumed(requestId, activeConvId);
        store.setStreamingContent('');
        store.setStreamingReasoningContent('');
        streamProcessor.reset();
        const msgs = buildAPIMessages(useStore.getState().messages);
        const tools = await getAllTools();
        const model = useStore.getState().providerConfig.model || '';
        const prepared = prepareChatRequest({
          getState: () => useStore.getState(),
          rawTools: tools,
          supportsFunctionCalling: supportsFunctionCalling(model),
        });
        const retryId = `req_${Date.now()}`;
        useStore.getState().setIsStreaming(true);
        useStore.getState().setCurrentRequestId(retryId);
        if (activeConvId) {
          useStore.getState().setConversationStreaming(activeConvId, { requestId: retryId });
        }
        const failRetry = () => {
          useStore.getState().addMessage({
            role: 'error',
            content: 'Context overflow recovery failed after one compact-and-retry attempt.',
          });
          if (activeConvId) useStore.getState().setConversationStreaming(activeConvId, null);
          notifyStreamConsumed(retryId, activeConvId);
          useStore.getState().setIsStreaming(false);
          useStore.getState().setCurrentRequestId(null);
          useStore.getState().setStreamingContent('');
          useStore.getState().setStreamingReasoningContent('');
          streamProcessor.reset();
        };
        try {
          const response = await chrome.runtime.sendMessage({
            type: 'CHAT_REQUEST',
            messages: msgs,
            providerConfig: useStore.getState().providerConfig,
            tools: prepared.tools,
            options: prepared.options,
            requestId: retryId,
            conversationId: activeConvId,
          });
          if (response?.error) {
            failRetry();
          }
        } catch {
          failRetry();
        }
        return;
      }

      if (activeConvId) store.setConversationStreaming(activeConvId, null);
      store.addMessage({ role: 'error', content: error });
      notifyStreamConsumed(requestId, activeConvId);
      store.setIsStreaming(false);
      store.setCurrentRequestId(null);
      store.setStreamingContent('');
      store.setStreamingReasoningContent('');
      streamProcessor.reset();
    })();
  }, [store, streamProcessor, notifyStreamConsumed, tryOverflowRecovery, buildAPIMessages, getAllTools, supportsFunctionCalling]);

  // Recovery: query background untuk streaming yang berjalan saat sidebar tutup
  const hasRecoveredRef = useRef(false);

  useEffect(() => {
    if (hasRecoveredRef.current) return;

    const tryRecover = () => {
      if (hasRecoveredRef.current) return;
      const state = useStore.getState();
      if (!state.storageReady) return;
      hasRecoveredRef.current = true;

      chrome.runtime.sendMessage({ type: 'GET_ACTIVE_STREAMS' })
        .then(async (response: ActiveStreamsResponse) => {
          if (!response?.streams) return;
          const entries = Object.entries(response.streams) as [string, StreamingBufferEntry][];
          if (entries.length === 0) return;

          let currentState = useStore.getState();

          // If startOnWelcome causes no active conversation but there is an active stream,
          // ignore startOnWelcome and navigate the user to the conversation that is streaming.
          // Prefer in_progress (most urgently needs recovery), fall back to the first entry.
          if (!currentState.activeConversationId) {
            const preferred = entries.find(([, e]) => e.status === 'in_progress') ?? entries[0];
            const [targetConvId] = preferred;
            try {
              await useStore.getState().switchConversation(targetConvId);
              currentState = useStore.getState();
            } catch {
              // switchConversation gagal — lanjut dengan activeConversationId null
            }
          }

          for (const [convId, entry] of entries) {
            // Skip jika sudah diproses (guard double processing)
            if (processedDoneRequestsRef.current.has(entry.requestId)) continue;

            if (entry.status === 'completed') {
              processedDoneRequestsRef.current.add(entry.requestId);
              if (convId === currentState.activeConversationId) {
                // Active conv selesai streaming saat sidebar tutup — finalize ke UI
                useStore.setState({
                  isStreaming: true,
                  currentRequestId: entry.requestId,
                  streamingContent: entry.chunks.join(''),
                  streamingReasoningContent: entry.reasoningChunks.join(''),
                });
                finishStream(
                  entry.fullContent || entry.chunks.join(''),
                  entry.toolCalls,
                  entry.groundingMetadata as GroundingMetadata | undefined,
                  entry.images as GeneratedImage[] | undefined,
                  entry.reasoningContent,
                  entry.reasoningSignature,
                  entry.usage,
                );
              } else {
                // Background conv — save ke IDB
                handleBackgroundStreamDone(convId, entry.requestId, {
                  fullContent: entry.fullContent || entry.chunks.join(''),
                  reasoningContent: entry.reasoningContent,
                  reasoningSignature: entry.reasoningSignature,
                  toolCalls: entry.toolCalls,
                  usage: entry.usage,
                });
              }
            } else if (entry.status === 'in_progress') {
              const partial = entry.chunks.join('');
              const partialReasoning = entry.reasoningChunks.join('');
              if (convId === currentState.activeConversationId) {
                // Active conv masih streaming — restore state agar listener utama bisa lanjut
                useStore.setState({
                  isStreaming: true,
                  currentRequestId: entry.requestId,
                  streamingContent: partial,
                  streamingReasoningContent: partialReasoning,
                });
              } else {
                // Background conv — restore agar background message terus di-akumulasi
                currentState.setConversationStreaming(convId, {
                  requestId: entry.requestId,
                  streamingContent: partial,
                });
              }
            } else if (entry.status === 'error') {
              if (convId === currentState.activeConversationId) {
                useStore.getState().addMessage({
                  role: 'error',
                  content: entry.errorMessage || 'Stream error',
                });
                useStore.setState({ isStreaming: false, currentRequestId: null, streamingContent: '' });
              } else {
                currentState.setConversationStreaming(convId, null);
              }
              // Error surfaced/cleared — remove the buffer so recovery doesn't repeat it
              notifyStreamConsumed(entry.requestId, convId);
            }
          }
        })
        .catch(() => {
          // Background mungkin belum siap — tidak apa-apa
        });
    };

    // Check if storageReady is already true before subscribing
    if (useStore.getState().storageReady) {
      tryRecover();
      return;
    }

    // Subscribe dan tunggu storageReady signal
    const unsub = useStore.subscribe((state) => {
      if (state.storageReady) {
        unsub();
        tryRecover();
      }
    });
    return () => unsub();
  }, [finishStream, handleBackgroundStreamDone, notifyStreamConsumed]);

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
          handleBackgroundStreamDone(bgConvId, message.requestId, message);
        } else if (message.type === 'CHAT_STREAM_ERROR') {
          handleBackgroundStreamError(bgConvId, message.requestId);
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
            message.reasoningSignature,
            message.usage,
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
