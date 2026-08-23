// ==================== Agent context (cache-safe bounding) ====================
//
// Slide agent sessions append the full working transcript on every model round.
// Prompt caches (OpenAI/Gemini auto-prefix, Anthropic cache_control) require
// that prefix bytes never change. So we:
//   A. Cap each tool result ONCE when it is ingested (never rewrite later).
//   C. Rare stop-the-world compact: same prefix + a summarize user message at
//      the tail; then replace working with system + summary + last real user.

import type { APIMessage } from '../types/index.ts';
import { DEFAULT_SUMMARY_PROMPT, extractSummaryFromResponse } from '../hooks/compact/compactUtils.ts';

/** Max characters kept in a tool result that enters `working`. */
export const DEFAULT_TOOL_RESULT_CAP = 12_000;

/**
 * Soft budget on serialized working-transcript characters. ~80k tokens at
 * ~4 chars/token. Compact fires at or above this, not every round.
 */
export const DEFAULT_AGENT_CHAR_BUDGET = 320_000;

const HEAD_FRAC = 0.4;
const TAIL_FRAC = 0.4;

export const COMPACT_USER_MARKER = 'SYSTEM OPERATION — CONTEXT SUMMARIZATION';

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
    content: `${DEFAULT_SUMMARY_PROMPT}

After the summary, the session will continue. Preserve user intent, file paths touched, and unfinished work. Do not call tools.`,
  };
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
): APIMessage[] {
  const summary = extractSummaryFromResponse(rawSummary).trim() || rawSummary.trim();
  const system = leadingSystem(messages);
  const lastUser = lastRealUserMessage(messages);
  const out: APIMessage[] = [];
  if (system) out.push(system);
  out.push({
    role: 'user',
    content:
      `[SESSION SUMMARY]\n${summary}\n\n` +
      'Continue from this summary. Use list_files and read_file for current workspace files; do not assume stale file bodies from the summary.',
  });
  if (lastUser) {
    const lastText = typeof lastUser.content === 'string' ? lastUser.content : '';
    const already =
      typeof out[out.length - 1]?.content === 'string' &&
      (out[out.length - 1].content as string).includes(lastText.slice(0, 80));
    if (lastText && !already) out.push(lastUser);
  }
  return out;
}

export interface AgentContextOptions {
  toolResultCap: number;
  charBudget: number;
}

export const DEFAULT_AGENT_CONTEXT: AgentContextOptions = {
  toolResultCap: DEFAULT_TOOL_RESULT_CAP,
  charBudget: DEFAULT_AGENT_CHAR_BUDGET,
};
