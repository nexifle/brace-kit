/**
 * Compact Hooks Module
 *
 * Centralized exports for conversation compaction functionality.
 */

export { useAutoCompact } from './useAutoCompact.ts';
export {
  SUMMARY_PROMPT,
  extractSummaryFromResponse,
  getContextWindow,
  createCondenseId,
  tagMessagesWithCondenseParent,
  createSummaryMessage,
  getMessagesToCompact,
  shouldCompact,
  reserveTokensForConfig,
  sanitizeCompactConfigPatch,
  cloneMessagesForBranch,
} from './compactUtils.ts';
