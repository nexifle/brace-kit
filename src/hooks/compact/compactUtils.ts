/**
 * Compact Utilities
 *
 * Pure utility functions for conversation compaction.
 * No React hooks or side effects - testable in isolation.
 */

import type { Message, CompactConfig, ProviderConfig, CustomProvider, FetchedModelsCache } from '../../types/index.ts';
import { getProvider as getProviderUtil } from '../../utils/providerUtils.ts';
import { getEffectiveContextWindow } from '../../providers/modelSpecs.ts';
import {
  DEFAULT_KEEP_RECENT_TOKENS,
  DEFAULT_RESERVE_TOKENS,
  resolveReserveTokens,
} from '../../utils/estimateTokens.ts';
import { SUMMARIZATION_PROMPT } from './compactPrompts.ts';
import {
  formatFileOperations,
  prepareCompaction,
} from './prepareCompaction.ts';

export {
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
} from './compactPrompts.ts';

/** @deprecated Use SUMMARIZATION_PROMPT. Kept for import compatibility. */
export const DEFAULT_SUMMARY_PROMPT = SUMMARIZATION_PROMPT;
export const SUMMARY_PROMPT = SUMMARIZATION_PROMPT;

export function extractSummaryFromResponse(fullContent: string): string {
  let summary = fullContent;
  const summaryMatch = fullContent.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (summaryMatch && summaryMatch[1]) {
    summary = summaryMatch[1].trim();
  } else {
    summary = fullContent.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  }
  return summary;
}

export function getContextWindow(
  providerConfig: ProviderConfig,
  customProviders: CustomProvider[],
  compactConfig: CompactConfig,
  fetched?: FetchedModelsCache | null,
): number {
  const currentProviderId = providerConfig.providerId || '';
  const currentProvider = getProviderUtil(currentProviderId, customProviders);
  const custom = customProviders.find((p) => p.id === currentProviderId);

  return getEffectiveContextWindow(
    providerConfig,
    custom,
    compactConfig,
    fetched,
  ) || currentProvider.contextWindow || compactConfig.defaultContextWindow;
}

export function createCondenseId(): string {
  return `condense_${Date.now()}`;
}

/**
 * Tag discarded prefix using a safe cut at keepRecentTokens.
 */
export function tagMessagesWithCondenseParent(
  messages: Message[],
  condenseId: string,
  keepRecentTokens: number = DEFAULT_KEEP_RECENT_TOKENS,
): Message[] {
  if (keepRecentTokens <= 0) {
    return messages.map((m) => {
      if (!m.condenseParent && !m.summary) {
        return { ...m, condenseParent: condenseId, isCompacted: true };
      }
      return m;
    });
  }
  const prep = prepareCompaction(messages, keepRecentTokens);
  const firstKept = prep?.firstKeptIndex;
  if (firstKept == null) {
    return messages.map((m, i) => {
      const isLast = i === messages.length - 1;
      if (!m.condenseParent && !m.summary && !isLast) {
        return { ...m, condenseParent: condenseId, isCompacted: true };
      }
      return m;
    });
  }
  return messages.map((m, i) => {
    if (i < firstKept && !m.condenseParent && !m.summary) {
      return { ...m, condenseParent: condenseId, isCompacted: true };
    }
    return m;
  });
}

export function createSummaryMessage(
  summary: string,
  condenseId: string,
  details?: { readFiles: string[]; modifiedFiles: string[] },
  compactTokens?: { before: number; after: number },
): Message {
  const files = details ? formatFileOperations(details) : '';
  const body = `${summary.trim()}${files}`;
  return {
    role: 'user',
    content: `[CONTEXT CHECKPOINT]\n${body}`,
    summary: body,
    isCompacted: true,
    condenseId,
    ...(details ? { compactDetails: details } : {}),
    ...(compactTokens ? { compactTokens } : {}),
  };
}

export function getMessagesToCompact(messages: Message[]): Message[] {
  return messages.filter((m) => !m.condenseParent && !m.summary);
}

export function cloneMessagesForBranch(messages: Message[], messageIndex: number): Message[] {
  if (messageIndex < 0 || messages.length === 0) return [];

  return messages
    .slice(0, messageIndex + 1)
    .filter((m) => !m.summary)
    .map((m) => {
      const cloned: Message = { ...m };
      delete cloned.isCompacted;
      delete cloned.condenseParent;
      delete cloned.condenseId;
      delete cloned.summary;
      delete cloned.compactDetails;
      delete cloned.compactTokens;
      return cloned;
    });
}

