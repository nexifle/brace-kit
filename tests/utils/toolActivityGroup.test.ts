import { describe, expect, it } from 'bun:test';
import type { Message } from '../../src/types/index.ts';
import { groupMessagesForDisplay } from '../../src/utils/toolActivityGroup';

function msg(partial: Partial<Message> & { role: Message['role'] }): Message {
  return { content: '', ...partial };
}

describe('groupMessagesForDisplay', () => {
  it('groups consecutive tools including Calling... in timeline mode', () => {
    const messages: Message[] = [
      msg({ role: 'user', content: 'hi' }),
      msg({ role: 'tool', name: 'web_search', content: '⏳ Calling...', toolCallId: 'a', createdAt: 1 }),
      msg({ role: 'tool', name: 'web_search', content: 'hits', toolCallId: 'b', createdAt: 2 }),
      msg({ role: 'assistant', content: 'done' }),
    ];
    const items = groupMessagesForDisplay(messages, true);
    expect(items.map((i) => i.type)).toEqual(['message', 'tool-group', 'message']);
    expect(items[1].tools).toHaveLength(2);
    expect(items[1].startedAt).toBe(1);
  });

  it('joins tools split by empty assistant messages', () => {
    const messages: Message[] = [
      msg({ role: 'tool', name: 'web_search', content: 'a', toolCallId: '1', createdAt: 10 }),
      msg({ role: 'assistant', content: '', toolCalls: [] }),
      msg({ role: 'tool', name: 'open_page', content: 'b', toolCallId: '2', createdAt: 20 }),
    ];
    const items = groupMessagesForDisplay(messages, true);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('tool-group');
    expect(items[0].tools).toHaveLength(2);
    expect(items[0].durationMs).toBe(10);
  });

  it('does not group in detailed mode', () => {
    const messages: Message[] = [
      msg({ role: 'tool', name: 'web_search', content: 'a', toolCallId: '1' }),
      msg({ role: 'tool', name: 'open_page', content: 'b', toolCallId: '2' }),
    ];
    const items = groupMessagesForDisplay(messages, false);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.type === 'message')).toBe(true);
  });

  it('uses stored duration on first tool', () => {
    const messages: Message[] = [
      msg({
        role: 'tool',
        name: 'web_search',
        content: 'a',
        createdAt: 1,
        toolActivityDurationMs: 17000,
      }),
    ];
    const items = groupMessagesForDisplay(messages, true);
    expect(items[0].durationMs).toBe(17000);
  });
});
