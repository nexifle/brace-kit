// ==================== Agent context (cache-safe bounding) ====================
//
// Slide agent sessions append the full working transcript on every model round.
// Prompt caches (OpenAI/Gemini auto-prefix, Anthropic cache_control) require
// that prefix bytes never change. So we:
//   A. Cap each tool result ONCE when it is ingested (never rewrite later).
//   C. Rare stop-the-world compact: dedicated summarizer, then rebuild as
//      system + structured checkpoint + recent verbatim tail.

import type { APIMessage, Message } from '../types/index.ts';
import { extractSummaryFromResponse } from '../hooks/compact/compactUtils.ts';
import {
  applyCompaction,
  buildSummarizationApiMessages,
  buildSummarizationUserPrompt,
  combineSplitTurnSummary,
  computeFileLists,
  formatFileOperations,
  prepareCompaction,
  serializeConversation,
} from '../hooks/compact/prepareCompaction.ts';
import { DEFAULT_KEEP_RECENT_TOKENS, getEffectiveMessages } from '../utils/estimateTokens.ts';

/** Max characters kept in a tool result that enters `working`. */
export const DEFAULT_TOOL_RESULT_CAP = 12_000;

/**
 * Soft budget on serialized working-transcript characters. ~80k tokens at
 * ~4 chars/token. Compact fires at or above this, not every round.
 */
export const DEFAULT_AGENT_CHAR_BUDGET = 320_000;

const HEAD_FRAC = 0.4;
const TAIL_FRAC = 0.4;

export const COMPACT_USER_MARKER = '[CONTEXT CHECKPOINT]';

export function capToolResult(
  content: string,
  limit: number = DEFAULT_TOOL_RESULT_CAP,
): string {
  if (content.length <= limit) return content;
  const headLen = Math.max(500, Math.floor(limit * HEAD_FRAC));
  const tailLen = Math.max(500, Math.floor(limit * TAIL_FRAC));
  const omitted = content.length - headLen - tailLen;
  return (
    content.slice(0, headLen) +
    `\n\n[truncated ${omitted} chars; call read_file for current file contents]\n\n` +
    content.slice(-tailLen)
  );
}

export function messageChars(msg: APIMessage): number {
  const c = msg.content;
  let n = 0;
  if (typeof c === 'string') n += c.length;
  else if (Array.isArray(c)) {
    for (const p of c) {
      if (p.text) n += p.text.length;
      if (p.image_url?.url) n += p.image_url.url.length;
    }
  }
  if (msg.reasoningContent) n += msg.reasoningContent.length;
  if (msg.toolCalls) {
    for (const t of msg.toolCalls) n += (t.arguments?.length ?? 0) + t.name.length;
  }
  return n;
}

export function estimateChars(messages: APIMessage[]): number {
  let n = 0;
  for (const m of messages) n += messageChars(m);
  return n;
}

export function shouldCompact(
  messages: APIMessage[],
  budget: number = DEFAULT_AGENT_CHAR_BUDGET,
): boolean {
  return estimateChars(messages) >= budget;
}

export function buildCompactUserMessage(): APIMessage {
  return {
    role: 'user',
    content: buildSummarizationUserPrompt({ conversationText: '' }),
  };
}

export function apiMessagesToMessages(messages: APIMessage[]): Message[] {
  return messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    toolCalls: m.toolCalls,
    toolCallId: m.toolCallId,
    name: m.name,
    reasoningContent: m.reasoningContent,
    reasoningSignature: m.reasoningSignature,
  }));
}

export function messagesToApi(messages: Message[]): APIMessage[] {
  return messages
    .filter((m) => m.role !== 'error')
    .map((m) => ({
      role: m.role === 'system' || m.role === 'user' || m.role === 'assistant' || m.role === 'tool'
        ? m.role
        : 'user',
      content: m.content,
      toolCalls: m.toolCalls,
      toolCallId: m.toolCallId,
      name: m.name,
      reasoningContent: m.reasoningContent,
      reasoningSignature: m.reasoningSignature,
    }));
}

