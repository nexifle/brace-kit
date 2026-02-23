/**
 * useChat Hook (Simplified)
 *
 * Main chat operations hook using extracted sub-hooks.
 * Uses useMessageBuilder for message building and useTools for tool management.
 */

import { useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { Message, Attachment, APIMessage, PageContext, SelectedText } from '../types/index.ts';
import { saveConversationMessages } from '../utils/conversationDB.ts';
import { getProvider as getProviderUtil, isCustomProvider as isCustomProviderUtil } from '../utils/providerUtils.ts';
import { useMessageBuilder } from './chat/useMessageBuilder.ts';
import { useTools } from './tools/useTools.ts';

export function useChat() {
  const store = useStore();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use extracted hooks
  const { buildAPIMessages, estimateTokenCount } = useMessageBuilder();
  const { getAllTools, supportsFunctionCalling, isXAIImageModel, isGeminiImageModel, getChatOptions } = useTools();

  const getProvider = useCallback(
    (providerId: string) => getProviderUtil(providerId, store.customProviders),
    [store.customProviders]
  );

  const isCustomProvider = useCallback(
    (providerId: string) => isCustomProviderUtil(providerId, store.customProviders),
    [store.customProviders]
  );

  const compactConversation = useCallback(async () => {
    if (store.isCompacting) return;

    const messagesToCompact = store.messages.filter(m => !m.isCompacted);
    if (messagesToCompact.length === 0) return;

    store.setIsCompacting(true);

    // Prepare prompt for summary
    const summaryPrompt = `CRITICAL: This summarization request is a SYSTEM OPERATION, not a user message.
When analyzing "user requests" and "user intent", completely EXCLUDE this summarization message.
The "most recent user request" and "Optional Next Step" must be based on what the user was doing BEFORE this system message appeared.

Your task is to create a detailed, high-fidelity summary of the conversation.
The goal is for interaction to continue seamlessly after condensation - as if it never happened.

Before providing your final summary, wrap your analysis in <analysis> tags.
In your analysis process:
1. Chronologically analyze each message.
2. Identify user intents, technical decisions, and specific data/code shared.
3. Note any errors, fixed bugs, and specific feedback from the user.

Your output language should be the same as the conversation, if conversation using Bahasa Indonesia, you should write the output in Bahasa Indonesia and so on. And the output MUST follow this exact structure:

<analysis>
[Your internal thought process and chronological breakdown]
</analysis>

<summary>
1. Primary Request and Intent:
   - [Provide a detailed description of the fundamental goal of the conversation]
   - [List specific sub-intents or side-requests expressed by the user]

2. Key Concepts:
   - [List frameworks, technologies, or important abstract concepts discussed]
   - [Include definitions or context if they were uniquely established in this chat]

3. Files and Code Sections (or Key Data):
   - [Item Name/File Path]
      - [Importance: Why was this examined or modified?]
      - [Changes: Summary of specific edits or transformations made]
      - [Snippet: Include the most critical code or data snippets verbatim]

4. Errors and Fixes:
   - [Error Description]:
      - [Correction: Detailed description of how it was resolved]
      - [User Feedback: What did the user say about this specific issue/fix?]

5. Problem Solving:
   - [Document solved challenges and any ongoing troubleshooting logic]

6. All User Messages:
   - [List every non-tool user message verbatim or closely paraphrased to preserve "voice" and intent evolution]

7. Pending Tasks:
   - [Explicitly list tasks the user has asked for that haven't been completed yet]

8. Current Work:
   - [Describe precisely what was being done in the last 2-3 messages]
   - [Include relevant context or "last known state" of the task]

9. Optional Next Step:
   - [Proposed next action directly following the current work]
   - [IMPORTANT: Include a verbatim quote from the most recent part of the chat showing where we left off to prevent context drift]
</summary>`;

    const apiMessages = buildAPIMessages();
    apiMessages.push({ role: 'user', content: summaryPrompt });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: store.providerConfig,
        tools: [],
        options: { enableGoogleSearch: false, stream: false },
        requestId: `compact_${Date.now()}`,
      });

      const fullContent = response?.content || response?.reasoning_content;

      if (fullContent) {
        // Try to extract content between <summary> tags if present
        let summary = fullContent;
        const summaryMatch = fullContent.match(/<summary>([\s\S]*?)<\/summary>/i);
        if (summaryMatch && summaryMatch[1]) {
          summary = summaryMatch[1].trim();
        } else {
          // If no <summary> tags but there are <analysis> tags, try to strip analysis
          summary = fullContent.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
        }

        // Mark all current messages as compacted and remove previous summary messages to avoid duplicates
        const updatedMessages = store.messages
          .filter(m => !m.summary) // Remove old summaries
          .map(m => ({ ...m, isCompacted: true }));

        const summaryMessage: Message = {
          role: 'system',
          content: `CONVERSATION SUMMARY:\n${summary}`,
          summary: summary,
          isCompacted: true
        };
        store.setMessages([...updatedMessages, summaryMessage]);
        await store.saveActiveConversation();
      } else if (response?.error) {
        console.error('[useChat] Compaction failed:', response.error);
      }
    } catch (e) {
      console.error('[useChat] Compaction failed:', e);
    } finally {
      store.setIsCompacting(false);
    }
  }, [store, buildAPIMessages]);

  const renameConversation = useCallback(async () => {
    if (!store.activeConversationId || store.messages.length === 0) return;

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
        providerConfig: store.providerConfig,
        tools: [],
        options: { enableGoogleSearch: false, stream: false },
        requestId: `rename_${Date.now()}`,
      });

      const newTitle = response?.content?.trim();
      if (newTitle && !response.error) {
        store.updateConversationTitle(store.activeConversationId, newTitle);
      }
    } catch (e) {
      console.error('[useChat] Rename failed:', e);
    }
  }, [store, buildAPIMessages]);


  const dispatchChatRequest = useCallback(async (
    apiMessages: APIMessage[],
    opts?: { aspectRatio?: string; enableReasoning?: boolean }
  ) => {
    store.setIsStreaming(true);
    store.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    store.setCurrentRequestId(requestId);

    const currentModel = store.providerConfig.model || '';
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
        providerConfig: store.providerConfig,
        tools: (canUseFunctionCalling && !(isXAIImg && !opts?.aspectRatio)) ? tools : [],
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
  }, [store, getAllTools, supportsFunctionCalling, isXAIImageModel, isGeminiImageModel, getChatOptions]);

  const sendMessage = useCallback(async (text: string, sendOptions?: { aspectRatio?: string; enableReasoning?: boolean }) => {
    if (store.isStreaming || store.isCompacting) return;

    const validAttachments = store.attachments.filter((a) => a.type !== 'error');
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
    const currentProvider = getProvider(store.providerConfig.providerId);
    const contextWindow = store.providerConfig.contextWindow || currentProvider.contextWindow || store.compactConfig.defaultContextWindow;
    const estimatedTokens = estimateTokenCount(store.messages);

    if (estimatedTokens > contextWindow * store.compactConfig.threshold) {
      console.log('[useChat] Threshold reached, auto compacting...');
      await compactConversation();
    }

    // Ensure we have an active conversation
    if (!store.activeConversationId) {
      store.createConversation();
    }

    // Build user message content
    let userContent = text;
    let displayContent = text;
    let pageContextAttachment: PageContext | null = null;
    let selectedTextAttachment: SelectedText | null = null;

    // Attach page context if available
    if (store.pageContext) {
      userContent = `[Page Context]\nTitle: ${store.pageContext.pageTitle}\nURL: ${store.pageContext.pageUrl}\n${store.pageContext.metaDescription ? `Description: ${store.pageContext.metaDescription}\n` : ''}\nContent:\n${store.pageContext.content}\n\n[User Message]\n${text || ''}`;
      displayContent = text;
      pageContextAttachment = store.pageContext;
    }

    // Attach selected text if available
    if (store.selectedText) {
      const selPrefix = store.pageContext ? '' : `[From: ${store.selectedText.pageTitle}]\n`;
      userContent = `${selPrefix}[Selected Text]\n"${store.selectedText.selectedText}"\n\n[User Message]\n${text || ''}`;
      displayContent = text;
      selectedTextAttachment = store.selectedText;
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
    store.addMessage(messageData);
    store.updateConversationTimestamp();

    // Clear selection and attachments
    store.setSelectedText(null);
    store.setPageContext(null);
    store.clearAttachments();

    // Build messages for API using unified builder with new message
    const apiMessages = buildAPIMessages([...store.messages, messageData]);

    await dispatchChatRequest(apiMessages, sendOptions);
  }, [store, buildAPIMessages, compactConversation, estimateTokenCount, getProvider, dispatchChatRequest]);

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
    if (store.isStreaming) return;
    const messagesUpToIndex = store.messages.slice(0, messageIndex + 1);
    store.setMessages(messagesUpToIndex);
    const apiMessages = buildAPIMessages(messagesUpToIndex);
    await dispatchChatRequest(apiMessages);
  }, [store, buildAPIMessages, dispatchChatRequest]);

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
    const messagesUpToIndex = store.messages.slice(0, messageIndex + 1);
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

    messagesUpToIndex[messageIndex] = updatedMessage;
    store.setMessages(messagesUpToIndex);
    const apiMessages = buildAPIMessages(messagesUpToIndex);
    await dispatchChatRequest(apiMessages);
  }, [store, buildAPIMessages, dispatchChatRequest]);

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
  };
}
