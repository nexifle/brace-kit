import type { Message } from '../types/index.ts';
import type { ToolMessageData } from '../components/ToolMessage.tsx';

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

export type ProcessedChatItem =
  | { type: 'message'; message: Message; index: number }
  | {
      type: 'tool-group';
      tools: ToolMessageData[];
      firstToolIndex: number;
      startedAt?: number;
      endedAt?: number;
    };

function groupTimeline(messages: Message[]): ProcessedChatItem[] {
  const result: ProcessedChatItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];

    if (isEmptyAssistant(msg)) {
      i++;
      continue;
    }

    if (msg.role !== 'tool') {
      result.push({ type: 'message', message: msg, index: i });
      i++;
      continue;
    }

    const tools: ToolMessageData[] = [];
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
        tools.push(toToolData(cur));
        j++;
        continue;
      }
      if (isEmptyAssistant(cur)) {
        j++;
        continue;
      }
      break;
    }

    let endedAt: number | undefined;
    const following = messages[j];
    if (following && !isEmptyAssistant(following) && following.createdAt != null) {
      endedAt = following.createdAt;
    }

    if (tools.length > 0) {
      result.push({ type: 'tool-group', tools, firstToolIndex, startedAt, endedAt });
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
