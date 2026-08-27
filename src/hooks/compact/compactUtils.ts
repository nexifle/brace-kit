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
  estimateMessageTokens,
  resolveReserveTokens,
} from '../../utils/estimateTokens.ts';

/**
 * Default summary prompt template for conversation compaction
 * Exported as DEFAULT_SUMMARY_PROMPT for external reference (e.g., settings UI)
 */
export const DEFAULT_SUMMARY_PROMPT = `SYSTEM OPERATION — CONTEXT SUMMARIZATION
This is not a user message. When determining "user intent" and "most recent
user request", exclude this message entirely and base all assessments solely
on the conversation that occurred before this point.

Objective: Produce a high-fidelity, dense summary that allows the conversation
to resume seamlessly — as if no condensation occurred.

Output language must match the conversation language (e.g., if the conversation
is in Bahasa Indonesia, respond in Bahasa Indonesia).

---

First, reason through the conversation inside <analysis> tags:
1. Walk through each message chronologically.
2. Identify user intents, key decisions, technical choices, and shared data/code.
3. Note errors encountered, fixes applied, and user reactions to those fixes.

Then produce the final output inside <summary> tags using this exact structure:

<analysis>
[Chronological reasoning and breakdown of the conversation]
</analysis>

<summary>
1. Primary Request and Intent
   - Core goal of the conversation
   - Sub-intents or side-requests expressed by the user

2. Key Concepts
   - Frameworks, technologies, tools, or abstract concepts discussed
   - Any definitions or context uniquely established in this conversation

3. Files, Code, and Key Data
   - [File/Section Name or Data Label]
      - Importance: Why was this examined or modified?
      - Changes: What was added, removed, or transformed?
      - Snippet: Most critical code/data verbatim

4. Errors and Fixes
   - [Error Description]
      - Fix: How was it resolved?
      - User Feedback: What did the user say about this fix?

5. Problem Solving
   - Challenges successfully resolved and the reasoning behind each solution
   - Open issues or ongoing troubleshooting logic

6. User Message Log
   - Chronological list of user messages, closely paraphrased to preserve
     intent and voice; include exact quotes where wording is critical

7. Pending Tasks
   - Tasks explicitly requested by the user that remain incomplete

8. Current Work
   - What was being worked on in the last 2–3 exchanges
   - Last known state of the task (e.g., partial code, unresolved decision)

9. Next Step
   - Proposed immediate action based on current work
   - Verbatim quote from the final exchange to anchor context and prevent drift
</summary>`;

/**
 * Alias for backward compatibility
 */
export const SUMMARY_PROMPT = DEFAULT_SUMMARY_PROMPT;

/**
 * Get the effective compact prompt
 * Uses custom prompt if provided and non-empty, otherwise defaults to SUMMARY_PROMPT
 */
export function getCompactPrompt(customPrompt?: string): string {
  if (customPrompt && customPrompt.trim()) {
    return customPrompt.trim();
  }
  return SUMMARY_PROMPT;
}

/**
 * Extract summary content from API response
 * Handles <summary> tags and strips <analysis> tags if present
 */
export function extractSummaryFromResponse(fullContent: string): string {
  let summary = fullContent;

  // Try to extract content between <summary> tags if present
  const summaryMatch = fullContent.match(/<summary>([\s\S]*?)<\/summary>/i);
  if (summaryMatch && summaryMatch[1]) {
    summary = summaryMatch[1].trim();
  } else {
    // If no <summary> tags but there are <analysis> tags, try to strip analysis
    summary = fullContent.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '').trim();
  }

  return summary;
}

/**
 * Calculate effective context window for the current provider
 */
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

/**
 * Generate a unique condense ID
 */
export function createCondenseId(): string {
  return `condense_${Date.now()}`;
}

/**
 * Tag messages with condenseParent for non-destructive compaction
 * Only tags messages that don't already have condenseParent and aren't summaries
 */
export function tagMessagesWithCondenseParent(
  messages: Message[],
  condenseId: string,
  keepRecentTokens: number = DEFAULT_KEEP_RECENT_TOKENS,
): Message[] {
  const compactableIndexes: number[] = [];
  messages.forEach((m, i) => {
    if (!m.condenseParent && !m.summary) compactableIndexes.push(i);
  });

  const keep = new Set<number>();
  if (keepRecentTokens > 0) {
    let kept = 0;
    for (let k = compactableIndexes.length - 1; k >= 0; k--) {
      const idx = compactableIndexes[k];
      const tokens = estimateMessageTokens(messages[idx]);
      if (keep.size > 0 && kept + tokens > keepRecentTokens) break;
      keep.add(idx);
      kept += tokens;
    }
    if (keep.size === compactableIndexes.length && compactableIndexes.length > 1) {
      keep.delete(compactableIndexes[0]);
    }
  }

  return messages.map((m, i) => {
    if (!m.condenseParent && !m.summary && !keep.has(i)) {
      return { ...m, condenseParent: condenseId, isCompacted: true };
    }
    return m;
  });
}

/**
 * Create a summary message object for the "fresh start" model
 */
export function createSummaryMessage(summary: string, condenseId: string): Message {
  return {
    role: 'user',
    content: `[CONVERSATION SUMMARY]\n${summary}`,
    summary: summary,
    isCompacted: true,
    condenseId: condenseId,
  };
}

/**
 * Filter messages to get only those that should be compacted
 * (messages without condenseParent and not summaries)
 */
export function getMessagesToCompact(messages: Message[]): Message[] {
  return messages.filter(m => !m.condenseParent && !m.summary);
}

/**
 * Clone a conversation prefix into an independent uncompacted branch timeline.
 * Drops summary messages and strips compact metadata so the branch sends the
 * original messages (including attachments) instead of being skipped as condensed.
 */
export function cloneMessagesForBranch(messages: Message[], messageIndex: number): Message[] {
  if (messageIndex < 0 || messages.length === 0) return [];

  return messages
    .slice(0, messageIndex + 1)
    .filter(m => !m.summary)
    .map((m) => {
      const cloned: Message = { ...m };
      delete cloned.isCompacted;
      delete cloned.condenseParent;
      delete cloned.condenseId;
      delete cloned.summary;
      return cloned;
    });
}

/**
 * Check if compaction should be triggered based on token threshold
 */
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

export function clampCompactTokenSetting(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function sanitizeCompactConfigPatch(
  config: Partial<CompactConfig>,
): Partial<CompactConfig> {
  const next = { ...config };
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
  return next;
}

export function reserveTokensForConfig(
  compactConfig: CompactConfig,
  contextWindow: number,
): number {
  return resolveReserveTokens(
    compactConfig.reserveTokens,
    compactConfig.threshold,
    contextWindow,
  );
}
