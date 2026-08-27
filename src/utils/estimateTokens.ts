import type { Attachment, MCPTool, Message, ToolCall, ToolResult } from '../types/index.ts';
import type { TokenUsage } from '../providers/types.ts';

/** Characters counted as one estimated token. */
export const CHARS_PER_TOKEN = 4;

/** Approximate character weight for one image in the heuristic. */
export const IMAGE_CHARS = 4800;

/** Tokens reserved so a completion can still fit in the window. */
export const OUTPUT_SAFETY_TOKENS = 4096;

export const DEFAULT_RESERVE_TOKENS = 16384;
export const DEFAULT_KEEP_RECENT_TOKENS = 20000;

export function estimateTextTokens(text: string | undefined | null): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function jsonLength(value: unknown): number {
  try {
    return JSON.stringify(value ?? null).length;
  } catch {
    return String(value).length;
  }
}

function isImageAttachment(att: Attachment): boolean {
  return att.type === 'image' || att.type === 'pdf';
}

function estimateAttachmentChars(att: Attachment): number {
  const nameLen = att.name?.length || 0;
  if (isImageAttachment(att)) {
    return nameLen + IMAGE_CHARS;
  }
  return nameLen + (att.data?.length || 0);
}

function estimateToolCallChars(tc: ToolCall): number {
  return (tc.name?.length || 0) + (tc.arguments?.length || 0);
}

function estimateToolResultChars(tr: ToolResult): number {
  return (tr.name?.length || 0) + (tr.content?.length || 0);
}

export function estimateMessageChars(message: Message): number {
  let chars = 0;
  if (typeof message.content === 'string') {
    chars += message.content.length;
  }
  if (message.reasoningContent) {
    chars += message.reasoningContent.length;
  }
  if (message.toolCalls) {
    for (const tc of message.toolCalls) {
      chars += estimateToolCallChars(tc);
    }
  }
  if (message.toolResults) {
    for (const tr of message.toolResults) {
      chars += estimateToolResultChars(tr);
    }
  }
  if (message.attachments) {
    for (const att of message.attachments) {
      chars += estimateAttachmentChars(att);
    }
  }
  if (message.generatedImages) {
    chars += message.generatedImages.length * IMAGE_CHARS;
  }
  return chars;
}

export function estimateMessageTokens(message: Message): number {
  return Math.ceil(estimateMessageChars(message) / CHARS_PER_TOKEN);
}

export function estimateToolsTokens(tools: MCPTool[] | undefined | null): number {
  if (!tools || tools.length === 0) return 0;
  return Math.ceil(jsonLength(tools) / CHARS_PER_TOKEN);
}

/**
 * Provider-reported context size from a usage payload.
 * Prefers totalTokenCount; otherwise sums prompt, output, cache, and thinking.
 */
export function calculateContextTokens(usage: TokenUsage | null | undefined): number {
  if (!usage) return 0;
  if (usage.totalTokenCount > 0) return usage.totalTokenCount;
  return (
    (usage.promptTokenCount || 0) +
    (usage.candidatesTokenCount || 0) +
    (usage.cachedContentTokenCount || 0) +
    (usage.thoughtsTokenCount || 0)
  );
}

export function isValidUsage(usage: TokenUsage | null | undefined): boolean {
  return calculateContextTokens(usage) > 0;
}

/** Usage that can describe the current prefix (not aborted, truncated, or empty). */
export function isUsableAssistantUsage(message: Message): boolean {
  if (message.role !== 'assistant') return false;
  if (message.truncated) return false;
  if (message.truncatedReason) return false;
  return isValidUsage(message.usage);
}

export function toolSnapshot(tools: MCPTool[] | undefined | null): { toolsTokens: number; toolNames: string[] } {
  const list = tools ?? [];
  return {
    toolsTokens: estimateToolsTokens(list),
    toolNames: list.map((t) => t.name).filter(Boolean),
  };
}

/** Latest checkpoint index, or -1. */
export function lastCheckpointIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].summary && messages[i].condenseId) return i;
  }
  return -1;
}

/**
 * Active LLM context: latest checkpoint first, then every message that is
 * not tagged as discarded. The checkpoint may be stored after the kept tail
 * so it stays visible at the bottom of the transcript after compact.
 */
