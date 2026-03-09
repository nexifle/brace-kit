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

/**
 * Generate a title for the given conversation (or the active one if no ID provided).
 * Standalone function so it can be shared between useChat (/rename) and useStreaming (auto-title).
 * @param targetConvId - Conversation to rename. Defaults to the currently active conversation.
 * @param silent - When true, skips the isRenaming loading indicator (used for auto-title).
 */
export async function generateConversationTitle(targetConvId?: string, silent = false): Promise<void> {
  const currentState = useStore.getState();
  const convId = targetConvId || currentState.activeConversationId;
  if (!convId) return;

  // Bail out early if title is already set (relevant for auto-title calls)
  if (targetConvId) {
    const conv = currentState.conversations.find((c) => c.id === targetConvId);
    if (!conv || conv.title !== 'New Chat') return;
  }

  const messages =
    convId === currentState.activeConversationId ? currentState.messages : [];

  if (messages.length === 0) return;

  if (!silent) currentState.setIsRenaming(true);

  // Build title messages: only user messages, first 2 + last 1 (deduplicated), 300 chars each
  // User messages are sufficient for title generation — assistant responses add tokens without value
  const allUserMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => (m.displayContent || m.content).slice(0, 300))
    .filter((c) => c.length > 0);

  const firstTwo = allUserMessages.slice(0, 2);
  const lastOne = allUserMessages.length > 2 ? [allUserMessages[allUserMessages.length - 1]] : [];
  const dedupedContents = [...firstTwo, ...lastOne.filter((c) => !firstTwo.includes(c))];

  const titleMessages = dedupedContents.map((content) => ({ role: 'user' as const, content }));

  if (titleMessages.length === 0) {
    if (!silent) useStore.getState().setIsRenaming(false);
    return;
  }

  try {
    const currentModel = currentState.providerConfig.model || '';
    const isGeminiImg = currentModel.startsWith('gemini-2.0-flash-exp-image');
    const isXAIImg =
      currentState.providerConfig.providerId === 'xai' && currentModel.startsWith('grok-2-image');

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

    if (response?.title && !response.error) {
      const title = response.title.trim().replace(/^["']|["']$/g, '').slice(0, 50);
      useStore.getState().updateConversationTitle(convId, title);
    }
  } catch (e) {
    console.error('[generateConversationTitle] Failed:', e);
  } finally {
    if (!silent) useStore.getState().setIsRenaming(false);
  }
}

export function useChat() {
  // Use selective selectors to avoid re-rendering on every store change
  // Only subscribe to state that is actually used in the component's render phase
  const customProviders = useStore((state) => state.customProviders);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Use extracted hooks
  const { buildAPIMessages, estimateTokenCount } = useMessageBuilder();
  const { getAllTools, supportsFunctionCalling, isXAIImageModel, isGeminiImageModel, getChatOptions } = useTools();
  const { compactConversation, checkAndAutoCompact } = useAutoCompact();

  const getProvider = useCallback(
    (providerId: string) => getProviderUtil(providerId, customProviders),
    [customProviders]
  );

  const isCustomProvider = useCallback(
    (providerId: string) => isCustomProviderUtil(providerId, customProviders),
    [customProviders]
  );

  const renameConversation = useCallback(async () => {
    await generateConversationTitle();
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

    if (text.trim() === '/help') {
      window.open('https://bracekit.nexifle.com/guide', '_blank');
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
    const currentState = useStore.getState();
    const requestId = currentState.currentRequestId;
    if (requestId) {
      chrome.runtime.sendMessage({ type: 'STOP_STREAM', requestId });
    }
    const activeConvId = currentState.activeConversationId;

    // Preserve any partially streamed content before clearing state
    const partialContent = currentState.streamingContent;
    const partialReasoning = currentState.streamingReasoningContent;
    if (partialContent.trim()) {
      currentState.addMessage({
        role: 'assistant',
        content: partialContent,
        ...(partialReasoning ? { reasoningContent: partialReasoning } : {}),
        truncated: true,
        truncatedReason: 'user_stopped',
      });
      currentState.saveActiveConversation();
    }

    if (activeConvId) currentState.setConversationStreaming(activeConvId, null);
    currentState.setIsStreaming(false);
    currentState.setCurrentRequestId(null);
    currentState.setStreamingContent('');
    currentState.setStreamingReasoningContent('');
  }, []);

  const newChat = useCallback(() => {
    const currentState = useStore.getState();
    currentState.saveActiveConversation();
    const activeConvId = currentState.activeConversationId;
    if (activeConvId) currentState.setConversationStreaming(activeConvId, null);
    currentState.setIsStreaming(false);
    currentState.setCurrentRequestId(null);
    currentState.setStreamingContent('');
    currentState.setPageContext(null);
    currentState.setSelectedText(null);
    currentState.clearAttachments();
    currentState.createConversation();
    currentState.setView('chat');
    currentState.setHistoryDrawerOpen(false);
  }, []);

  const branchFrom = useCallback(async (messageIndex: number) => {
    const currentState = useStore.getState();
    // Copy messages up to the index, but reset compaction state and remove summaries for the new branch
    const messagesToCopy = currentState.messages
      .slice(0, messageIndex + 1)
      .filter(m => !m.summary)
      .map(m => ({ ...m, isCompacted: false }));

    const parentId = currentState.activeConversationId;
    const parentConv = currentState.conversations.find((c) => c.id === parentId);
    const branchTitle = parentConv?.title ?? 'New Chat';
    const branchSystemPrompt = parentConv?.systemPrompt;
    await currentState.saveActiveConversation();
    const newConv = currentState.createConversation({
      title: branchTitle,
      branchedFromId: parentId ?? undefined,
      parentConvId: parentId ?? undefined
    });

    if (branchSystemPrompt) {
      currentState.updateConversationSystemPrompt(newConv.id, branchSystemPrompt);
    }

    currentState.setMessages(messagesToCopy);
    await saveConversationMessages(newConv.id, messagesToCopy);
    await currentState.saveToStorage();
    currentState.setView('chat');
    currentState.setHistoryDrawerOpen(false);
  }, []);

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
    const currentState = useStore.getState();
    if (currentState.isStreaming) return;
    const messageToEdit = currentState.messages[messageIndex];
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
    const currentState = useStore.getState();
    for (const tc of toolCalls) {
      if (!tc.name) continue;

      let args = {};
      try {
        args = JSON.parse(tc.arguments || '{}');
      } catch {
        args = {};
      }

      // Add "calling" status
      currentState.addMessage({
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
    const freshState = useStore.getState();
    const msgs = buildAPIMessages(freshState.messages);

    // Get tools using unified hook
    const tools = await getAllTools();

    const requestId = `req_${Date.now()}`;
    freshState.setIsStreaming(true);
    freshState.setCurrentRequestId(requestId);
    freshState.setStreamingContent('');
    freshState.setStreamingReasoningContent('');
    if (activeConvId) {
      freshState.setConversationStreaming(activeConvId, { requestId });
    }

    const chatOptions = getChatOptions();
    const currentModel = freshState.providerConfig.model || '';
    const canUseFunctionCalling = supportsFunctionCalling(currentModel);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: msgs,
        providerConfig: freshState.providerConfig,
        tools: canUseFunctionCalling ? tools : [],
        options: chatOptions,
        requestId,
        conversationId: activeConvId,
      });

      if (response?.error) {
        if (activeConvId) useStore.getState().setConversationStreaming(activeConvId, null);
        useStore.getState().addMessage({ role: 'error', content: response.error });
        useStore.getState().setIsStreaming(false);
      } else if (response?.content !== undefined || response?.toolCalls?.length) {
        // Handle non-streaming follow-up response
        const followUpToolCalls: ToolCall[] = response.toolCalls || [];
        const assistantMsg: Message = {
          role: 'assistant',
          content: response.content || '',
          ...(response.reasoning_content && { reasoningContent: response.reasoning_content }),
          ...(followUpToolCalls.length && { toolCalls: followUpToolCalls }),
        };
        const finalState = useStore.getState();
        finalState.addMessage(assistantMsg);
        finalState.setIsStreaming(false);
        finalState.setCurrentRequestId(null);
        if (activeConvId) {
          finalState.setConversationStreaming(activeConvId, null);
          finalState.updateConversationTimestamp();
        }
        finalState.saveActiveConversation();

        // Recursively handle tool calls if any
        if (followUpToolCalls.length > 0) {
          await handleToolCallsNonStreaming(followUpToolCalls, activeConvId);
        }
      }
    } catch (e) {
      if (activeConvId) useStore.getState().setConversationStreaming(activeConvId, null);
      useStore.getState().addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      useStore.getState().setIsStreaming(false);
    }
  }, [buildAPIMessages, getAllTools, supportsFunctionCalling, getChatOptions, checkAndAutoCompact]);

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
