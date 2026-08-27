/**
 * Checkpoint-and-replay compaction: cut points, serialization, file ops.
 *
 * @copyright Adapted from https://github.com/earendil-works/pi
 *   packages/coding-agent/src/core/compaction/compaction.ts
 *   packages/coding-agent/src/core/compaction/utils.ts
 */

import type { APIMessage, Message, ToolCall } from '../../types/index.ts';
import { estimateMessageTokens } from '../../utils/estimateTokens.ts';
import {
  SUMMARIZATION_PROMPT,
  SUMMARIZATION_SYSTEM_PROMPT,
  TURN_PREFIX_SUMMARIZATION_PROMPT,
  UPDATE_SUMMARIZATION_PROMPT,
} from './compactPrompts.ts';

export const TOOL_RESULT_MAX_CHARS = 2000;

export interface FileOperations {
  read: Set<string>;
  written: Set<string>;
  edited: Set<string>;
}

export interface CompactFileDetails {
  readFiles: string[];
  modifiedFiles: string[];
}

export interface CutPointResult {
  firstKeptIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
}

export interface CompactionPreparation {
  firstKeptIndex: number;
  messagesToSummarize: Message[];
  turnPrefixMessages: Message[];
  isSplitTurn: boolean;
  tokensBefore: number;
  previousSummary?: string;
  previousDetails?: CompactFileDetails;
  fileOps: FileOperations;
}

export function createFileOps(): FileOperations {
  return { read: new Set(), written: new Set(), edited: new Set() };
}

function parseToolArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function pathFromArgs(args: Record<string, unknown>): string | undefined {
  for (const key of ['path', 'file_path', 'filePath', 'target_file']) {
    const v = args[key];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function classifyToolName(name: string): 'read' | 'write' | 'edit' | undefined {
  const n = name.toLowerCase();
  if (n === 'read' || n === 'read_file' || n === 'readfile') return 'read';
  if (n === 'write' || n === 'write_file' || n === 'writefile') return 'write';
  if (n === 'edit' || n === 'str_replace' || n === 'search_replace' || n === 'apply_patch') return 'edit';
  return undefined;
}

export function extractFileOpsFromToolCalls(toolCalls: ToolCall[] | undefined, fileOps: FileOperations): void {
  if (!toolCalls) return;
  for (const tc of toolCalls) {
    const kind = classifyToolName(tc.name || '');
    if (!kind) continue;
    const path = pathFromArgs(parseToolArgs(tc.arguments));
    if (!path) continue;
    if (kind === 'read') fileOps.read.add(path);
    else if (kind === 'write') fileOps.written.add(path);
    else fileOps.edited.add(path);
  }
}

export function extractFileOpsFromMessage(message: Message, fileOps: FileOperations): void {
  extractFileOpsFromToolCalls(message.toolCalls, fileOps);
}

export function mergeFileDetails(fileOps: FileOperations, previous?: CompactFileDetails): void {
  if (!previous) return;
  for (const f of previous.readFiles) fileOps.read.add(f);
  for (const f of previous.modifiedFiles) {
    fileOps.edited.add(f);
  }
}

export function computeFileLists(fileOps: FileOperations): CompactFileDetails {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readFiles = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles, modifiedFiles };
}

export function formatFileOperations(details: CompactFileDetails): string {
  const sections: string[] = [];
  if (details.readFiles.length > 0) {
    sections.push(`<read-files>\n${details.readFiles.join('\n')}\n</read-files>`);
  }
  if (details.modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${details.modifiedFiles.join('\n')}\n</modified-files>`);
  }
  if (sections.length === 0) return '';
  return `\n\n${sections.join('\n\n')}`;
}

function messageText(message: Message): string {
  return typeof message.content === 'string' ? message.content : '';
}

function truncateForSummary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const truncatedChars = text.length - maxChars;
  return `${text.slice(0, maxChars)}\n\n[... ${truncatedChars} more characters truncated]`;
}

export function serializeConversation(messages: Message[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' || msg.role === 'system') {
      const content = messageText(msg);
      if (content) parts.push(`[User]: ${content}`);
    } else if (msg.role === 'assistant') {
      if (msg.reasoningContent) {
        parts.push(`[Assistant thinking]: ${msg.reasoningContent}`);
      }
      const text = messageText(msg);
      if (text) parts.push(`[Assistant]: ${text}`);
      if (msg.toolCalls?.length) {
        const calls = msg.toolCalls.map((tc) => {
          const args = parseToolArgs(tc.arguments);
          const argsStr = Object.entries(args)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ');
          return `${tc.name}(${argsStr})`;
        });
        parts.push(`[Assistant tool calls]: ${calls.join('; ')}`);
      }
    } else if (msg.role === 'tool' || msg.role === 'error') {
      const content = messageText(msg);
      if (content) {
        const label = msg.role === 'error' ? '[Error]' : '[Tool result]';
        parts.push(`${label}: ${truncateForSummary(content, TOOL_RESULT_MAX_CHARS)}`);
      }
    }
  }

  return parts.join('\n\n');
}

export function isCutPointMessage(message: Message): boolean {
  if (message.role === 'tool') return false;
  return message.role === 'user' || message.role === 'assistant' || message.role === 'system' || message.role === 'error';
}

export function isTurnStartMessage(message: Message): boolean {
  if (message.summary && message.condenseId) return true;
  return message.role === 'user' || message.role === 'system';
}

export interface CompactableRange {
  startIndex: number;
  endIndex: number;
}

/** Inclusive start (after last checkpoint) through exclusive end. */
export function compactableRange(messages: Message[], endIndex?: number): CompactableRange {
  const end = endIndex ?? messages.length;
  let start = 0;
  for (let i = end - 1; i >= 0; i--) {
    if (messages[i].summary && messages[i].condenseId) {
      start = i + 1;
      break;
    }
  }
  return { startIndex: start, endIndex: end };
}

export function findCutPoint(
  messages: Message[],
  keepRecentTokens: number,
  range?: CompactableRange,
): CutPointResult {
  const { startIndex, endIndex } = range ?? compactableRange(messages);
  const cutPoints: number[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    if (isCutPointMessage(messages[i])) cutPoints.push(i);
  }

  if (cutPoints.length === 0) {
    return { firstKeptIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
  }

  let accumulatedTokens = 0;
  let cutIndex = cutPoints[0];

  for (let i = endIndex - 1; i >= startIndex; i--) {
    const tokens = estimateMessageTokens(messages[i]);
    if (tokens === 0 && messages[i].role !== 'tool') continue;
    accumulatedTokens += tokens;
    if (accumulatedTokens >= keepRecentTokens) {
      for (const c of cutPoints) {
        if (c >= i) {
          cutIndex = c;
          break;
        }
      }
      break;
    }
  }

  const startsTurn = isTurnStartMessage(messages[cutIndex]);
  let turnStartIndex = -1;
  if (!startsTurn) {
    for (let i = cutIndex; i >= startIndex; i--) {
      if (isTurnStartMessage(messages[i])) {
        turnStartIndex = i;
        break;
      }
    }
  }

  return {
    firstKeptIndex: cutIndex,
    turnStartIndex,
    isSplitTurn: !startsTurn && turnStartIndex !== -1,
  };
}

export function estimateTokensBefore(messages: Message[], range: CompactableRange): number {
  let n = 0;
  for (let i = range.startIndex; i < range.endIndex; i++) {
    n += estimateMessageTokens(messages[i]);
  }
  return n;
}

export function previousCheckpoint(messages: Message[], beforeIndex: number): {
  summary?: string;
  details?: CompactFileDetails;
} {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.summary && m.condenseId) {
      return {
        summary: m.summary,
        details: m.compactDetails,
      };
    }
  }
  return {};
}

function forceLastTurnKeep(messages: Message[], range: CompactableRange): number | null {
  for (let i = range.endIndex - 1; i > range.startIndex; i--) {
    if (isTurnStartMessage(messages[i])) return i;
  }
  const last = range.endIndex - 1;
  return last > range.startIndex ? last : null;
}

export function prepareCompaction(
  messages: Message[],
  keepRecentTokens: number,
  endIndex?: number,
  opts?: { force?: boolean },
): CompactionPreparation | null {
  const range = compactableRange(messages, endIndex);
  if (range.endIndex - range.startIndex < 2) return null;

  const cut = findCutPoint(messages, keepRecentTokens, range);
  let firstKeptIndex = cut.firstKeptIndex;
  let isSplitTurn = cut.isSplitTurn;
  let turnStartIndex = cut.turnStartIndex;
  if (firstKeptIndex <= range.startIndex) {
    if (!opts?.force) return null;
    const forced = forceLastTurnKeep(messages, range);
    if (forced == null) return null;
    firstKeptIndex = forced;
    isSplitTurn = false;
    turnStartIndex = -1;
  }

  const messagesToSummarize = messages.slice(
    range.startIndex,
    isSplitTurn ? turnStartIndex : firstKeptIndex,
  );
  const turnPrefixMessages = isSplitTurn
    ? messages.slice(turnStartIndex, firstKeptIndex)
    : [];

  const prev = previousCheckpoint(messages, range.startIndex + 1);
  const fileOps = createFileOps();
  mergeFileDetails(fileOps, prev.details);
  for (const m of [...messagesToSummarize, ...turnPrefixMessages]) {
    extractFileOpsFromMessage(m, fileOps);
  }

  return {
    firstKeptIndex,
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn,
    tokensBefore: estimateTokensBefore(messages, range),
    previousSummary: prev.summary,
    previousDetails: prev.details,
    fileOps,
  };
}

export function summarizationMaxTokens(reserveTokens: number, fraction: number, modelMaxTokens?: number): number {
  const fromReserve = Math.max(256, Math.floor(fraction * reserveTokens));
  if (modelMaxTokens && modelMaxTokens > 0) return Math.min(fromReserve, modelMaxTokens);
  return fromReserve;
}

export function buildSummarizationUserPrompt(args: {
  conversationText: string;
  previousSummary?: string;
  customInstructions?: string;
  splitTurnPrefix?: boolean;
}): string {
  const { conversationText, previousSummary, customInstructions, splitTurnPrefix } = args;
  let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
  if (previousSummary && !splitTurnPrefix) {
    promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
  }
  let base = splitTurnPrefix
    ? TURN_PREFIX_SUMMARIZATION_PROMPT
    : previousSummary
      ? UPDATE_SUMMARIZATION_PROMPT
      : SUMMARIZATION_PROMPT;
  if (customInstructions?.trim()) {
    base = `${base}\n\nAdditional focus: ${customInstructions.trim()}`;
  }
  promptText += base;
  return promptText;
}

export function buildSummarizationApiMessages(userPrompt: string): APIMessage[] {
  return [
    { role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}

export function combineSplitTurnSummary(historySummary: string, prefixSummary: string): string {
  return `${historySummary.trim()}\n\n---\n\n**Turn Context (split turn):**\n\n${prefixSummary.trim()}`;
}

export function applyCompaction(
  messages: Message[],
  condenseId: string,
  firstKeptIndex: number,
  summaryMessage: Message,
): Message[] {
  const tagged = messages.map((m, i) => {
    if (i < firstKeptIndex && !m.condenseParent && !(m.summary && m.condenseId === condenseId)) {
      return { ...m, condenseParent: condenseId, isCompacted: true };
    }
    return m;
  });
  return [...tagged, summaryMessage];
}

const OVERFLOW_RE = /context[\s_-]*(?:window|length)|too (?:long|large)|maximum context|prompt is too (?:long|large)|token limit|context_length|reduce the length/i;

export function isContextOverflow(text: string | undefined | null): boolean {
  if (!text) return false;
  return OVERFLOW_RE.test(text);
}

export function isRecoverableLength(message: Message | undefined): boolean {
  if (!message) return false;
  if (message.truncated) return true;
  if (message.role === 'error' && isContextOverflow(message.content)) return true;
  return false;
}
