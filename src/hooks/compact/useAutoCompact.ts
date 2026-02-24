/**
 * useAutoCompact Hook
 *
 * Manages conversation compaction to prevent context window overflow.
 * Uses non-destructive "fresh start" model with summary messages.
 */

import { useCallback } from 'react';
import { useStore } from '../../store/index.ts';
import { useMessageBuilder } from '../chat/useMessageBuilder.ts';
import {
  getCompactPrompt,
  extractSummaryFromResponse,
  getContextWindow,
  createCondenseId,
  tagMessagesWithCondenseParent,
  createSummaryMessage,
  getMessagesToCompact,
  shouldCompact,
} from './compactUtils.ts';

export function useAutoCompact() {
  // Compose message builder for dependencies
  const { buildAPIMessages, estimateTokenCount } = useMessageBuilder();

  /**
   * Compact the conversation by creating a summary and tagging old messages
   * Non-destructive: messages are preserved with condenseParent references
   */
  const compactConversation = useCallback(async () => {
    const currentState = useStore.getState();
    if (currentState.isCompacting) return;

    const messagesToCompact = getMessagesToCompact(currentState.messages);
    if (messagesToCompact.length === 0) return;

    currentState.setIsCompacting(true);

    // Build API messages and add summary prompt
    const apiMessages = buildAPIMessages();
    const effectivePrompt = getCompactPrompt(currentState.compactConfig.prompt);
    apiMessages.push({ role: 'user', content: effectivePrompt });

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: apiMessages,
        providerConfig: currentState.providerConfig,
        tools: [],
        options: { enableGoogleSearch: false, stream: false },
        requestId: `compact_${Date.now()}`,
      });

      const fullContent = response?.content || response?.reasoning_content;

      if (fullContent) {
        // Extract summary from response
        const summary = extractSummaryFromResponse(fullContent);
        const condenseId = createCondenseId();

        // Tag existing messages with condenseParent (non-destructive)
        const updatedMessages = tagMessagesWithCondenseParent(
          currentState.messages,
          condenseId
        );

        // Create summary message for fresh start model
        const summaryMessage = createSummaryMessage(summary, condenseId);

        // Update state with compacted messages + summary
        currentState.setMessages([...updatedMessages, summaryMessage]);
        await currentState.saveActiveConversation();
      } else if (response?.error) {
        console.error('[useAutoCompact] Compaction failed:', response.error);
      }
    } catch (e) {
      console.error('[useAutoCompact] Compaction failed:', e);
    } finally {
      currentState.setIsCompacting(false);
    }
  }, [buildAPIMessages]);

  /**
   * Check if auto-compact should be triggered and execute if needed
   * Uses token estimation to compare against context window threshold
   */
  const checkAndAutoCompact = useCallback(async () => {
    const currentState = useStore.getState();

    // Skip if auto-compact is disabled
    if (!currentState.compactConfig.enabled) {
      return false;
    }

    // Calculate context window for current provider
    const contextWindow = getContextWindow(
      currentState.providerConfig,
      currentState.customProviders,
      currentState.compactConfig
    );

    // Estimate current token count
    const currentTokens = estimateTokenCount(currentState.messages);

    // Check if threshold exceeded
    if (shouldCompact(currentTokens, contextWindow, currentState.compactConfig.threshold)) {
      console.log('[useAutoCompact] Threshold reached, auto compacting...', {
        currentTokens,
        threshold: contextWindow * currentState.compactConfig.threshold,
      });
      await compactConversation();
      return true;
    }
    return false;
  }, [compactConversation, estimateTokenCount]);

  return {
    compactConversation,
    checkAndAutoCompact,
  };
}
