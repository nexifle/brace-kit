import { describe, expect, it } from 'bun:test';
import type { Message } from '../../../src/types/index.ts';
import {
  findCutPoint,
  isContextOverflow,
  prepareCompaction,
  serializeConversation,
  computeFileLists,
  extractFileOpsFromMessage,
  createFileOps,
  buildSummarizationApiMessages,
  buildSummarizationUserPrompt,
  combineSplitTurnSummary,
} from '../../../src/hooks/compact/prepareCompaction.ts';
import { SUMMARIZATION_SYSTEM_PROMPT } from '../../../src/hooks/compact/compactPrompts.ts';

function msg(role: Message['role'], content: string, extra?: Partial<Message>): Message {
  return { role, content, ...extra };
}

describe('findCutPoint', () => {
  it('does not cut at a tool result', () => {
    const messages: Message[] = [
      msg('user', 'u1'),
      msg('assistant', 'a1', { toolCalls: [{ id: '1', name: 'read_file', arguments: '{"path":"a.ts"}' }] }),
      msg('tool', 'result-a', { toolCallId: '1', name: 'read_file' }),
      msg('user', 'u2'),
      msg('assistant', 'a2'),
    ];
    const cut = findCutPoint(messages, 5);
    expect(messages[cut.firstKeptIndex].role).not.toBe('tool');
  });

  it('marks split turn when cutting at an assistant inside a turn', () => {
    const long = 'x'.repeat(800);
    const messages: Message[] = [
      msg('user', 'please do the big task ' + long),
      msg('assistant', 'calling tools', { toolCalls: [{ id: '1', name: 'read_file', arguments: '{"path":"a.ts"}' }] }),
      msg('tool', long, { toolCallId: '1', name: 'read_file' }),
      msg('assistant', 'more ' + long),
    ];
    const cut = findCutPoint(messages, 50);
    if (cut.firstKeptIndex > 0 && messages[cut.firstKeptIndex].role === 'assistant') {
      expect(cut.isSplitTurn).toBe(true);
      expect(cut.turnStartIndex).toBe(0);
    }
  });
});

describe('serializeConversation', () => {
  it('labels roles and truncates tool results', () => {
    const text = serializeConversation([
      msg('user', 'Hello'),
      msg('assistant', 'Hi', {
        reasoningContent: 'think',
        toolCalls: [{ id: '1', name: 'read_file', arguments: '{"path":"a.ts"}' }],
      }),
      msg('tool', 'z'.repeat(3000), { name: 'read_file' }),
    ]);
    expect(text).toContain('[User]: Hello');
    expect(text).toContain('[Assistant thinking]: think');
    expect(text).toContain('[Assistant]: Hi');
    expect(text).toContain('[Assistant tool calls]:');
    expect(text).toContain('[Tool result]:');
    expect(text).toContain('more characters truncated');
    expect(text.length).toBeLessThan(3000 + 500);
  });
});

describe('file ops', () => {
  it('merges read vs modified', () => {
    const ops = createFileOps();
    extractFileOpsFromMessage(
      msg('assistant', '', {
        toolCalls: [
          { id: '1', name: 'read_file', arguments: '{"path":"a.ts"}' },
          { id: '2', name: 'write', arguments: '{"path":"b.ts"}' },
          { id: '3', name: 'read_file', arguments: '{"path":"b.ts"}' },
        ],
      }),
      ops,
    );
    const lists = computeFileLists(ops);
    expect(lists.readFiles).toEqual(['a.ts']);
    expect(lists.modifiedFiles).toEqual(['b.ts']);
  });
});

describe('summarization request', () => {
  it('uses the dedicated system prompt and no tools', () => {
    const api = buildSummarizationApiMessages(
      buildSummarizationUserPrompt({ conversationText: '[User]: hi', previousSummary: 'old' }),
    );
    expect(api[0]).toEqual({ role: 'system', content: SUMMARIZATION_SYSTEM_PROMPT });
    expect(api[1].role).toBe('user');
    expect(String(api[1].content)).toContain('<previous-summary>');
    expect(String(api[1].content)).toContain('## Goal');
  });

  it('combines split-turn summaries', () => {
    expect(combineSplitTurnSummary('hist', 'pref')).toContain('Turn Context (split turn)');
  });
});

describe('prepareCompaction', () => {
  it('passes previous checkpoint summary', () => {
    const messages: Message[] = [
      msg('user', 'old', { condenseParent: 'c1' }),
      msg('user', '## Goal\nShip it', { summary: '## Goal\nShip it', condenseId: 'c1' }),
      msg('user', 'more work ' + 'a'.repeat(400)),
      msg('assistant', 'b'.repeat(400)),
      msg('user', 'recent'),
    ];
    const prep = prepareCompaction(messages, 20);
    expect(prep).not.toBeNull();
    expect(prep?.previousSummary).toBe('## Goal\nShip it');
  });
});

describe('isContextOverflow', () => {
  it('detects common provider errors', () => {
    expect(isContextOverflow('This model\'s maximum context length was exceeded')).toBe(true);
    expect(isContextOverflow('prompt is too long')).toBe(true);
    expect(isContextOverflow('rate limited')).toBe(false);
    expect(isContextOverflow('invalid api key')).toBe(false);
    expect(isContextOverflow('network error')).toBe(false);
  });
});
