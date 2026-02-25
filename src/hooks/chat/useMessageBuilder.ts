/**
 * useMessageBuilder Hook
 *
 * Unified message building logic for API requests.
 * Provides functions to format messages and build API-compatible message arrays.
 */

import { useCallback } from 'react';
import { useStore } from '../../store/index.ts';
import type { Message, APIMessage } from '../../types/index.ts';
import { buildMemoryBlockFromSelection } from '../../utils/memorySampler.ts';

/**
 * Unified message builder hook
 * Replaces both buildAPIMessages and buildAPIMessagesFromList from useChat.ts
 */
export function useMessageBuilder() {
  const store = useStore();

  /**
   * Build memory block for system prompt
   * Uses conversation-specific memory selection for consistency throughout the conversation
   */
  const buildMemoryBlock = useCallback((selectedMemoryIds?: string[]) => {
    if (!store.memoryEnabled || store.memories.length === 0) return '';

    // Use selected memories from conversation if available, otherwise build from all (fallback)
    if (selectedMemoryIds && selectedMemoryIds.length > 0) {
      return buildMemoryBlockFromSelection(store.memories, selectedMemoryIds);
    }

    // Fallback: include all memories (for backward compatibility or when selection not yet created)
    return buildMemoryBlockFromSelection(store.memories, store.memories.map(m => m.id));
  }, [store.memoryEnabled, store.memories]);

  /**
   * Format a single message for API
   */
  const formatMessageForAPI = useCallback((msg: Message): APIMessage | null => {
    if (msg.role === 'error') return null;

    // Assistant with tool calls
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || '',
        toolCalls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments || '{}',
        })),
        ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
        ...(msg.reasoningSignature && { reasoningSignature: msg.reasoningSignature }),
      };
    }

    // Tool result
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        toolCallId: msg.toolCallId,
        name: msg.name,
        content: msg.content,
      };
    }

    // User with attachments
    if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
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
    }

    // Regular message
    return {
      role: msg.role,
      content: msg.content,
      ...(msg.reasoningContent && { reasoningContent: msg.reasoningContent }),
      ...(msg.reasoningSignature && { reasoningSignature: msg.reasoningSignature }),
    };
  }, []);

  /**
   * Build metadata block for system prompt
   * Contains current timestamp for AI context awareness
   */
  const buildMetadataBlock = useCallback(() => {
    return `\n\n<metadata>{"currentTime": "${new Date().toISOString()}"}</metadata>`;
  }, []);

  /**
   * Build API messages from a message list
   * UNIFIED: Replaces both buildAPIMessages and buildAPIMessagesFromList
   *
   * @param messages - Optional message list. If not provided, uses store.messages
   */
  const buildAPIMessages = useCallback(
    (messages?: Message[]): APIMessage[] => {
      const msgs: APIMessage[] = [];
      const activeConv = store.conversations.find((c) => c.id === store.activeConversationId);
      const memoryBlock = buildMemoryBlock(activeConv?.selectedMemoryIds);
      const metadataBlock = buildMetadataBlock();
      const basePrompt = activeConv?.systemPrompt ?? store.providerConfig.systemPrompt ?? '';
      let systemContent = basePrompt + memoryBlock + metadataBlock;

      // Use provided messages or store messages
      const sourceMessages = messages ?? store.messages;
      
      // Find the last summary message for the "fresh start" model
      const lastSummaryIndex = [...sourceMessages].reverse().findIndex(m => m.summary && m.condenseId);
      const startIndex = lastSummaryIndex !== -1 ? sourceMessages.length - 1 - lastSummaryIndex : 0;
      
      const historyMessages: APIMessage[] = [];

      for (let i = startIndex; i < sourceMessages.length; i++) {
        const msg = sourceMessages[i];
        
        // Skip if message is condensed (has a parent)
        if (msg.condenseParent) continue;
        
        // If this is the summary message itself, we add it to history if it's the role we expect
        // or we handle its content differently if needed.
        // In our case, the summary message should be included in the history as a system or user message.
        
        const formatted = formatMessageForAPI(msg);
        if (formatted) {
          historyMessages.push(formatted);
        }
      }

      // Add system message if we have content
      if (systemContent) {
        msgs.push({ role: 'system', content: systemContent });
      }

      return [...msgs, ...historyMessages];
    },
    [
      store.messages,
      store.providerConfig.systemPrompt,
      store.activeConversationId,
      store.conversations,
      store.memories,
      store.memoryEnabled,
      buildMemoryBlock,
      buildMetadataBlock,
      formatMessageForAPI,
    ]
  );

  /**
   * Estimate token count for messages
   * Uses a simple character-based estimation (4 chars ≈ 1 token)
   */
  const estimateTokenCount = useCallback((messages: Message[]) => {
    let totalChars = 0;
    
    // Use the same filtering logic as buildAPIMessages
    const lastSummaryIndex = [...messages].reverse().findIndex(m => m.summary && m.condenseId);
    const startIndex = lastSummaryIndex !== -1 ? messages.length - 1 - lastSummaryIndex : 0;

    for (let i = startIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.condenseParent) continue;

      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      }
      if (msg.attachments) {
        for (const att of msg.attachments) {
          totalChars += (att.name?.length || 0) + (att.data?.length || 0);
        }
      }
    }
    return Math.ceil(totalChars / 4);
  }, []);

  return {
    buildAPIMessages,
    formatMessageForAPI,
    buildMemoryBlock,
    buildMetadataBlock,
    estimateTokenCount,
  };
}
