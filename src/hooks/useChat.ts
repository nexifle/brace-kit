import { useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { Message, ToolCall, Attachment } from '../types/index.ts';
import { PROVIDER_PRESETS } from '../providers.ts';
import type { MCPTool } from '../types/index.ts';
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from '../types/index.ts';

export function useChat() {
  const store = useStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  const getProvider = useCallback((providerId: string) => {
    if (PROVIDER_PRESETS[providerId]) return PROVIDER_PRESETS[providerId];
    const custom = store.customProviders.find((cp) => cp.id === providerId);
    if (custom) return custom;
    return PROVIDER_PRESETS.openai;
  }, [store.customProviders]);

  const isCustomProvider = useCallback((providerId: string) => {
    return store.customProviders.some((cp) => cp.id === providerId);
  }, [store.customProviders]);

  const buildMemoryBlock = useCallback(() => {
    if (!store.memoryEnabled || store.memories.length === 0) return '';

    let block = '\n\n[User Memory - Use these insights to personalize responses]\n';
    for (const cat of MEMORY_CATEGORIES) {
      const items = store.memories.filter((m) => m.category === cat);
      if (items.length === 0) continue;
      const label = MEMORY_CATEGORY_LABELS[cat].replace(/^[^\s]+\s/, ''); // Remove emoji
      block += `\n${label}:\n`;
      for (const item of items) {
        block += `- ${item.content}\n`;
      }
    }
    return block;
  }, [store.memoryEnabled, store.memories]);

  const formatMessageForAPI = useCallback((msg: Message): Message | null => {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      const assistantMsg: Message = { role: 'assistant', content: msg.content || '' };
      assistantMsg.toolCalls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments || '{}',
      }));
      return assistantMsg;
    } else if (msg.role === 'tool') {
      return {
        role: 'tool',
        toolCallId: msg.toolCallId,
        name: msg.name,
        content: msg.content,
      };
    } else if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
      const content: { type: string; text?: string; image_url?: { url: string } }[] = [];

      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }

      for (const att of msg.attachments) {
        if (att.type === 'image') {
          content.push({
            type: 'image_url',
            image_url: { url: att.data },
          });
        }
      }

      return { role: msg.role, content };
    } else if (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') {
      return { role: msg.role, content: msg.content };
    }
    return null;
  }, []);

  const buildAPIMessages = useCallback((): Message[] => {
    const msgs: Message[] = [];

    const memoryBlock = buildMemoryBlock();
    const systemContent = (store.providerConfig.systemPrompt || '') + memoryBlock;
    if (systemContent) {
      msgs.push({ role: 'system', content: systemContent });
    }

    for (const msg of store.messages) {
      const formatted = formatMessageForAPI(msg);
      if (formatted) {
        msgs.push(formatted);
      }
    }

    return msgs;
  }, [store.messages, store.providerConfig.systemPrompt, buildMemoryBlock, formatMessageForAPI]);

  const sendMessage = useCallback(async (text: string) => {
    if (store.isStreaming) return;

    const validAttachments = store.attachments.filter((a) => a.type !== 'error');
    if ((!text && validAttachments.length === 0)) return;

    // Ensure we have an active conversation
    if (!store.activeConversationId) {
      store.createConversation();
    }

    // Auto-title from first user message
    if (store.messages.length === 0) {
      const titleText = text || `Attached: ${validAttachments.map((a) => a.name).join(', ')}`;
      const conv = store.conversations.find((c) => c.id === store.activeConversationId);
      if (conv && conv.title === 'New Chat') {
        conv.title = titleText.slice(0, 50) + (titleText.length > 50 ? '…' : '');
        store.saveToStorage();
      }
    }

    // Build user message content
    let userContent = text;

    // Attach page context if available
    if (store.pageContext) {
      userContent = `[Page Context]\nTitle: ${store.pageContext.pageTitle}\nURL: ${store.pageContext.pageUrl}\n${store.pageContext.metaDescription ? `Description: ${store.pageContext.metaDescription}\n` : ''}\nContent:\n${store.pageContext.content}\n\n[User Message]\n${text || ''}`;
    }

    // Attach selected text if available
    if (store.selectedText) {
      const selPrefix = store.pageContext
        ? ''
        : `[From: ${store.selectedText.pageTitle}]\n`;
      userContent = `${selPrefix}[Selected Text]\n"${store.selectedText.selectedText}"\n\n[User Message]\n${text || ''}`;
    }

    // Add file attachments to message
    let messageAttachments: Attachment[] | undefined;
    if (validAttachments.length > 0) {
      messageAttachments = validAttachments.map((att) => ({
        type: att.type as 'image' | 'text' | 'pdf',
        name: att.name,
        data: att.data || '',
      }));

      // For text files, append content to message
      const textAttachments = validAttachments.filter((a) => a.type === 'text');
      for (const att of textAttachments) {
        userContent += `\n\n[File: ${att.name}]\n${att.data}`;
      }

      // For PDFs, add note
      const pdfAttachments = validAttachments.filter((a) => a.type === 'pdf');
      for (const att of pdfAttachments) {
        userContent += `\n\n[File: ${att.name}]\n[PDF file attached - text extraction not available in browser]`;
      }
    }

    // Add to state
    const messageData: Message = { role: 'user', content: userContent, displayContent: text };
    if (messageAttachments && messageAttachments.some((a) => a.type === 'image')) {
      messageData.attachments = messageAttachments.filter((a) => a.type === 'image');
    }
    store.addMessage(messageData);

    // Clear selection and attachments
    store.setSelectedText(null);
    store.clearAttachments();

    // Build messages for API - include all messages from store + format them
    const apiMessages: Message[] = [];

    const memoryBlock = buildMemoryBlock();
    const systemContent = (store.providerConfig.systemPrompt || '') + memoryBlock;
    if (systemContent) {
      apiMessages.push({ role: 'system', content: systemContent });
    }

    // Add all existing messages
    for (const msg of store.messages) {
      const formatted = formatMessageForAPI(msg);
      if (formatted) {
        apiMessages.push(formatted);
      }
    }

    // Add the new user message
    const formattedNewMessage = formatMessageForAPI(messageData);
    if (formattedNewMessage) {
      apiMessages.push(formattedNewMessage);
    }

    // Get MCP tools from enabled servers only
    let tools: MCPTool[] = [];
    try {
      console.log('[useChat] Fetching MCP tools, mcpServers:', store.mcpServers);
      const mcpRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
      console.log('[useChat] MCP response:', mcpRes);
      if (mcpRes?.tools) {
        const enabledServerIds = new Set(
          store.mcpServers.filter((s) => s.enabled !== false).map((s) => s.id)
        );
        console.log('[useChat] Enabled server IDs:', Array.from(enabledServerIds));
        tools = mcpRes.tools.filter((tool: MCPTool & { _serverId?: string }) =>
          enabledServerIds.has(tool._serverId || '')
        );
        console.log('[useChat] Filtered tools:', tools);
      }
    } catch (err) {
      console.log('[useChat] Error fetching MCP tools:', err);
      // no MCP tools
    }

    // Start streaming
    store.setIsStreaming(true);
    store.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    store.setCurrentRequestId(requestId);

    // Build options for provider-specific features
    const chatOptions = {
      enableGoogleSearch:
        store.enableGoogleSearch &&
        (store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini'),
    };

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: store.providerConfig,
        tools,
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
  }, [store, buildAPIMessages]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const requestId = store.currentRequestId;
    if (requestId) {
      chrome.runtime.sendMessage({
        type: 'STOP_STREAM',
        requestId,
      });
    }
    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.setStreamingContent('');
  }, [store]);

  const newChat = useCallback(() => {
    store.saveActiveConversation();
    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.setStreamingContent('');
    store.setPageContext(null);
    store.setSelectedText(null);
    store.clearAttachments();
    store.createConversation();
    store.setView('chat');
    store.setHistoryDrawerOpen(false);
  }, [store]);

  return {
    sendMessage,
    stopStreaming,
    newChat,
    getProvider,
    isCustomProvider,
    buildAPIMessages,
  };
}
