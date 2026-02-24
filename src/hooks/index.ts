/**
 * Hooks Module
 *
 * Centralized exports for all custom React hooks.
 */

// Chat hooks
export { useChat } from './useChat.ts';
export { useMessageBuilder } from './chat/useMessageBuilder.ts';

// Streaming hooks
export { useStreaming } from './useStreaming.ts';
export { useStreamProcessor } from './streaming/useStreamProcessor.ts';
export { addInlineCitations } from './streaming/useStreamProcessor.ts';

// Tool hooks
export { useTools } from './tools/useTools.ts';

// Compact hooks
export { useAutoCompact } from './compact/index.ts';
export {
  SUMMARY_PROMPT,
  extractSummaryFromResponse,
  getContextWindow,
  createCondenseId,
  tagMessagesWithCondenseParent,
  createSummaryMessage,
  getMessagesToCompact,
  shouldCompact,
} from './compact/index.ts';

// Other hooks
export { useMemory } from './useMemory.ts';
export { useMCP } from './useMCP.ts';
export { useProvider } from './useProvider.ts';
export { usePageContext } from './usePageContext.ts';
export { useFileAttachments } from './useFileAttachments.ts';
