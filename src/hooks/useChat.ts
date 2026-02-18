import { useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { Message, Attachment, APIMessage, PageContext, SelectedText } from '../types/index.ts';
import { PROVIDER_PRESETS, GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS, XAI_IMAGE_MODELS, GEMINI_IMAGE_MODELS } from '../providers.ts';
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

  const estimateTokenCount = useCallback((messages: Message[]) => {
    let totalChars = 0;
    for (const msg of messages) {
      // Only count messages that are NOT compacted, OR are summary messages (which are sent to API)
      if (msg.isCompacted && !msg.summary) continue;

      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      }
      if (msg.attachments) {
        for (const att of msg.attachments) {
          totalChars += att.name.length + (att.data?.length || 0);
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }, []);

  const buildMemoryBlock = useCallback(() => {
    if (!store.memoryEnabled || store.memories.length === 0) return '';

    let block = '\n\n[User Memory - Use these insights to personalize responses]\n';
    for (const cat of MEMORY_CATEGORIES) {
      const items = store.memories.filter((m) => m.category === cat);
      if (items.length === 0) continue;
      const label = MEMORY_CATEGORY_LABELS[cat].replace(/^[^\s]+\s/, ''); 
      block += `\n${label}:\n`;
      for (const item of items) {
        block += `- ${item.content}\n`;
      }
    }
    return block;
  }, [store.memoryEnabled, store.memories]);

  const formatMessageForAPI = useCallback((msg: Message): APIMessage | null => {
    if (msg.role === 'error') return null;
    
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || '',
        toolCalls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments || '{}',
        })),
      };
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
    } else {
      return { role: msg.role, content: msg.content };
    }
  }, []);

  const buildAPIMessages = useCallback((): APIMessage[] => {
    const msgs: APIMessage[] = [];
    const memoryBlock = buildMemoryBlock();
    const activeConv = store.conversations.find(c => c.id === store.activeConversationId);
    const basePrompt = activeConv?.systemPrompt ?? store.providerConfig.systemPrompt ?? '';
    let systemContent = basePrompt + memoryBlock;

    const historyMessages: APIMessage[] = [];
    for (const msg of store.messages) {
      if (msg.isCompacted && !msg.summary) continue;
      
      if (msg.summary) {
        systemContent += `\n\n[CONVERSATION SUMMARY]\n${msg.summary}\n[END OF SUMMARY]`;
        continue;
      }

      const formatted = formatMessageForAPI(msg);
      if (formatted) {
        historyMessages.push(formatted);
      }
    }

    if (systemContent) {
      msgs.push({ role: 'system', content: systemContent });
    }
    
    return [...msgs, ...historyMessages];
  }, [store.messages, store.providerConfig.systemPrompt, store.activeConversationId, store.conversations, buildMemoryBlock, formatMessageForAPI]);

  const buildAPIMessagesFromList = useCallback((messages: Message[]): APIMessage[] => {
    const msgs: APIMessage[] = [];
    const memoryBlock = buildMemoryBlock();
    const activeConv = store.conversations.find(c => c.id === store.activeConversationId);
    const basePrompt = activeConv?.systemPrompt ?? store.providerConfig.systemPrompt ?? '';
    let systemContent = basePrompt + memoryBlock;

    const historyMessages: APIMessage[] = [];
    for (const msg of messages) {
      if (msg.isCompacted && !msg.summary) continue;
      
      if (msg.summary) {
        systemContent += `\n\n[CONVERSATION SUMMARY]\n${msg.summary}\n[END OF SUMMARY]`;
        continue;
      }

      const formatted = formatMessageForAPI(msg);
      if (formatted) {
        historyMessages.push(formatted);
      }
    }

    if (systemContent) {
      msgs.push({ role: 'system', content: systemContent });
    }
    
    return [...msgs, ...historyMessages];
  }, [store.providerConfig.systemPrompt, store.activeConversationId, store.conversations, buildMemoryBlock, formatMessageForAPI]);

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


  const sendMessage = useCallback(async (text: string, sendOptions?: { aspectRatio?: string }) => {
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

    // Build messages for API
    const apiMessages = buildAPIMessagesFromList([...store.messages, messageData]);
    // Add the new user message (not yet in store.messages if added just above?? 
    // Actually addMessage is sync in zustand if using setState, so it should be there.
    // However, buildAPIMessages already includes it if it's in store.messages.
    // Let's re-verify buildAPIMessages. It maps over store.messages.
    // So apiMessages already has it.

    // Get MCP tools from enabled servers only
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

    // Start streaming
    store.setIsStreaming(true);
    store.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    store.setCurrentRequestId(requestId);

    const currentModel = store.providerConfig.model || '';
    const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';
    const isXAIImageModel = store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
    const isGeminiImageModel = store.providerConfig.providerId === 'gemini' && GEMINI_IMAGE_MODELS.includes(currentModel);
    const supportsFunctionCalling = !isGemini || (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) && !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel));

    const chatOptions: { enableGoogleSearch: boolean; aspectRatio?: string } = {
      enableGoogleSearch: store.enableGoogleSearch && isGemini && !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
    };

    if ((isXAIImageModel || isGeminiImageModel) && sendOptions?.aspectRatio) {
      chatOptions.aspectRatio = sendOptions.aspectRatio;
    }

    try {
      await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: store.providerConfig,
        tools: (supportsFunctionCalling && !isXAIImageModel) ? tools : [],
        options: chatOptions,
        requestId,
      });
    } catch (e) {
      store.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      store.setIsStreaming(false);
    }
  }, [store, buildAPIMessages, compactConversation, estimateTokenCount, getProvider, formatMessageForAPI]);

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
    await chrome.storage.local.set({ [`conv_${newConv.id}`]: messagesToCopy });
    await store.saveToStorage();
    store.setView('chat');
    store.setHistoryDrawerOpen(false);
  }, [store]);

  const regenerateFrom = useCallback(async (messageIndex: number) => {
    if (store.isStreaming) return;
    const messagesUpToIndex = store.messages.slice(0, messageIndex + 1);
    store.setMessages(messagesUpToIndex);
    const apiMessages = buildAPIMessagesFromList(messagesUpToIndex);
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
    store.setIsStreaming(true);
    store.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    store.setCurrentRequestId(requestId);
    const currentModel = store.providerConfig.model || '';
    const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';
    const isXAIImageModel = store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
    const isGeminiImageModel = store.providerConfig.providerId === 'gemini' && GEMINI_IMAGE_MODELS.includes(currentModel);
    const supportsFunctionCalling = !isGemini || (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) && !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel));
    const chatOptions = {
      enableGoogleSearch: store.enableGoogleSearch && isGemini && !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
    };
    try {
      await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: store.providerConfig,
        tools: (supportsFunctionCalling && !(isXAIImageModel || isGeminiImageModel)) ? tools : [],
        options: chatOptions,
        requestId,
      });
    } catch (e) {
      store.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      store.setIsStreaming(false);
    }
  }, [store, buildAPIMessagesFromList]);

  const editMessage = useCallback(async (messageIndex: number, newText: string) => {
    if (store.isStreaming) return;
    const messageToEdit = store.messages[messageIndex];
    if (!messageToEdit || messageToEdit.role !== 'user') return;
    let newContent = newText;
    let newDisplayContent = newText;
    if (messageToEdit.pageContext) {
      newContent = `[Page Context]\nTitle: ${messageToEdit.pageContext.pageTitle}\nURL: ${messageToEdit.pageContext.pageUrl}\n${messageToEdit.pageContext.metaDescription ? `Description: ${messageToEdit.pageContext.metaDescription}\n` : ''}\nContent:\n${messageToEdit.pageContext.content}\n\n[User Message]\n${newText}`;
    }
    if (messageToEdit.selectedText) {
      const selPrefix = messageToEdit.pageContext ? '' : `[From: ${messageToEdit.selectedText.pageTitle}]\n`;
      newContent = `${selPrefix}[Selected Text]\n"${messageToEdit.selectedText.selectedText}"\n\n[User Message]\n${newText}`;
    }
    const messagesUpToIndex = store.messages.slice(0, messageIndex + 1);
    const updatedMessage: Message = { ...messageToEdit, content: newContent, displayContent: newDisplayContent };
    messagesUpToIndex[messageIndex] = updatedMessage;
    store.setMessages(messagesUpToIndex);
    const apiMessages = buildAPIMessagesFromList(messagesUpToIndex);
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
    store.setIsStreaming(true);
    store.setStreamingContent('');
    const requestId = `req_${Date.now()}`;
    store.setCurrentRequestId(requestId);
    const currentModel = store.providerConfig.model || '';
    const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';
    const isXAIImageModel = store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
    const isGeminiImageModel = store.providerConfig.providerId === 'gemini' && GEMINI_IMAGE_MODELS.includes(currentModel);
    const supportsFunctionCalling = !isGemini || (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) && !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel));
    const chatOptions = {
      enableGoogleSearch: store.enableGoogleSearch && isGemini && !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
    };
    try {
      await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: store.providerConfig,
        tools: (supportsFunctionCalling && !(isXAIImageModel || isGeminiImageModel)) ? tools : [],
        options: chatOptions,
        requestId,
      });
    } catch (e) {
      store.addMessage({ role: 'error', content: `Request failed: ${(e as Error).message}` });
      store.setIsStreaming(false);
    }
  }, [store, buildAPIMessagesFromList]);

  return {
    sendMessage,
    stopStreaming,
    newChat,
    branchFrom,
    regenerateFrom,
    editMessage,
    getProvider,
    isCustomProvider,
    buildAPIMessages,
    compactConversation,
    renameConversation,
    estimateTokenCount,
  };
}