export function shouldCompact(
  currentTokens: number,
  contextWindow: number,
  reserveTokens: number,
): boolean {
  return currentTokens > contextWindow - reserveTokens;
}

export const RESERVE_TOKENS_MIN = 1024;
export const RESERVE_TOKENS_MAX = 128000;
export const KEEP_RECENT_TOKENS_MIN = 1024;
export const KEEP_RECENT_TOKENS_MAX = 200000;
export const COMPACT_AT_MIN = 0.5;
export const COMPACT_AT_MAX = 0.95;
export const KEEP_RECENT_RATIO_MIN = 0.05;
export const KEEP_RECENT_RATIO_MAX = 0.4;
export const DEFAULT_COMPACT_AT = 0.87;
export const DEFAULT_KEEP_RECENT_RATIO = 0.16;

export function clampCompactTokenSetting(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clampRatio(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function sanitizeCompactConfigPatch(
  config: Partial<CompactConfig>,
): Partial<CompactConfig> {
  const next = { ...config };
  if (next.prompt != null) next.prompt = '';
  if (next.reserveTokens != null) {
    next.reserveTokens = clampCompactTokenSetting(
      next.reserveTokens,
      RESERVE_TOKENS_MIN,
      RESERVE_TOKENS_MAX,
    );
  }
  if (next.keepRecentTokens != null) {
    next.keepRecentTokens = clampCompactTokenSetting(
      next.keepRecentTokens,
      KEEP_RECENT_TOKENS_MIN,
      KEEP_RECENT_TOKENS_MAX,
    );
  }
  if (next.threshold != null) {
    next.threshold = clampRatio(next.threshold, COMPACT_AT_MIN, COMPACT_AT_MAX);
  }
  if (next.keepRecentRatio != null) {
    next.keepRecentRatio = clampRatio(next.keepRecentRatio, KEEP_RECENT_RATIO_MIN, KEEP_RECENT_RATIO_MAX);
  }
  return next;
}

export function compactAtRatio(compactConfig: CompactConfig): number {
  if (compactConfig.threshold != null && compactConfig.threshold > 0) {
    return clampRatio(compactConfig.threshold, COMPACT_AT_MIN, COMPACT_AT_MAX);
  }
  return DEFAULT_COMPACT_AT;
}

export function keepRecentRatioForConfig(compactConfig: CompactConfig): number {
  if (compactConfig.keepRecentRatio != null && compactConfig.keepRecentRatio > 0) {
    return clampRatio(compactConfig.keepRecentRatio, KEEP_RECENT_RATIO_MIN, KEEP_RECENT_RATIO_MAX);
  }
  if (compactConfig.keepRecentTokens && compactConfig.defaultContextWindow) {
    return clampRatio(
      compactConfig.keepRecentTokens / compactConfig.defaultContextWindow,
      KEEP_RECENT_RATIO_MIN,
      KEEP_RECENT_RATIO_MAX,
    );
  }
  return DEFAULT_KEEP_RECENT_RATIO;
}

export function reserveTokensForConfig(
  compactConfig: CompactConfig,
  contextWindow: number,
): number {
  const ratio = compactAtRatio(compactConfig);
  if (contextWindow > 0) {
    return clampCompactTokenSetting(
      Math.round(contextWindow * (1 - ratio)),
      RESERVE_TOKENS_MIN,
      RESERVE_TOKENS_MAX,
    );
  }
  return resolveReserveTokens(
    compactConfig.reserveTokens,
    compactConfig.threshold,
    contextWindow,
  ) || DEFAULT_RESERVE_TOKENS;
}

export function keepRecentTokensForConfig(
  compactConfig: CompactConfig,
  contextWindow: number,
): number {
  const ratio = keepRecentRatioForConfig(compactConfig);
  if (contextWindow > 0) {
    return clampCompactTokenSetting(
      Math.round(contextWindow * ratio),
      KEEP_RECENT_TOKENS_MIN,
      KEEP_RECENT_TOKENS_MAX,
    );
  }
  return compactConfig.keepRecentTokens ?? DEFAULT_KEEP_RECENT_TOKENS;
}

