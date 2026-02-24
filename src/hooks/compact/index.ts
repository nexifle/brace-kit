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
} from './compactUtils.ts';
