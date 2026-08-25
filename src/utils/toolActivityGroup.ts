import type { Message } from '../types/index.ts';
import type { ToolMessageData } from '../components/ToolMessage.tsx';
import { truncateActivity } from './toolActivityLabel.ts';

export function isEmptyAssistant(msg: Message): boolean {
  if (msg.role !== 'assistant') return false;
  const hasContent = msg.content || msg.displayContent || msg.reasoningContent;
  const hasAssets =
    msg.generatedImages?.length || msg.attachments?.length || msg.summary || msg.groundingMetadata;
  return !hasContent && !hasAssets;
}

export function toToolData(msg: Message): ToolMessageData {
  return {
    name: msg.name || 'unknown',
    content: msg.content,
    toolCallId: msg.toolCallId,
    toolArguments: msg.toolArguments,
    isCachedResult: msg.isCachedResult,
  };
}

export type TimelineEntry =
  | { kind: 'tool'; toolIndex: number }
  | {
      kind: 'thinking';
      title: string;
      detail?: string;
      body?: string;
      reasoning?: string;
    };

export type ProcessedChatItem =
  | { type: 'message'; message: Message; index: number }
  | {
      type: 'tool-group';
      tools: ToolMessageData[];
      entries: TimelineEntry[];
      firstToolIndex: number;
      startedAt?: number;
      endedAt?: number;
    };

function hasVisibleAssistantBody(msg: Message): boolean {
  if (msg.role !== 'assistant') return false;
  const text = (msg.displayContent || msg.content || '').trim();
  const hasAssets =
    Boolean(msg.generatedImages?.length) ||
    Boolean(msg.attachments?.length) ||
    Boolean(msg.summary) ||
    Boolean(msg.groundingMetadata);
  return Boolean(text) || hasAssets;
}

function toolsFollowBeforeTurnEnd(messages: Message[], from: number): boolean {
  for (let k = from; k < messages.length; k++) {
    const role = messages[k].role;
    if (role === 'user' || role === 'error') return false;
    if (role === 'tool') return true;
  }
  return false;
}

/** Assistant that belongs inside the tool timeline, not as its own bubble. */
export function isInterstitialAssistant(messages: Message[], index: number): boolean {
  const msg = messages[index];
  if (msg.role !== 'assistant') return false;
  if (!hasVisibleAssistantBody(msg)) return true;
  return toolsFollowBeforeTurnEnd(messages, index + 1);
}

function thinkingEntry(msg: Message): Extract<TimelineEntry, { kind: 'thinking' }> | null {
  const visible = (msg.displayContent || msg.content || '').trim();
  const reasoning = msg.reasoningContent?.trim();
  if (!visible && !reasoning) return null;
  return {
    kind: 'thinking',
    title: 'Thinking',
    detail: visible ? truncateActivity(visible) : undefined,
    body: visible || undefined,
    reasoning: reasoning || undefined,
  };
}

function groupTimeline(messages: Message[]): ProcessedChatItem[] {
  const result: ProcessedChatItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    const startGroup =
      msg.role === 'tool' ||
      (isInterstitialAssistant(messages, i) && toolsFollowBeforeTurnEnd(messages, i + 1));

    if (!startGroup) {
      if (isEmptyAssistant(msg)) {
        i++;
        continue;
      }
      result.push({ type: 'message', message: msg, index: i });
      i++;
      continue;
    }

    const tools: ToolMessageData[] = [];
    const entries: TimelineEntry[] = [];
    let firstToolIndex = i;
    let startedAt: number | undefined;
    let j = i;

    while (j < messages.length) {
      const cur = messages[j];
      if (cur.role === 'tool') {
        if (tools.length === 0) firstToolIndex = j;
        if (cur.createdAt != null) {
          startedAt = startedAt == null ? cur.createdAt : Math.min(startedAt, cur.createdAt);
        }
        entries.push({ kind: 'tool', toolIndex: tools.length });
        tools.push(toToolData(cur));
        j++;
        continue;
      }
      if (isInterstitialAssistant(messages, j)) {
        const think = thinkingEntry(cur);
        const last = entries[entries.length - 1];
        if (think && last?.kind !== 'thinking') {
          entries.push(think);
        }
        j++;
        continue;
      }
      break;
    }

    let endedAt: number | undefined;
    const following = messages[j];
    if (following && following.createdAt != null && !isInterstitialAssistant(messages, j)) {
      endedAt = following.createdAt;
    }

    if (tools.length > 0) {
      result.push({ type: 'tool-group', tools, entries, firstToolIndex, startedAt, endedAt });
    }
    i = j;
  }
  return result;
}

function groupDetailed(messages: Message[]): ProcessedChatItem[] {
  const result: ProcessedChatItem[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (isEmptyAssistant(messages[i])) continue;
    result.push({ type: 'message', message: messages[i], index: i });
  }
  return result;
}

export function groupMessagesForDisplay(messages: Message[], timeline: boolean): ProcessedChatItem[] {
  return timeline ? groupTimeline(messages) : groupDetailed(messages);
}
