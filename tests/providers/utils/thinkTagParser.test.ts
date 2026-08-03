import { describe, test, expect } from 'bun:test';
import { createThinkTagParser } from '../../../src/providers/utils/thinkTagParser.ts';

const toArrays = (gen: Generator<{ type: string; content: string }>) => {
  const text: string[] = [];
  const reasoning: string[] = [];
  for (const c of gen) (c.type === 'text' ? text : reasoning).push(c.content);
  return { text: text.join(''), reasoning: reasoning.join('') };
};

describe('thinkTagParser (streaming)', () => {
  test('splits line-anchored think tags into reasoning chunks', () => {
    const p = createThinkTagParser();
    const { text, reasoning } = toArrays(
      p.process('Answer:\n thinkingI decide to say hi.\n responseHello!')
    );
    expect(text).toBe('Answer:Hello!');
    expect(reasoning).toBe('I decide to say hi.');
  });

  test('buffers partial tags across chunks', () => {
    const p = createThinkTagParser();
    // '\n thi' is a partial of the open tag — held back, not emitted.
    const first = toArrays(p.process('pre\n thin'));
    expect(first.text).toBe('pre');

    // Completing the open tag; reasoning ends at the close tag, then text.
    const second = toArrays(p.process('king secret stuff\n responseanext'));
    expect(second.reasoning).toBe(' secret stuff');
    expect(second.text).toBe('anext');
    expect(p.flush()).toBeNull();
  });

  test('no think tags: everything is text', () => {
    const p = createThinkTagParser();
    const { text, reasoning } = toArrays(p.process('just plain text'));
    expect(text).toBe('just plain text');
    expect(reasoning).toBe('');
  });

  test('[REG] ordinary prose with "thinking"/"response" words is never split', () => {
    const p = createThinkTagParser();
    const { text, reasoning } = toArrays(
      p.process('I was thinking about the correct response to give you.')
    );
    expect(text).toBe('I was thinking about the correct response to give you.');
    expect(reasoning).toBe('');
  });
});

describe('thinkTagParser (non-streaming)', () => {
  test('nonStreamingParse keeps reasoning instead of dropping it', () => {
    const p = createThinkTagParser();
    const { content, reasoning } = p.nonStreamingParse(
      'Result:\n thinkingI searched the docs.\n responseFound it.'
    );
    expect(content).toBe('Result:\nFound it.');
    expect(reasoning).toBe('I searched the docs.');
  });

  test('nonStreamingProcess strips tags (backwards compatible)', () => {
    const p = createThinkTagParser();
    expect(p.nonStreamingProcess('a\n thinkingsecret\n responseb')).toBe('a\nb');
  });

  test('nonStreamingParse with no tags returns content unchanged', () => {
    const p = createThinkTagParser();
    const { content, reasoning } = p.nonStreamingParse('plain');
    expect(content).toBe('plain');
    expect(reasoning).toBe('');
  });

  test('[REG] non-streaming prose with "thinking"/"response" words is never split', () => {
    const p = createThinkTagParser();
    const { content, reasoning } = p.nonStreamingParse(
      'I was thinking about the correct response to give you.'
    );
    expect(content).toBe('I was thinking about the correct response to give you.');
    expect(reasoning).toBe('');
  });
});
