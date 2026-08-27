import type { MCPTool, Message } from '../types/index.ts';
import { buildConversationSystemPrompt } from './systemPrompt.ts';
import { estimateContextTokens, type ContextTokenEstimate } from './estimateTokens.ts';

/** Same eligibility used by send, stream follow-ups, clamp, and auto-compact. */
export function eligibleChatTools(args: {
  tools: MCPTool[];
  supportsFunctionCalling: boolean;
  isXAIImageModel?: boolean;
  aspectRatio?: string;
}): MCPTool[] {
  if (!args.supportsFunctionCalling) return [];
  if (args.isXAIImageModel && !args.aspectRatio) return [];
  return args.tools;
}

export interface AppStateForContextEstimate {
  messages: Message[];
  providerConfig: { systemPrompt?: string };
  conversations: Parameters<typeof buildConversationSystemPrompt>[0]['conversations'];
  activeConversationId: string | null;
  memoryEnabled: boolean;
  memories: Parameters<typeof buildConversationSystemPrompt>[0]['memories'];
}

/**
 * Canonical context estimate for a request: effective messages + system prompt + tools.
 * Clamp, auto-compact, and the usage footer should all call this with the same tool list.
 */
export function estimateRequestContextTokens(
  state: AppStateForContextEstimate,
  tools?: MCPTool[] | null,
): ContextTokenEstimate {
  return estimateContextTokens({
    messages: state.messages,
    tools,
    systemPrompt: buildConversationSystemPrompt(state),
  });
}
