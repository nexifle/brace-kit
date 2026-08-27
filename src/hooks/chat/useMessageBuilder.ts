/**
 * useMessageBuilder Hook
 *
 * Unified message building logic for API requests.
 * Provides functions to format messages and build API-compatible message arrays.
 */

import { useCallback } from 'react';
import { useStore } from '../../store/index.ts';
import type { MCPTool, Message, APIMessage } from '../../types/index.ts';
import { buildConversationSystemPrompt } from '../../utils/systemPrompt.ts';
import { formatMessageForAPI } from '../../utils/formatMessageForAPI.ts';
import { estimateRequestContextTokens } from '../../utils/requestContext.ts';
import { getEffectiveMessages } from '../../utils/estimateTokens.ts';

/**
 * Unified message builder hook
 * Replaces both buildAPIMessages and buildAPIMessagesFromList from useChat.ts
 */
export function useMessageBuilder() {
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
      const systemContent = buildConversationSystemPrompt(state);

      const sourceMessages = messages ?? state.messages;

      const historyMessages: APIMessage[] = [];

      for (const msg of getEffectiveMessages(sourceMessages)) {
        const formatted = formatMessageForAPI(msg);
        if (formatted) {
          historyMessages.push(formatted);
        }
      }

      if (systemContent) {
        msgs.push({ role: 'system', content: systemContent });
      }

      return [...msgs, ...historyMessages];
    },
    []
  );

  const estimateTokenCount = useCallback((messages: Message[], tools?: MCPTool[] | null) => {
    const state = useStore.getState();
    return estimateRequestContextTokens({ ...state, messages }, tools).tokens;
  }, []);

  return {
    buildAPIMessages,
    formatMessageForAPI,
    estimateTokenCount,
  };
}
