import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { ToolCall, GroundingMetadata, MCPTool, GeneratedImage } from '../types/index.ts';
import { GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS } from '../providers.ts';
import { useMemory } from './useMemory.ts';

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
  const toolCallsRef = useRef<ToolCall[]>([]);
  const currentToolCallRef = useRef<Partial<ToolCall> | null>(null);
  const groundingMetadataRef = useRef<GroundingMetadata | null>(null);
  const imagesRef = useRef<GeneratedImage[]>([]);

  const handleToolCalls = useCallback(async (toolCalls: ToolCall[]) => {
    store.setIsStreaming(true);

    for (const tc of toolCalls) {
      if (!tc.name) continue;

      let args = {};
      try {
        args = JSON.parse(tc.arguments || '{}');
      } catch {
        args = {}
      }

      // Add "calling" status message
      store.addMessage({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name,
        content: '⏳ Calling...',
      });

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'MCP_CALL_TOOL',
          name: tc.name,
          arguments: args,
        });

        const resultText =
          result?.content?.map((c: { text?: string }) => c.text || JSON.stringify(c)).join('\n') ||
          JSON.stringify(result);

        // Update last message with result
        const messages = store.messages;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'tool' && lastMsg.toolCallId === tc.id) {
          lastMsg.content = resultText;
          store.setMessages([...messages]);
        } else {
          store.addMessage({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: resultText,
          });
        }
      } catch (e) {
        // Update last message with error
        const messages = store.messages;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.role === 'tool' && lastMsg.toolCallId === tc.id) {
          lastMsg.content = `Error: ${(e as Error).message}`;
          store.setMessages([...messages]);
        } else {
          store.addMessage({
            role: 'tool',
            toolCallId: tc.id,
            name: tc.name,
            content: `Error: ${(e as Error).message}`,
          });
        }
      }
    }

    // Build API messages
    const msgs: any[] = [];
    const systemContent = store.providerConfig.systemPrompt || '';
    if (systemContent) {
      msgs.push({ role: 'system', content: systemContent });
    }

    for (const msg of store.messages) {
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const assistantMsg: any = { role: 'assistant', content: msg.content || '' };
        assistantMsg.toolCalls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments || '{}',
        }));
        msgs.push(assistantMsg);
      } else if (msg.role === 'tool') {
        msgs.push({
          role: 'tool',
          toolCallId: msg.toolCallId,
          name: msg.name,
          content: msg.content,
        });
      } else if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
        msgs.push({ role: msg.role, content: msg.content });
      }
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

    const currentModel = store.providerConfig.model || '';
    const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';
    const supportsFunctionCalling = !isGemini || (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) && !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel));

    const chatOptions = {
      enableGoogleSearch:
        store.enableGoogleSearch &&
        isGemini &&
        !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
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
  }, [store]);

  const finishStream = useCallback((fullContent: string, toolCalls?: ToolCall[], groundingMetadata?: GroundingMetadata, generatedImages?: GeneratedImage[]) => {
    // Add inline citations if grounding metadata exists
    const contentWithCitations = addInlineCitations(fullContent, groundingMetadata);

    // Only add assistant message if there's content OR no tool calls
    if (contentWithCitations || !toolCalls || toolCalls.length === 0 || (generatedImages && generatedImages.length > 0)) {
      const assistantMsg: { role: 'assistant'; content: string; toolCalls?: ToolCall[]; groundingMetadata?: GroundingMetadata; generatedImages?: GeneratedImage[] } = { role: 'assistant', content: contentWithCitations || '' };
      if (toolCalls && toolCalls.length > 0) {
        assistantMsg.toolCalls = toolCalls;
      }
      if (groundingMetadata) {
        assistantMsg.groundingMetadata = groundingMetadata;
      }
      if (generatedImages && generatedImages.length > 0) {
        assistantMsg.generatedImages = generatedImages;
      }
      store.addMessage(assistantMsg);
    }

    // Reset state
    store.setStreamingContent('');
    toolCallsRef.current = [];
    currentToolCallRef.current = null;
    groundingMetadataRef.current = null;
    imagesRef.current = [];

    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.saveActiveConversation();
    store.updateConversationTimestamp();

    // Extract memories automatically after response
    if (store.memoryEnabled && !toolCalls?.length) {
      setTimeout(() => extractMemories(), 1000);
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
            const isImageModel = GEMINI_NO_TOOLS_MODELS.includes(currentModel) || GEMINI_SEARCH_ONLY_MODELS.includes(currentModel);
            const titleProviderConfig = isImageModel
              ? { ...store.providerConfig, model: 'gemini-2.5-flash-lite' }
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

  useEffect(() => {
    const listener = (message: {
      type: string;
      requestId?: string;
      content?: string;
      fullContent?: string;
      toolCalls?: ToolCall[];
      groundingMetadata?: GroundingMetadata;
      images?: GeneratedImage[];
      error?: string;
    }) => {
      const currentRequestId = store.currentRequestId;
      if (message.requestId !== currentRequestId) return;

      switch (message.type) {
        case 'CHAT_STREAM_CHUNK':
          if (message.content) {
            const currentContent = useStore.getState().streamingContent;
            store.setStreamingContent(currentContent + message.content);
          }
          break;

        case 'CHAT_STREAM_DONE':
          const finalContent = message.fullContent || useStore.getState().streamingContent;
          finishStream(
            finalContent,
            message.toolCalls || toolCallsRef.current,
            message.groundingMetadata || groundingMetadataRef.current || undefined,
            message.images || imagesRef.current
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
