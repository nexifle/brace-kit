import { describe, expect, it } from 'bun:test';
import { eligibleChatTools, estimateRequestContextTokens } from '../../src/utils/requestContext.ts';
import { estimateToolsTokens } from '../../src/utils/estimateTokens.ts';
import { shouldCompact } from '../../src/hooks/compact/compactUtils.ts';
import type { Message } from '../../src/types/index.ts';

const emptyState = {
  messages: [] as Message[],
  providerConfig: { systemPrompt: '' },
  conversations: [],
  activeConversationId: null as string | null,
  memoryEnabled: false,
  memories: [],
};

describe('eligibleChatTools', () => {
  const tools = [{ name: 'ask' }];

  it('drops tools when the model cannot call functions', () => {
    expect(eligibleChatTools({ tools, supportsFunctionCalling: false })).toEqual([]);
  });

  it('drops tools for xAI image models without an aspect ratio', () => {
    expect(
      eligibleChatTools({
        tools,
        supportsFunctionCalling: true,
        isXAIImageModel: true,
      }),
    ).toEqual([]);
    expect(
      eligibleChatTools({
        tools,
        supportsFunctionCalling: true,
        isXAIImageModel: true,
        aspectRatio: '1:1',
      }),
    ).toEqual(tools);
  });
});

describe('estimateRequestContextTokens', () => {
  it('includes tools in the same estimate used for compact vs clamp', () => {
    const messages: Message[] = [{ role: 'user', content: 'hello' }];
    const tools = [{ name: 'web_fetch', description: 'x'.repeat(20000) }];
    const state = { ...emptyState, messages };
    const withTools = estimateRequestContextTokens(state, tools).tokens;
    const withoutTools = estimateRequestContextTokens(state, []).tokens;

    expect(withTools - withoutTools).toBe(estimateToolsTokens(tools));

    const contextWindow = 20000;
    const reserve = 16384;
    expect(shouldCompact(withoutTools, contextWindow, reserve)).toBe(false);
    expect(shouldCompact(withTools, contextWindow, reserve)).toBe(true);
  });
});
