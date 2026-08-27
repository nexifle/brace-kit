/**
 * Compact Hooks Module
 *
 * Centralized exports for conversation compaction functionality.
 */

export { useAutoCompact } from './useAutoCompact.ts';
export {
  SUMMARY_PROMPT,
  SUMMARIZATION_PROMPT,
  extractSummaryFromResponse,
  getContextWindow,
  createCondenseId,
  tagMessagesWithCondenseParent,
  createSummaryMessage,
  getMessagesToCompact,
  shouldCompact,
  reserveTokensForConfig,
  keepRecentTokensForConfig,
  sanitizeCompactConfigPatch,
  cloneMessagesForBranch,
} from './compactUtils.ts';
