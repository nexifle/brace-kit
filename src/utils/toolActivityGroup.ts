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

export type ProcessedChatItem = {
  type: 'message' | 'tool-group';
  message?: Message;
  index?: number;
  tools?: ToolMessageData[];
  firstToolIndex?: number;
  startedAt?: number;
  durationMs?: number;
};

export function groupMessagesForDisplay(
  messages: Message[],
  timeline: boolean,
): ProcessedChatItem[] {
  const result: ProcessedChatItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    const canStartGroup =
      msg.role === 'tool' ||
      (timeline && isEmptyAssistant(msg) && messages[i + 1]?.role === 'tool');

    if (canStartGroup) {
      const toolGroup: ToolMessageData[] = [];
      let firstToolIndex: number | undefined;
      let startedAt: number | undefined;
      let durationMs: number | undefined;
      let j = i;

      while (j < messages.length) {
        const cur = messages[j];
        if (cur.role === 'tool') {
          if (firstToolIndex === undefined) firstToolIndex = j;
          if (cur.createdAt != null) {
            startedAt = startedAt == null ? cur.createdAt : Math.min(startedAt, cur.createdAt);
          }
          if (cur.toolActivityDurationMs != null && durationMs == null) {
            durationMs = cur.toolActivityDurationMs;
          }
          toolGroup.push(toToolData(cur));
          j++;
          continue;
        }
        if (timeline && isEmptyAssistant(cur)) {
          j++;
          continue;
        }
        break;
      }

      if (timeline) {
        if (toolGroup.length > 0) {
          if (durationMs == null && startedAt != null) {
            const lastTool = [...messages.slice(i, j)].reverse().find((m) => m.role === 'tool');
            if (lastTool?.createdAt != null && lastTool.createdAt > startedAt) {
              durationMs = lastTool.createdAt - startedAt;
            }
          }
          result.push({
            type: 'tool-group',
            tools: toolGroup,
            firstToolIndex,
            startedAt,
            durationMs,
          });
        }
        i = j;
      } else {
        result.push({ type: 'message', message: msg, index: i });
        i++;
      }
    } else {
      result.push({ type: 'message', message: msg, index: i });
      i++;
    }
  }
  return result;
}
