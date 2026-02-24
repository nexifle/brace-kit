/**
 * Compact Utilities
 *
 * Pure utility functions for conversation compaction.
 * No React hooks or side effects - testable in isolation.
 */

import type { Message, CompactConfig, ProviderConfig, CustomProvider } from '../../types/index.ts';
import { getProvider as getProviderUtil } from '../../utils/providerUtils.ts';

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
  compactConfig: CompactConfig
): number {
  const currentProviderId = providerConfig.providerId || '';
  const currentProvider = getProviderUtil(currentProviderId, customProviders);

  return (
    providerConfig.contextWindow ||
    currentProvider.contextWindow ||
    compactConfig.defaultContextWindow
  );
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
  condenseId: string
): Message[] {
  return messages.map(m => {
    if (!m.condenseParent && !m.summary) {
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
 * Check if compaction should be triggered based on token threshold
 */
export function shouldCompact(
  currentTokens: number,
  contextWindow: number,
  threshold: number
): boolean {
  return currentTokens > contextWindow * threshold;
}
