/**
 * useChat Hook (Simplified)
 *
 * Main chat operations hook using extracted sub-hooks.
 * Uses useMessageBuilder for message building, useTools for tool management,
 * and useAutoCompact for conversation compaction.
 */

import { useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { Message, Attachment, APIMessage, PageContext, SelectedText, ToolCall } from '../types/index.ts';
import { TITLE_GENERATION_SYSTEM_PROMPT } from '../types/index.ts';
import { saveConversationMessages } from '../utils/conversationDB.ts';
import { getProvider as getProviderUtil, isCustomProvider as isCustomProviderUtil } from '../utils/providerUtils.ts';
import { useMessageBuilder } from './chat/useMessageBuilder.ts';
import { useTools } from './tools/useTools.ts';
import { useAutoCompact } from './compact/index.ts';

export function useChat() {
  const store = useStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use extracted hooks
  const { buildAPIMessages, estimateTokenCount } = useMessageBuilder();
  const { getAllTools, supportsFunctionCalling, isXAIImageModel, isGeminiImageModel, getChatOptions } = useTools();
  const { compactConversation, checkAndAutoCompact } = useAutoCompact();

  const getProvider = useCallback(
    (providerId: string) => getProviderUtil(providerId, store.customProviders),
    [store.customProviders]
  );

  const isCustomProvider = useCallback(
    (providerId: string) => isCustomProviderUtil(providerId, store.customProviders),
    [store.customProviders]
  );

  const renameConversation = useCallback(async () => {
    const currentState = useStore.getState();
    if (!currentState.activeConversationId || currentState.messages.length === 0) return;

    currentState.setIsRenaming(true);

    // Check total multi-turn messages (user + assistant)
    const multiTurnMessages = currentState.messages.filter(
      (m) => m.role === 'user' || m.role === 'assistant'
    );

    let titleMessages: { role: 'user' | 'assistant'; content: string }[];

    // If <= 5 turns, send all user + assistant messages
    if (multiTurnMessages.length <= 5) {
      titleMessages = multiTurnMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: (m.displayContent || m.content).slice(0, 1000),
      }));
    } else {
      // Filter only user messages and exclude those with >250 tokens (~1000 chars)
      // Use displayContent if available (clean, without context attachments)
      let userMessages = currentState.messages
        .filter((m) => m.role === 'user')
        .map((m) => ({
          role: 'user' as const,
          content: (m.displayContent || m.content).slice(0, 1000), // Cap at ~250 tokens
        }))
        .filter((m) => m.content.length > 0); // Exclude empty messages

      // Limit to max 15 messages: 10 from start + 5 from end if exceeds 15
      const MAX_MESSAGES = 15;
      const START_COUNT = 10;
      const END_COUNT = 5;
      if (userMessages.length > MAX_MESSAGES) {
        const startMessages = userMessages.slice(0, START_COUNT);
        const endMessages = userMessages.slice(-END_COUNT);
        userMessages = [...startMessages, ...endMessages];
      }

      titleMessages = userMessages;
    }

    if (titleMessages.length === 0) {
      useStore.getState().setIsRenaming(false);
      return;
    }

    // System prompt for title generation (shared with auto-rename)

    try {
      const currentModel = currentState.providerConfig.model || '';
      const isGeminiImg = currentModel.startsWith('gemini-2.0-flash-exp-image');
      const isXAIImg = currentState.providerConfig.providerId === 'xai' && currentModel.startsWith('grok-2-image');

      // Use a text model for title generation if current is an image model
      const titleProviderConfig = isGeminiImg
        ? { ...currentState.providerConfig, model: 'gemini-2.5-flash-lite' }
        : isXAIImg
          ? { ...currentState.providerConfig, model: 'grok-4-1-fast-non-reasoning' }
          : currentState.providerConfig;

      const response = await chrome.runtime.sendMessage({
        type: 'TITLE_GENERATE',
        messages: [{ role: 'system', content: TITLE_GENERATION_SYSTEM_PROMPT }, ...titleMessages],
        providerConfig: titleProviderConfig,
      });

      if (response?.title && !response.error && currentState.activeConversationId) {
        const title = response.title.trim().replace(/^["']|["']$/g, '').slice(0, 50);
        currentState.updateConversationTitle(currentState.activeConversationId, title);
      }
    } catch (e) {
      console.error('[useChat] Rename failed:', e);
    } finally {
      useStore.getState().setIsRenaming(false);
    }
  }, []);


  const dispatchChatRequest = useCallback(async (
    apiMessages: APIMessage[],
    opts?: { aspectRatio?: string; enableReasoning?: boolean }
  ) => {
    const currentState = useStore.getState();
    currentState.setIsStreaming(true);
    currentState.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    currentState.setCurrentRequestId(requestId);

    // Track per-conversation streaming state
    const activeConvId = currentState.activeConversationId;
    if (activeConvId) {
      currentState.setConversationStreaming(activeConvId, { requestId });
    }

    const currentModel = currentState.providerConfig.model || '';
    const isXAIImg = isXAIImageModel(currentModel);
    const isGeminiImg = isGeminiImageModel(currentModel);
    const canUseFunctionCalling = supportsFunctionCalling(currentModel);

    // Get tools using unified hook
    const tools = await getAllTools();

    // Get chat options using unified hook
    const chatOptions = getChatOptions({
      aspectRatio: (isXAIImg || isGeminiImg) ? opts?.aspectRatio : undefined,
      enableReasoning: opts?.enableReasoning,
    });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: currentState.providerConfig,
        tools: (canUseFunctionCalling && !(isXAIImg && !opts?.aspectRatio)) ? tools : [],
        options: chatOptions,
        requestId,
        conversationId: activeConvId,
      });

      if (response?.error) {
        if (activeConvId) currentState.setConversationStreaming(activeConvId, null);
        currentState.addMessage({ role: 'error', content: response.error });
        currentState.setIsStreaming(false);
      } else if (response?.content !== undefined || response?.toolCalls?.length) {
        // Handle non-streaming response (content returned directly)
        const toolCalls: ToolCall[] = response.toolCalls || [];
        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || '',
          ...(response.reasoning_content && { reasoningContent: response.reasoning_content }),
          ...(toolCalls.length && { toolCalls }),
        };
        currentState.addMessage(assistantMsg);

        // Handle tool calls for non-streaming (if any)
        if (toolCalls.length > 0) {
          // Keep isStreaming true while handling tool calls
          await handleToolCallsNonStreaming(toolCalls, activeConvId);
        } else {
          // No tool calls, we're done
          currentState.setIsStreaming(false);
          currentState.setCurrentRequestId(null);
          if (activeConvId) {
            currentState.setConversationStreaming(activeConvId, null);
            currentState.updateConversationTimestamp();
          }
          currentState.saveActiveConversation();
        }
      }
      // For streaming: CHAT_STREAM_CHUNK and CHAT_STREAM_DONE are handled by useStreaming.ts
    } catch (e) {
      if (activeConvId) currentState.setConversationStreaming(activeConvId, null);
      currentState.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      currentState.setIsStreaming(false);
    }
  }, [getAllTools, supportsFunctionCalling, isXAIImageModel, isGeminiImageModel, getChatOptions]);

  const sendMessage = useCallback(async (text: string, sendOptions?: { aspectRatio?: string; enableReasoning?: boolean }) => {
    const currentState = useStore.getState();
    const convId = currentState.activeConversationId;
    const isConvStreaming = convId ? !!currentState.streamingConversations[convId] : false;
    if (currentState.isStreaming || isConvStreaming || currentState.isCompacting) return;

    const validAttachments = currentState.attachments.filter((a) => a.type !== 'error');
    if (!text && validAttachments.length === 0) return;

    // Handle slash commands
    if (text.trim() === '/compact') {
      await compactConversation();
      return;
    }

    if (text.trim() === '/rename') {
      await renameConversation();
      return;
    }

    // Auto compact check
    await checkAndAutoCompact();

    // Re-get state after potential compaction
    const stateAfterCompact = useStore.getState();

    // Ensure we have an active conversation
    if (!stateAfterCompact.activeConversationId) {
      stateAfterCompact.createConversation();
    }

    // Build user message content
    let userContent = text;
    let displayContent = text;
    let pageContextAttachment: PageContext | null = null;
    let selectedTextAttachment: SelectedText | null = null;

    // Attach page context if available
    if (stateAfterCompact.pageContext) {
      userContent = `[Page Context]\nTitle: ${stateAfterCompact.pageContext.pageTitle}\nURL: ${stateAfterCompact.pageContext.pageUrl}\n${stateAfterCompact.pageContext.metaDescription ? `Description: ${stateAfterCompact.pageContext.metaDescription}\n` : ''}\nContent:\n${stateAfterCompact.pageContext.content}\n\n[User Message]\n${text || ''}`;
      displayContent = text;
      pageContextAttachment = stateAfterCompact.pageContext;
    }

    // Attach selected text if available
    if (stateAfterCompact.selectedText) {
      const selPrefix = stateAfterCompact.pageContext ? '' : `[From: ${stateAfterCompact.selectedText.pageTitle}]\n`;
      userContent = `${selPrefix}[Selected Text]\n"${stateAfterCompact.selectedText.selectedText}"\n\n[User Message]\n${text || ''}`;
      displayContent = text;
      selectedTextAttachment = stateAfterCompact.selectedText;
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
      for (const att of validAttachments.filter((a) => a.type === 'text')) {
        userContent += `\n\n[File: ${att.name}]\n${att.data}`;
      }
      // For PDFs, add note
      for (const att of validAttachments.filter((a) => a.type === 'pdf')) {
        userContent += `\n\n[File: ${att.name}]\n[PDF file attached - text extraction not available in browser]`;
      }
    }

    // Add to state
    const messageData: Message = {
      role: 'user',
      content: userContent,
      displayContent,
      pageContext: pageContextAttachment || undefined,
      selectedText: selectedTextAttachment || undefined
    };
    if (messageAttachments && messageAttachments.some((a) => a.type === 'image' || a.type === 'text')) {
      messageData.attachments = messageAttachments.filter((a) => a.type === 'image' || a.type === 'text');
    }
    stateAfterCompact.addMessage(messageData);
    stateAfterCompact.updateConversationTimestamp();

    // Clear selection and attachments
    stateAfterCompact.setSelectedText(null);
    stateAfterCompact.setPageContext(null);
    stateAfterCompact.clearAttachments();

    // Build messages for API using unified builder with new message
    const apiMessages = buildAPIMessages([...stateAfterCompact.messages, messageData]);

    await dispatchChatRequest(apiMessages, sendOptions);
  }, [buildAPIMessages, compactConversation, renameConversation, checkAndAutoCompact, dispatchChatRequest]);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const requestId = store.currentRequestId;
    if (requestId) {
      chrome.runtime.sendMessage({ type: 'STOP_STREAM', requestId });
    }
    const activeConvId = store.activeConversationId;
    if (activeConvId) store.setConversationStreaming(activeConvId, null);
    store.setIsStreaming(false);
    store.setCurrentRequestId(null);
    store.setStreamingContent('');
  }, [store]);

  const newChat = useCallback(() => {
    store.saveActiveConversation();
    const activeConvId = store.activeConversationId;
    if (activeConvId) store.setConversationStreaming(activeConvId, null);
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

  const branchFrom = useCallback(async (messageIndex: number) => {
    // Copy messages up to the index, but reset compaction state and remove summaries for the new branch
    const messagesToCopy = store.messages
      .slice(0, messageIndex + 1)
      .filter(m => !m.summary)
      .map(m => ({ ...m, isCompacted: false }));

    const parentId = store.activeConversationId;
    const parentConv = store.conversations.find((c) => c.id === parentId);
    const branchTitle = parentConv?.title ?? 'New Chat';
    const branchSystemPrompt = parentConv?.systemPrompt;
    await store.saveActiveConversation();
    const newConv = store.createConversation({
      title: branchTitle,
      branchedFromId: parentId ?? undefined,
      parentConvId: parentId ?? undefined
    });

    if (branchSystemPrompt) {
      store.updateConversationSystemPrompt(newConv.id, branchSystemPrompt);
    }

    store.setMessages(messagesToCopy);
    await saveConversationMessages(newConv.id, messagesToCopy);
    await store.saveToStorage();
    store.setView('chat');
    store.setHistoryDrawerOpen(false);
  }, [store]);

  const regenerateFrom = useCallback(async (messageIndex: number) => {
    const currentState = useStore.getState();
    if (currentState.isStreaming) return;

    // Auto compact check
    await checkAndAutoCompact();

    const stateAfterCompact = useStore.getState();
    const messagesUpToIndex = stateAfterCompact.messages.slice(0, messageIndex + 1);
    stateAfterCompact.setMessages(messagesUpToIndex);
    const apiMessages = buildAPIMessages(messagesUpToIndex);
    await dispatchChatRequest(apiMessages);
  }, [buildAPIMessages, dispatchChatRequest, checkAndAutoCompact]);

  const editMessage = useCallback(async (messageIndex: number, editData: { text: string; pageContext?: PageContext | null; selectedText?: SelectedText | null; attachments?: Attachment[] }) => {
    if (store.isStreaming) return;
    const messageToEdit = store.messages[messageIndex];
    if (!messageToEdit || messageToEdit.role !== 'user') return;

    const { text: newText, pageContext: newPageContext, selectedText: newSelectedText, attachments: newAttachments } = editData;

    let newContent = newText;
    let newDisplayContent = newText;
    if (newPageContext) {
      newContent = `[Page Context]\nTitle: ${newPageContext.pageTitle}\nURL: ${newPageContext.pageUrl}\n${newPageContext.metaDescription ? `Description: ${newPageContext.metaDescription}\n` : ''}\nContent:\n${newPageContext.content}\n\n[User Message]\n${newText}`;
    }
    if (newSelectedText) {
      const selPrefix = newPageContext ? '' : `[From: ${newSelectedText.pageTitle}]\n`;
      newContent = `${selPrefix}[Selected Text]\n"${newSelectedText.selectedText}"\n\n[User Message]\n${newText}`;
    }
    const updatedMessage: Message = {
      ...messageToEdit,
      content: newContent,
      displayContent: newDisplayContent,
      pageContext: newPageContext || undefined,
      selectedText: newSelectedText || undefined,
      attachments: newAttachments && newAttachments.length > 0 ? newAttachments : undefined,
    };
    // Remove undefined fields
    if (!updatedMessage.pageContext) delete updatedMessage.pageContext;
    if (!updatedMessage.selectedText) delete updatedMessage.selectedText;
    if (!updatedMessage.attachments) delete updatedMessage.attachments;

    // Auto compact check
    await checkAndAutoCompact();

    const stateAfterCompact = useStore.getState();
    const freshMessages = stateAfterCompact.messages;
    const updatedMessagesUpToIndex = freshMessages.slice(0, messageIndex + 1);

    updatedMessagesUpToIndex[messageIndex] = updatedMessage;
    stateAfterCompact.setMessages(updatedMessagesUpToIndex);
    const apiMessages = buildAPIMessages(updatedMessagesUpToIndex);
    await dispatchChatRequest(apiMessages);
  }, [buildAPIMessages, dispatchChatRequest, checkAndAutoCompact]);

  /**
   * Handle tool calls for non-streaming mode
   */
  const handleToolCallsNonStreaming = useCallback(async (
    toolCalls: ToolCall[],
    activeConvId: string | null
  ) => {
    for (const tc of toolCalls) {
      if (!tc.name) continue;

      let args = {};
      try {
        args = JSON.parse(tc.arguments || '{}');
      } catch {
        args = {};
      }

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

    // Get tools using unified hook
    const tools = await getAllTools();

    const requestId = `req_${Date.now()}`;
    store.setIsStreaming(true);
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
      } else if (response?.content !== undefined || response?.toolCalls?.length) {
        // Handle non-streaming follow-up response
        const followUpToolCalls: ToolCall[] = response.toolCalls || [];
        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || '',
          ...(response.reasoning_content && { reasoningContent: response.reasoning_content }),
          ...(followUpToolCalls.length && { toolCalls: followUpToolCalls }),
        };
        store.addMessage(assistantMsg);
        store.setIsStreaming(false);
        store.setCurrentRequestId(null);
        if (activeConvId) {
          useStore.getState().setConversationStreaming(activeConvId, null);
          useStore.getState().updateConversationTimestamp();
        }
        useStore.getState().saveActiveConversation();

        // Recursively handle tool calls if any
        if (followUpToolCalls.length > 0) {
          await handleToolCallsNonStreaming(followUpToolCalls, activeConvId);
        }
      }
    } catch (e) {
      if (activeConvId) useStore.getState().setConversationStreaming(activeConvId, null);
      store.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      store.setIsStreaming(false);
    }
  }, [store, buildAPIMessages, getAllTools, supportsFunctionCalling, getChatOptions, checkAndAutoCompact]);

  return {
    sendMessage,
    stopStreaming,
    newChat,
    branchFrom,
    regenerateFrom,
    editMessage,
    getProvider,
    isCustomProvider,
    buildAPIMessages, // Single unified function
    compactConversation,
    renameConversation,
    estimateTokenCount,
    checkAndAutoCompact,
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
