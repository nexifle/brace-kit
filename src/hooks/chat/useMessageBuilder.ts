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
  // Use selective selectors - only subscribe to state needed for rendering decisions
  // Most operations use useStore.getState() inside callbacks to avoid subscriptions

  /**
   * Build memory block for system prompt
   * Uses conversation-specific memory selection for consistency throughout the conversation
   */
  const buildMemoryBlock = useCallback((selectedMemoryIds?: string[]) => {
    const state = useStore.getState();
    if (!state.memoryEnabled || state.memories.length === 0) return '';

    // Use selected memories from conversation if available, otherwise build from all (fallback)
    if (selectedMemoryIds && selectedMemoryIds.length > 0) {
      return buildMemoryBlockFromSelection(state.memories, selectedMemoryIds);
    }

    // Fallback: include all memories (for backward compatibility or when selection not yet created)
    return buildMemoryBlockFromSelection(state.memories, state.memories.map(m => m.id));
  }, []);

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
      const images = msg.attachments.filter(a => a.type === 'image');
      const texts = msg.attachments.filter(a => a.type === 'text');

      // Build inline text from text attachments
      let textContent = msg.content || '';
      for (const att of texts) {
        textContent += `\n\n--- ${att.name} ---\n${att.data}`;
      }

      // No images — send as plain string for compatibility with all providers
      if (images.length === 0) {
        return { role: msg.role, content: textContent };
      }

      // With images — use multi-part content format (required by OpenAI vision API)
      const content: { type: string; text?: string; image_url?: { url: string } }[] = [];
      if (textContent) {
        content.push({ type: 'text', text: textContent });
      }
      for (const att of images) {
        content.push({
          type: 'image_url',
          image_url: { url: att.data },
        });
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
   * Uses static timestamp from conversation for prompt caching efficiency
   */
  const buildMetadataBlock = useCallback(() => {
    const state = useStore.getState();
    const activeConv = state.conversations.find((c) => c.id === state.activeConversationId);
    const timestamp = activeConv?.metadataTimestamp || new Date().toISOString();
    return `\n\n<metadata>{"currentTime": "${timestamp}"}</metadata>`;
  }, []);

  /**
   * Build API messages from a message list
   * UNIFIED: Replaces both buildAPIMessages and buildAPIMessagesFromList
   *
   * @param messages - Optional message list. If not provided, uses store.messages
   */
  const buildAPIMessages = useCallback(
    (messages?: Message[]): APIMessage[] => {
      const state = useStore.getState();
      const msgs: APIMessage[] = [];
      const activeConv = state.conversations.find((c) => c.id === state.activeConversationId);
      const memoryBlock = buildMemoryBlock(activeConv?.selectedMemoryIds);
      const metadataBlock = buildMetadataBlock();
      const basePrompt = activeConv?.systemPrompt ?? state.providerConfig.systemPrompt ?? '';
      let systemContent = basePrompt + memoryBlock + metadataBlock;

      // Use provided messages or store messages
      const sourceMessages = messages ?? state.messages;

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
    [buildMemoryBlock, buildMetadataBlock, formatMessageForAPI]
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
