/**
 * useAutoCompact Hook
 *
 * Checkpoint-and-replay compaction: structured summary of discarded history
 * plus a verbatim recent tail. Session history stays complete.
 */

import { useCallback, useRef } from 'react';
import { useStore } from '../../store/index.ts';
import { useTools } from '../tools/useTools.ts';
import { prepareChatRequest } from '../../utils/chatOptions.ts';
import {
  createCondenseId,
  createSummaryMessage,
  extractSummaryFromResponse,
  getContextWindow,
  keepRecentTokensForConfig,
  reserveTokensForConfig,
  shouldCompact,
} from './compactUtils.ts';
import {
  applyCompaction,
  buildSummarizationApiMessages,
  buildSummarizationUserPrompt,
  combineSplitTurnSummary,
  computeFileLists,
  isContextOverflow,
  prepareCompaction,
  serializeConversation,
  summarizationMaxTokens,
} from './prepareCompaction.ts';
import type { Message } from '../../types/index.ts';
import { estimateMessageTokens, getEffectiveMessages } from '../../utils/estimateTokens.ts';

export function useAutoCompact() {
  const { getAllTools, supportsFunctionCalling, isXAIImageModel } = useTools();
  const overflowAttemptedRef = useRef(false);

  const runSummarization = useCallback(async (userPrompt: string, maxTokens: number) => {
    const currentState = useStore.getState();
    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_REQUEST',
      messages: buildSummarizationApiMessages(userPrompt),
      providerConfig: currentState.providerConfig,
      tools: [],
      options: {
        enableGoogleSearch: false,
        stream: false,
        modelParameters: { maxTokens },
      },
      requestId: `compact_${Date.now()}`,
    });

    if (response?.toolCalls?.length) {
      throw new Error('Summarizer returned tool calls');
    }
    if (response?.error) {
      throw new Error(response.error);
    }
    const fullContent = response?.content || response?.reasoning_content;
    if (!fullContent) {
      throw new Error('Empty summarization response');
    }
    return extractSummaryFromResponse(fullContent);
  }, []);

  const compactConversation = useCallback(async (opts?: {
    customInstructions?: string;
    endIndex?: number;
  }): Promise<boolean> => {
    const currentState = useStore.getState();
    if (currentState.isCompacting) return false;

    const contextWindow = getContextWindow(
      currentState.providerConfig,
      currentState.customProviders,
      currentState.compactConfig,
    ) || currentState.compactConfig.defaultContextWindow || 128000;
    const keepRecent = keepRecentTokensForConfig(currentState.compactConfig, contextWindow);
    const reserve = reserveTokensForConfig(currentState.compactConfig, contextWindow);
    const modelMax = currentState.providerConfig.modelParameters?.maxTokens;

    const messages = currentState.messages;
    const prep = prepareCompaction(messages, keepRecent, opts?.endIndex);
    if (!prep) return false;

    currentState.setIsCompacting(true);
    try {
      const historyText = serializeConversation(prep.messagesToSummarize);
      const historyPrompt = buildSummarizationUserPrompt({
        conversationText: historyText || '(empty)',
        previousSummary: prep.previousSummary,
        customInstructions: opts?.customInstructions,
      });
      let summary = await runSummarization(
        historyPrompt,
        summarizationMaxTokens(reserve, 0.8, modelMax),
      );

      if (prep.isSplitTurn && prep.turnPrefixMessages.length > 0) {
        const prefixText = serializeConversation(prep.turnPrefixMessages);
        const prefixPrompt = buildSummarizationUserPrompt({
          conversationText: prefixText,
          splitTurnPrefix: true,
        });
        const prefixSummary = await runSummarization(
          prefixPrompt,
          summarizationMaxTokens(reserve, 0.5, modelMax),
        );
        summary = combineSplitTurnSummary(summary, prefixSummary);
      }

      const details = computeFileLists(prep.fileOps);
      const condenseId = createCondenseId();
      const summaryMessage = createSummaryMessage(summary.trim(), condenseId, details);
      const next = applyCompaction(messages, condenseId, prep.firstKeptIndex, summaryMessage);
      const tokensAfter = getEffectiveMessages(next).reduce((n, m) => n + estimateMessageTokens(m), 0);
      summaryMessage.compactTokens = {
        before: prep.tokensBefore,
        after: tokensAfter,
      };

      currentState.setMessages(next);
      currentState.setTokenUsage(null);
      await currentState.saveActiveConversation();
      return true;
    } catch (e) {
      console.error('[useAutoCompact] Compaction failed:', e);
      return false;
    } finally {
      useStore.getState().setIsCompacting(false);
    }
  }, [runSummarization]);

  const checkAndAutoCompact = useCallback(async (opts?: {
    overflow?: boolean;
    incomplete?: boolean;
  }): Promise<boolean> => {
    const currentState = useStore.getState();
    if (!currentState.compactConfig.enabled && !opts?.overflow) {
      return false;
    }

    if (opts?.overflow) {
      if (overflowAttemptedRef.current) return false;
      overflowAttemptedRef.current = true;
      const msgs = currentState.messages;
      let endIndex = msgs.length;
      const last = msgs[msgs.length - 1];
      if (opts.incomplete && last && (last.role === 'assistant' || last.role === 'error')) {
        endIndex = msgs.length - 1;
        const tagged: Message = { ...last, condenseParent: last.condenseParent || `overflow_${Date.now()}`, isCompacted: true };
        currentState.setMessages([...msgs.slice(0, -1), tagged]);
      }
      const ok = await compactConversation({ endIndex });
      return ok;
    }

    overflowAttemptedRef.current = false;

    const tools = await getAllTools();
    const model = currentState.providerConfig.model || '';
    const prepared = prepareChatRequest({
      getState: () => useStore.getState(),
      rawTools: tools,
      supportsFunctionCalling: supportsFunctionCalling(model),
      isXAIImageModel: isXAIImageModel(model),
    });
    const contextWindow = prepared.contextWindow;
    const currentTokens = prepared.estimatedContextTokens;
    const reserve = reserveTokensForConfig(useStore.getState().compactConfig, contextWindow);
    if (shouldCompact(currentTokens, contextWindow, reserve)) {
      return compactConversation();
    }
    return false;
  }, [compactConversation, getAllTools, supportsFunctionCalling, isXAIImageModel]);

  const tryOverflowRecovery = useCallback(async (errorText: string, incomplete: boolean): Promise<boolean> => {
    if (!isContextOverflow(errorText)) return false;
    if (overflowAttemptedRef.current) return false;
    return checkAndAutoCompact({ overflow: true, incomplete });
  }, [checkAndAutoCompact]);

  return {
    compactConversation,
    checkAndAutoCompact,
    tryOverflowRecovery,
  };
}