export function isCompactUserMessage(msg: APIMessage): boolean {
  const text = typeof msg.content === 'string' ? msg.content : '';
  return msg.role === 'user' && text.includes(COMPACT_USER_MARKER);
}

/** Last user turn that is not the compact instruction. */
export function lastRealUserMessage(messages: APIMessage[]): APIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'user' && !isCompactUserMessage(m)) return m;
  }
  return undefined;
}

export function leadingSystem(messages: APIMessage[]): APIMessage | undefined {
  return messages[0]?.role === 'system' ? messages[0] : undefined;
}

export function workingFromSummary(
  messages: APIMessage[],
  rawSummary: string,
  keepRecentTokens: number = DEFAULT_KEEP_RECENT_TOKENS,
): APIMessage[] {
  const summary = extractSummaryFromResponse(rawSummary).trim() || rawSummary.trim();
  const asMessages = apiMessagesToMessages(messages);
  const prep = prepareCompaction(asMessages, keepRecentTokens, undefined, { force: true });
  const details = prep ? computeFileLists(prep.fileOps) : { readFiles: [], modifiedFiles: [] };
  const body = `${summary}${formatFileOperations(details)}`;
  const checkpoint: Message = {
    role: 'user',
    content: `[CONTEXT CHECKPOINT]\n${body}`,
    summary: body,
    isCompacted: true,
    condenseId: `condense_agent_${Date.now()}`,
    compactDetails: details,
  };
  if (!prep) {
    const system = leadingSystem(messages);
    const lastUser = lastRealUserMessage(messages);
    const out: APIMessage[] = [];
    if (system) out.push(system);
    out.push({ role: 'user', content: checkpoint.content });
    if (lastUser) out.push(lastUser);
    return out;
  }
  const next = applyCompaction(asMessages, checkpoint.condenseId!, prep.firstKeptIndex, checkpoint);
  const kept = getEffectiveMessages(next);
  const system = leadingSystem(messages);
  const api = messagesToApi(kept);
  if (system && api[0]?.role !== 'system') return [system, ...api];
  return api;
}

export interface AgentSummarizationPlan {
  history: APIMessage[];
  prefix?: APIMessage[];
}

export function buildAgentSummarizationPlan(
  working: APIMessage[],
  keepRecentTokens: number = DEFAULT_KEEP_RECENT_TOKENS,
): AgentSummarizationPlan | null {
  const asMessages = apiMessagesToMessages(working);
  const prep = prepareCompaction(asMessages, keepRecentTokens, undefined, { force: true });
  if (!prep) return null;
  const historyText = serializeConversation(prep.messagesToSummarize);
  const history = buildSummarizationApiMessages(buildSummarizationUserPrompt({
    conversationText: historyText || '(empty)',
    previousSummary: prep.previousSummary,
  }));
  if (prep.isSplitTurn && prep.turnPrefixMessages.length) {
    const prefixText = serializeConversation(prep.turnPrefixMessages);
    return {
      history,
      prefix: buildSummarizationApiMessages(buildSummarizationUserPrompt({
        conversationText: prefixText,
        splitTurnPrefix: true,
      })),
    };
  }
  return { history };
}

export function buildAgentSummarizationRequest(working: APIMessage[]): APIMessage[] | null {
  return buildAgentSummarizationPlan(working)?.history ?? null;
}

export function combineAgentCompactSummary(historySummary: string, prefixSummary?: string): string {
  if (!prefixSummary?.trim()) return historySummary;
  return combineSplitTurnSummary(historySummary, prefixSummary);
}

export interface AgentContextOptions {
  toolResultCap: number;
  charBudget: number;
}

export const DEFAULT_AGENT_CONTEXT: AgentContextOptions = {
  toolResultCap: DEFAULT_TOOL_RESULT_CAP,
  charBudget: DEFAULT_AGENT_CHAR_BUDGET,
};
