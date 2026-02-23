/**
 * useMessageBuilder Hook
 *
 * Unified message building logic for API requests.
 * Provides functions to format messages and build API-compatible message arrays.
 */

import { useCallback } from 'react';
import { useStore } from '../../store/index.ts';
import type { Message, APIMessage } from '../../types/index.ts';
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from '../../types/index.ts';

/**
 * Unified message builder hook
 * Replaces both buildAPIMessages and buildAPIMessagesFromList from useChat.ts
 */
export function useMessageBuilder() {
  const store = useStore();

  /**
   * Build memory block for system prompt
   */
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
    return { role: msg.role, content: msg.content };
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
      const memoryBlock = buildMemoryBlock();
      const activeConv = store.conversations.find((c) => c.id === store.activeConversationId);
      const basePrompt = activeConv?.systemPrompt ?? store.providerConfig.systemPrompt ?? '';
      let systemContent = basePrompt + memoryBlock;

      // Use provided messages or store messages
      const sourceMessages = messages ?? store.messages;
      const historyMessages: APIMessage[] = [];

      for (const msg of sourceMessages) {
        // Skip compacted messages without summary
        if (msg.isCompacted && !msg.summary) continue;

        // Add summary to system content
        if (msg.summary) {
          systemContent += `\n\n[CONVERSATION SUMMARY]\n${msg.summary}\n[END OF SUMMARY]`;
          continue;
        }

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
      buildMemoryBlock,
      formatMessageForAPI,
    ]
  );

  /**
   * Estimate token count for messages
   * Uses a simple character-based estimation (4 chars ≈ 1 token)
   */
  const estimateTokenCount = useCallback((messages: Message[]) => {
    let totalChars = 0;
    for (const msg of messages) {
      // Only count messages that are NOT compacted, OR are summary messages
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

  return {
    buildAPIMessages,
    formatMessageForAPI,
    buildMemoryBlock,
    estimateTokenCount,
  };
}