export function getEffectiveMessages(messages: Message[]): Message[] {
  const checkpointAt = lastCheckpointIndex(messages);
  if (checkpointAt === -1) {
    return messages.filter((m) => !m.condenseParent);
  }
  const out: Message[] = [messages[checkpointAt]];
  for (let i = 0; i < messages.length; i++) {
    if (i === checkpointAt) continue;
    if (messages[i].condenseParent) continue;
    out.push(messages[i]);
  }
  return out;
}

export interface EstimateContextInput {
  messages: Message[];
  tools?: MCPTool[] | null;
  /** System text that will be sent with the request. Counted only when there is no usable usage. */
  systemPrompt?: string | null;
}

export interface ContextTokenEstimate {
  tokens: number;
  /** False when a compact just ran and no assistant usage exists yet after it. */
  known: boolean;
}

function lastAssistantWithUsage(messages: Message[]): { index: number; message: Message } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (isUsableAssistantUsage(m)) {
      return { index: i, message: m };
    }
  }
  return null;
}

function heuristicMessagesTokens(messages: Message[]): number {
  let tokens = 0;
  for (const m of messages) {
    tokens += estimateMessageTokens(m);
  }
  return tokens;
}

/**
 * Net change in serialized tool-definition size vs the snapshot stored on the
 * last usage-bearing assistant message. Assumes provider usage already includes
 * the tool payload from that request; without a snapshot we add nothing so we
 * do not double-count tools inside prompt usage.
 */
export function toolDefinitionDelta(last: Message, tools: MCPTool[] | undefined | null): number {
  if (last.toolsTokens == null) return 0;
  return estimateToolsTokens(tools) - last.toolsTokens;
}

/**
 * Estimate tokens for the current request context.
 * When a recent assistant message has provider usage, add only later messages
 * and newly added tool definitions instead of recounting the whole thread.
 * With no usable usage, count messages + system prompt + all tool definitions.
 */
export function estimateContextTokens(input: EstimateContextInput): ContextTokenEstimate {
  const effective = getEffectiveMessages(input.messages);
  const checkpointAt = lastCheckpointIndex(input.messages);
  const prefix =
    estimateTextTokens(input.systemPrompt) + estimateToolsTokens(input.tools);

  // Usage on kept-tail assistants is from before the checkpoint and must not
  // be reused. Only provider usage from turns after the checkpoint is valid.
  const afterCheckpoint =
    checkpointAt >= 0 ? input.messages.slice(checkpointAt + 1) : effective;
  const last = lastAssistantWithUsage(afterCheckpoint);

  if (last) {
    const usageTotal = calculateContextTokens(last.message.usage);
    const after = afterCheckpoint.slice(last.index + 1);
    const added = heuristicMessagesTokens(after);
    const extraTools = toolDefinitionDelta(last.message, input.tools);
    return { tokens: usageTotal + added + extraTools, known: true };
  }

  return {
    tokens: heuristicMessagesTokens(effective) + prefix,
    known: true,
  };
}

/**
 * True when the footer can show a token figure. After compact we still have a
 * heuristic of the checkpoint + kept tail, so this stays true.
 */
export function contextUsageIsKnown(messages: Message[]): boolean {
  return estimateContextTokens({ messages }).known;
}

export function clampMaxOutputTokens(args: {
  contextWindow: number;
  estimatedContextTokens: number;
  requestedMaxTokens?: number;
  modelMaxTokens?: number;
}): number | undefined {
  const { contextWindow, estimatedContextTokens, requestedMaxTokens, modelMaxTokens } = args;
  const requested = requestedMaxTokens ?? modelMaxTokens;
  if (contextWindow <= 0) {
    return requested === undefined ? undefined : Math.max(1, requested);
  }
  const available = contextWindow - estimatedContextTokens - OUTPUT_SAFETY_TOKENS;
  const capped = Math.max(1, available);
  if (requested === undefined) {
    return capped;
  }
  return Math.min(requested, capped);
}

export function resolveReserveTokens(
  reserveTokens: number | undefined,
  threshold: number | undefined,
  contextWindow: number,
): number {
  if (reserveTokens != null && reserveTokens > 0) return reserveTokens;
  if (threshold != null && contextWindow > 0) {
    return Math.max(1, Math.round(contextWindow * (1 - threshold)));
  }
  return DEFAULT_RESERVE_TOKENS;
}
