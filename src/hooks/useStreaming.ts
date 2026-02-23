import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { ToolCall, GroundingMetadata, MCPTool, GeneratedImage } from '../types/index.ts';
import { GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS, XAI_IMAGE_MODELS } from '../providers.ts';
import { useMemory } from './useMemory.ts';
import { useChat } from './useChat.ts';

function addInlineCitations(text: string, groundingMetadata?: GroundingMetadata): string {
  if (!groundingMetadata?.groundingSupports || !groundingMetadata?.groundingChunks) {
    return text;
  }

  const supports = groundingMetadata.groundingSupports;
  const chunks = groundingMetadata.groundingChunks;

  // Sort by endIndex descending to avoid index shifting
  const sorted = [...supports].sort((a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0));

  let result = text;
  for (const support of sorted) {
    const endIndex = support.segment?.endIndex;
    if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;

    const citations = support.groundingChunkIndices
      .filter(i => i < chunks.length)
      .map(i => `[${i + 1}]`)
      .join('');

    if (citations) {
      result = result.slice(0, endIndex) + citations + result.slice(endIndex);
    }
  }

  return result;
}

export function useStreaming() {
  const store = useStore();
  const { extractMemories } = useMemory();
  const { buildAPIMessagesFromList } = useChat();
  const toolCallsRef = useRef<ToolCall[]>([]);
  const currentToolCallRef = useRef<Partial<ToolCall> | null>(null);
  const groundingMetadataRef = useRef<GroundingMetadata | null>(null);
  const imagesRef = useRef<GeneratedImage[]>([]);
  const processedToolCallsRef = useRef<Set<string>>(new Set());
  const reasoningContentRef = useRef<string>('');

  const handleToolCalls = useCallback(async (toolCalls: ToolCall[]) => {
    // Check if these specific tool calls have already been processed
    // This prevents double execution of the same tool calls
    const toolCallKey = toolCalls.map(tc => tc.id).sort().join(',');
    if (processedToolCallsRef.current.has(toolCallKey)) {
      console.log('[useStreaming] Tool calls already processed, skipping:', toolCallKey);
      return;
    }

    processedToolCallsRef.current.add(toolCallKey);

    // Clean up old processed keys if too many
    if (processedToolCallsRef.current.size > 50) {
      const iterator = processedToolCallsRef.current.values();
      const first = iterator.next();
      if (!first.done) {
        processedToolCallsRef.current.delete(first.value);
      }
    }

    // Set streaming to true for tool execution
    store.setIsStreaming(true);

    for (const tc of toolCalls) {
      // Check if streaming was cancelled during loop
      if (!useStore.getState().isStreaming) {
        console.log('[useStreaming] Streaming cancelled during tool calls, aborting remaining');
        return;
      }

      if (!tc.name) continue;

      let args = {};
      try {
        args = JSON.parse(tc.arguments || '{}');
      } catch {
        args = {}
      }

      // Guard: check if an identical tool call (same name + same arguments) was already
      // successfully executed in this conversation. If so, return its cached result
      // directly to the agent instead of calling the tool again.
      const argsKey = JSON.stringify(args);
      const freshMsgs = useStore.getState().messages;
      const previousSuccessful = freshMsgs.find(
        (m) =>
          m.role === 'tool' &&
          m.name === tc.name &&
          JSON.stringify(m.toolArguments ?? {}) === argsKey &&
          m.content !== '⏳ Calling...' &&
          !m.content.startsWith('Error:')
      );

      if (previousSuccessful) {
        console.log('[useStreaming] Duplicate tool call detected, reusing cached result:', tc.name, argsKey);
        store.addMessage({
          role: 'tool',
          toolCallId: tc.id,
          name: tc.name,
          content: '[DUPLICATE_CALL_SKIPPED] This exact tool call was already executed with identical arguments. Refer to the previous result already in context.',
          toolArguments: args as Record<string, unknown>,
          isCachedResult: true,
        });
        continue;
      }

      // Add "calling" status message with arguments
      store.addMessage({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: '⏳ Calling...',
        toolArguments: args as Record<string, unknown>,
      });

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

        // Use fresh state to avoid stale closure race condition with multiple tool calls
        const freshMessages = useStore.getState().messages;
        const callingIdx = [...freshMessages].reverse().findIndex((m) => 
          m.role === 'tool' && 
          String(m.toolCallId) === String(tc.id) &&
          String(m.content).includes('Calling...')
        );
        
        if (callingIdx !== -1) {
          const actualIdx = (freshMessages.length - 1) - callingIdx;
          const updated = [...freshMessages];
          updated[actualIdx] = { ...updated[actualIdx], content: resultText };
          store.setMessages(updated);
        } else {
          store.addMessage({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: resultText,
            toolArguments: args as Record<string, unknown>,
          });
        }
      } catch (e) {
        // Use fresh state to avoid stale closure race condition with multiple tool calls
        const freshMessages = useStore.getState().messages;
        const callingIdx = [...freshMessages].reverse().findIndex((m) => 
          m.role === 'tool' && 
          String(m.toolCallId) === String(tc.id) &&
          String(m.content).includes('Calling...')
        );

        if (callingIdx !== -1) {
          const actualIdx = (freshMessages.length - 1) - callingIdx;
          const updated = [...freshMessages];
          updated[actualIdx] = { ...updated[actualIdx], content: `Error: ${(e as Error).message}` };
          store.setMessages(updated);
        } else {
          store.addMessage({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: `Error: ${(e as Error).message}`,
            toolArguments: args as Record<string, unknown>,
          });
        }
      }
    }

    // Build API messages using fresh state to avoid stale closure race condition
    // (OpenAI, Anthropic-compatible, Gemini, etc.)
    const msgs = buildAPIMessagesFromList(useStore.getState().messages);

    // Check if streaming was cancelled before sending follow-up request
    if (!useStore.getState().isStreaming) {
      console.log('[useStreaming] Streaming cancelled, not sending follow-up request');
      return;
    }

    // Get MCP tools
    let tools: MCPTool[] = [];
    try {
      const mcpRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
      if (mcpRes?.tools) {
        const enabledServerIds = new Set(
          store.mcpServers.filter((s) => s.enabled !== false).map((s) => s.id)
        );
        tools = mcpRes.tools.filter((tool: MCPTool & { _serverId?: string }) =>
          enabledServerIds.has(tool._serverId || '')
        );
      }
    } catch {}

    const requestId = `req_${Date.now()}`;
    store.setCurrentRequestId(requestId);
    store.setStreamingContent('');
    store.setStreamingReasoningContent('');

    const currentModel = store.providerConfig.model || '';
    const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';

    // Inject google_search tool for non-Gemini providers when enabled
    if (!isGemini && store.enableGoogleSearchTool && store.googleSearchApiKey) {
      tools = [
        {
          name: 'google_search',
          description: 'Search the web using Google. Use this to find current information, news, facts, or any topic that requires up-to-date web search results.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query to look up on the web' },
            },
            required: ['query'],
          },
        },
        ...tools,
      ];
    }
    const supportsFunctionCalling = !isGemini || (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) && !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel));

    if (supportsFunctionCalling) {
      tools = [
        ...tools,
        {
          name: 'continue_message',
          description: 'Use this tool to continue your response in a new message chunk. This is useful when you have more to say but want to break it up, or if you want to perform a chain of thought before the next response.',
          inputSchema: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'Brief reason why you are continuing' },
            },
            required: ['reason'],
          },
        },
      ];
    }

    const chatOptions = {
      enableGoogleSearch:
        store.enableGoogleSearch &&
        isGemini &&
        !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
      enableReasoning: store.enableReasoning,
    };

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: msgs,
        providerConfig: store.providerConfig,
        tools: supportsFunctionCalling ? tools : [],
        options: chatOptions,
        requestId,
      });

      if (response?.error) {
        store.addMessage({ role: 'error', content: response.error });
        store.setIsStreaming(false);
      }
    } catch (e) {
      store.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      store.setIsStreaming(false);
    }
  }, [store, buildAPIMessagesFromList]);

  const finishStream = useCallback((fullContent: string, toolCalls?: ToolCall[], groundingMetadata?: GroundingMetadata, generatedImages?: GeneratedImage[], reasoningContent?: string) => {
    // Add inline citations if grounding metadata exists
    const contentWithCitations = addInlineCitations(fullContent, groundingMetadata);

    // Always add assistant message - needed for tool call context in follow-up requests
    const assistantMsg: { role: 'assistant'; content: string; toolCalls?: ToolCall[]; groundingMetadata?: GroundingMetadata; generatedImages?: GeneratedImage[]; reasoningContent?: string } = { role: 'assistant', content: contentWithCitations || '' };
    if (toolCalls && toolCalls.length > 0) {
      assistantMsg.toolCalls = toolCalls;
    }
    if (groundingMetadata) {
      assistantMsg.groundingMetadata = groundingMetadata;
    }
    if (generatedImages && generatedImages.length > 0) {
      assistantMsg.generatedImages = generatedImages;
    }
    if (reasoningContent) {
      assistantMsg.reasoningContent = reasoningContent;
    }
    store.addMessage(assistantMsg);

    // Reset state
    store.setStreamingContent('');
    store.setStreamingReasoningContent('');
    toolCallsRef.current = [];
    currentToolCallRef.current = null;
    groundingMetadataRef.current = null;
    imagesRef.current = [];
    reasoningContentRef.current = '';

    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.saveActiveConversation();
    store.updateConversationTimestamp();

    // Extract memories automatically after response (only if no tool calls)
    // When tool calls exist, memory extraction happens after the follow-up response
    if (store.memoryEnabled && !toolCalls?.length) {
      // Build complete message list including current assistant message
      // to ensure memory extraction has full context
      const currentMessages = [...store.messages, assistantMsg];

      // Delay slightly to allow state to commit, then extract with explicit messages
      setTimeout(() => {
        extractMemories(currentMessages);
      }, 100);
    }

    // Auto-generate title after first exchange
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
            const isGeminiImageModel = GEMINI_NO_TOOLS_MODELS.includes(currentModel) || GEMINI_SEARCH_ONLY_MODELS.includes(currentModel);
            const isXAIImageModel = store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
            const titleProviderConfig = isGeminiImageModel
              ? { ...store.providerConfig, model: 'gemini-2.5-flash-lite' }
              : isXAIImageModel
                ? { ...store.providerConfig, model: 'grok-4-1-fast-non-reasoning' }
                : store.providerConfig;
            const response = await chrome.runtime.sendMessage({
              type: 'TITLE_GENERATE',
              messages: [
                { role: 'system', content: 'Generate a concise 3-5 word title for this conversation. Return ONLY the title, no quotes, no explanation.' },
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

    // Handle tool calls - the agentic loop
    // Process tool calls if they exist
    if (toolCalls && toolCalls.length > 0) {
      handleToolCalls(toolCalls);
    }

    return null;
  }, [store, handleToolCalls, extractMemories]);

  const handleStreamError = useCallback((error: string) => {
    store.addMessage({ role: 'error', content: error });
    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.setStreamingContent('');
    toolCallsRef.current = [];
    currentToolCallRef.current = null;
  }, [store]);

  // Track processed request IDs to prevent double processing
  const processedDoneRequestsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const listener = (message: {
      type: string;
      requestId?: string;
      content?: string;
      fullContent?: string;
      reasoningContent?: string;
      chunkType?: string;
      toolCalls?: ToolCall[];
      groundingMetadata?: GroundingMetadata;
      images?: GeneratedImage[];
      error?: string;
    }) => {
      const currentRequestId = store.currentRequestId;
      if (message.requestId !== currentRequestId) return;

      switch (message.type) {
        case 'CHAT_STREAM_CHUNK':
          if (message.chunkType === 'reasoning' && message.content) {
            // Handle reasoning content - update both ref and store for real-time display
            reasoningContentRef.current += message.content;
            store.setStreamingReasoningContent(reasoningContentRef.current);
          } else if (message.content) {
            const currentContent = useStore.getState().streamingContent;
            store.setStreamingContent(currentContent + message.content);
          }
          break;

        case 'CHAT_STREAM_DONE':
          // Guard: prevent processing the same request twice
          if (message.requestId && processedDoneRequestsRef.current.has(message.requestId)) {
            console.log('[useStreaming] CHAT_STREAM_DONE already processed for', message.requestId);
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

          const finalContent = message.fullContent || useStore.getState().streamingContent;
          const finalReasoningContent = message.reasoningContent || reasoningContentRef.current || undefined;
          finishStream(
            finalContent,
            message.toolCalls || toolCallsRef.current,
            message.groundingMetadata || groundingMetadataRef.current || undefined,
            message.images || imagesRef.current,
            finalReasoningContent
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
  }, [finishStream, handleStreamError]);
}
