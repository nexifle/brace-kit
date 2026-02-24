/**
 * useChat Hook (Simplified)
 *
 * Main chat operations hook using extracted sub-hooks.
 * Uses useMessageBuilder for message building, useTools for tool management,
 * and useAutoCompact for conversation compaction.
 */

import { useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { Message, Attachment, APIMessage, PageContext, SelectedText } from '../types/index.ts';
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

    const renamePrompt = `CRITICAL: This is a SYSTEM OPERATION to rename the conversation.
Based on the conversation history below, generate a concise and descriptive title for this conversation.
The title MUST:
1. Be as descriptive as possible about the main topic.
2. Be in the same language as the conversation (e.g., if the user speaks Indonesian, the title should be in Indonesian).
3. Be NO MORE than 6 words.
4. NOT include any punctuation or quotes.

Output ONLY the title string.`;

    const apiMessages = buildAPIMessages();
    apiMessages.push({ role: 'user', content: renamePrompt });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: currentState.providerConfig,
        tools: [],
        options: { enableGoogleSearch: false, stream: false },
        requestId: `rename_${Date.now()}`,
      });

      const newTitle = response?.content?.trim();
      if (newTitle && !response.error && currentState.activeConversationId) {
        currentState.updateConversationTitle(currentState.activeConversationId, newTitle);
      }
    } catch (e) {
      console.error('[useChat] Rename failed:', e);
    }
  }, [buildAPIMessages]);


  const dispatchChatRequest = useCallback(async (
    apiMessages: APIMessage[],
    opts?: { aspectRatio?: string; enableReasoning?: boolean }
  ) => {
    const currentState = useStore.getState();
    currentState.setIsStreaming(true);
    currentState.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    currentState.setCurrentRequestId(requestId);

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
      });

      if (response?.error) {
        currentState.addMessage({ role: 'error', content: response.error });
        currentState.setIsStreaming(false);
      }
    } catch (e) {
      currentState.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      currentState.setIsStreaming(false);
    }
  }, [getAllTools, supportsFunctionCalling, isXAIImageModel, isGeminiImageModel, getChatOptions]);

  const sendMessage = useCallback(async (text: string, sendOptions?: { aspectRatio?: string; enableReasoning?: boolean }) => {
    const currentState = useStore.getState();
    if (currentState.isStreaming || currentState.isCompacting) return;

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
    const newConv = store.createConversation({ title: branchTitle, branchedFromId: parentId ?? undefined });

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
