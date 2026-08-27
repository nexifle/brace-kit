import { describe, expect, it } from 'bun:test';
import type { Message } from '../../src/types/index.ts';
import {
  calculateContextTokens,
  clampMaxOutputTokens,
  contextUsageIsKnown,
  estimateContextTokens,
  estimateMessageTokens,
  estimateTextTokens,
  estimateToolsTokens,
  estimateMessageTokens,
  IMAGE_CHARS,
  resolveReserveTokens,
} from '../../src/utils/estimateTokens.ts';

describe('estimateTextTokens', () => {
  it('uses ceil(chars / 4)', () => {
    expect(estimateTextTokens('Hello')).toBe(2);
    expect(estimateTextTokens('abcd')).toBe(1);
    expect(estimateTextTokens('')).toBe(0);
  });
});

describe('estimateMessageTokens', () => {
  it('counts thinking and tool calls', () => {
    const msg: Message = {
      role: 'assistant',
      content: 'abcd',
      reasoningContent: 'efgh',
      toolCalls: [{ id: '1', name: 'search', arguments: '{"q":"x"}' }],
    };
    const chars = 4 + 4 + 'search'.length + '{"q":"x"}'.length;
    expect(estimateMessageTokens(msg)).toBe(Math.ceil(chars / 4));
  });

  it('counts images as 4800 chars each, not base64 length', () => {
    const msg: Message = {
      role: 'user',
      content: '',
      attachments: [{ type: 'image', name: 'a.png', data: 'x'.repeat(50000) }],
    };
    expect(estimateMessageTokens(msg)).toBe(Math.ceil((5 + IMAGE_CHARS) / 4));
  });
});

describe('estimateToolsTokens', () => {
  it('serializes tool definitions', () => {
    const tools = [{ name: 'foo', description: 'bar', inputSchema: { type: 'object' } }];
    expect(estimateToolsTokens(tools)).toBe(Math.ceil(JSON.stringify(tools).length / 4));
    expect(estimateToolsTokens([])).toBe(0);
  });
});

describe('calculateContextTokens', () => {
  it('prefers totalTokenCount', () => {
    expect(
      calculateContextTokens({
        promptTokenCount: 1,
        candidatesTokenCount: 2,
        totalTokenCount: 99,
      }),
    ).toBe(99);
  });

  it('sums parts when total is 0', () => {
    expect(
      calculateContextTokens({
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 0,
        cachedContentTokenCount: 3,
        thoughtsTokenCount: 2,
      }),
    ).toBe(20);
  });
});

describe('estimateContextTokens', () => {
  it('uses usage plus later messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'ignored because usage exists' },
      {
        role: 'assistant',
        content: 'done',
        usage: { promptTokenCount: 50, candidatesTokenCount: 10, totalTokenCount: 100 },
      },
      { role: 'user', content: 'abcd' },
    ];
    expect(estimateContextTokens({ messages }).tokens).toBe(100 + 1);
    expect(estimateContextTokens({ messages }).known).toBe(true);
  });

  it('counts system prompt and tools only when there is no usage', () => {
    const messages: Message[] = [{ role: 'user', content: 'abcd' }];
    const tools = [{ name: 'foo', description: 'd' }];
    const without = estimateContextTokens({ messages }).tokens;
    const withPrefix = estimateContextTokens({
      messages,
      systemPrompt: 'sys!',
      tools,
    }).tokens;
    expect(withPrefix).toBeGreaterThan(without);
    const withUsage = estimateContextTokens({
      messages: [
        {
          role: 'assistant',
          content: 'x',
          usage: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 40 },
          toolNames: ['foo'],
        },
      ],
      systemPrompt: 'sys!',
      tools,
    }).tokens;
    expect(withUsage).toBe(40);
  });

  it('applies a net tool-definition delta against the stored snapshot', () => {
    const small = [{ name: 'foo', description: 'a' }];
    const large = [{ name: 'bar', description: 'bbbbbbbbbbbb' }];
    const both = [...small, ...large];
    const prev = estimateToolsTokens(small);
    const messages: Message[] = [
      {
        role: 'assistant',
        content: 'x',
        usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 100 },
        toolsTokens: prev,
        toolNames: ['foo'],
      },
    ];

    expect(estimateContextTokens({ messages, tools: small }).tokens).toBe(100);
    expect(estimateContextTokens({ messages, tools: both }).tokens).toBe(
      100 + (estimateToolsTokens(both) - prev),
    );
    expect(estimateContextTokens({ messages, tools: large }).tokens).toBe(
      100 + (estimateToolsTokens(large) - prev),
    );
    expect(estimateContextTokens({ messages, tools: [] }).tokens).toBe(100 - prev);
  });

  it('does not add tool definitions on top of usage when no snapshot exists', () => {
    const tools = [{ name: 'foo', description: 'included-in-prompt-or-not' }];
    const messages: Message[] = [
      {
        role: 'assistant',
        content: 'x',
        usage: { promptTokenCount: 70, candidatesTokenCount: 0, totalTokenCount: 70 },
      },
    ];
    expect(estimateContextTokens({ messages, tools }).tokens).toBe(70);
  });

  it('skips truncated assistant usage', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: 'partial',
        truncated: true,
        usage: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 999 },
      },
      { role: 'user', content: 'abcd' },
    ];
    expect(estimateContextTokens({ messages }).tokens).toBe(
      estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1]),
    );
  });

  it('reports unknown after compact until the next usage', () => {
    const messages: Message[] = [
      { role: 'user', content: 'old', condenseParent: 'c1' },
      { role: 'user', content: '[CONVERSATION SUMMARY]\nsum', summary: 'sum', condenseId: 'c1' },
      { role: 'user', content: 'new' },
    ];
    const est = estimateContextTokens({ messages });
    expect(est.known).toBe(false);
    expect(est.tokens).toBeGreaterThan(0);
    expect(contextUsageIsKnown(messages)).toBe(false);
  });
});

describe('clampMaxOutputTokens', () => {
  it('clamps to remaining window minus safety', () => {
    expect(
      clampMaxOutputTokens({
        contextWindow: 128000,
        estimatedContextTokens: 120000,
        requestedMaxTokens: 8192,
      }),
    ).toBe(3904);
  });

  it('floors at 1', () => {
    expect(
      clampMaxOutputTokens({
        contextWindow: 100,
        estimatedContextTokens: 200,
        requestedMaxTokens: 8192,
      }),
    ).toBe(1);
  });

  it('skips clamp when context window is non-positive but still floors requested at 1', () => {
    expect(
      clampMaxOutputTokens({
        contextWindow: 0,
        estimatedContextTokens: 10,
        requestedMaxTokens: 50,
      }),
    ).toBe(50);
    expect(
      clampMaxOutputTokens({
        contextWindow: 0,
        estimatedContextTokens: 10,
        requestedMaxTokens: 0,
      }),
    ).toBe(1);
  });
});

describe('resolveReserveTokens', () => {
  it('defaults to 16384', () => {
    expect(resolveReserveTokens(undefined, undefined, 128000)).toBe(16384);
  });

  it('derives from legacy percent threshold', () => {
    expect(resolveReserveTokens(undefined, 0.9, 128000)).toBe(12800);
  });
});
