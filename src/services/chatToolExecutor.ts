import { useStore } from '../store/index.ts';
import type { ToolCall } from '../types/index.ts';
import { MCP_DISCONNECT_PREFIX } from '../types/index.ts';

export type ChatToolExecutionResult = 'completed' | 'suspended' | 'disconnected';

/** End the in-flight chat request after an ask suspends the conversation. */
export function finishRequestAsSuspended(): void {
  const state = useStore.getState();
  const activeConvId = state.activeConversationId;
  if (activeConvId) state.setConversationStreaming(activeConvId, null);
  state.setIsStreaming(false);
  state.setCurrentRequestId(null);
  state.setStreamingContent('');
  state.setStreamingReasoningContent('');
}

/** Execute a chat tool through the correct client, local, or background path. */
export async function executeChatToolCall(
  toolCall: ToolCall,
  onDisconnect?: (toolCallId: string, serverName: string) => void,
): Promise<ChatToolExecutionResult> {
  if (!toolCall.name) return 'completed';

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(toolCall.arguments || '{}') as Record<string, unknown>;
  } catch {
    args = {};
  }

  const store = useStore.getState();
  store.addMessage({
    role: 'tool',
    toolCallId: toolCall.id,
    name: toolCall.name,
    content: '⏳ Calling...',
    toolArguments: args,
  });

  try {
    if (toolCall.name === 'ask') {
      const suspended = await useStore.getState().suspendAskToolCall(toolCall.id, toolCall.arguments || '{}');
      if (suspended) return 'suspended';
      updateToolMessage(toolCall.id, 'Error: Invalid ask payload.');
      return 'completed';
    }

    let resultText: string;
    if (toolCall.name === 'continue_message') {
      resultText = 'Chain message initiated. You may continue your response now.';
    } else {
      const result = await chrome.runtime.sendMessage({
        type: 'MCP_CALL_TOOL',
        name: toolCall.name,
        arguments: args,
      });

      if (typeof result?.error === 'string' && result.error.startsWith(MCP_DISCONNECT_PREFIX)) {
        const serverName = result.error.slice(MCP_DISCONNECT_PREFIX.length);
        onDisconnect?.(toolCall.id, serverName);
        return 'disconnected';
      }

      resultText =
        result?.content?.map((c: { text?: string }) => c.text || JSON.stringify(c)).join('\n') ||
        JSON.stringify(result);
    }

    updateToolMessage(toolCall.id, resultText);
    return 'completed';
  } catch (error) {
    updateToolMessage(toolCall.id, `Error: ${(error as Error).message}`);
    return 'completed';
  }
}

export function updateToolMessage(
  toolCallId: string,
  content: string,
  attachments?: Array<{ type: 'image' | 'text' | 'pdf'; name: string; data: string }>,
): void {
  const store = useStore.getState();
  const messageIndex = [...store.messages].reverse().findIndex(
    (message) =>
      message.role === 'tool' &&
      String(message.toolCallId) === String(toolCallId) &&
      (String(message.content).includes('Calling...') || String(message.content) === 'Waiting for your answer…'),
  );

  if (messageIndex === -1) return;
  const actualIndex = store.messages.length - 1 - messageIndex;
  const messages = [...store.messages];
  messages[actualIndex] = {
    ...messages[actualIndex],
    content,
    ...(attachments && attachments.length > 0 ? { attachments } : {}),
  };
  store.setMessages(messages);
}
