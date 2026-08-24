import { describe, expect, it } from 'bun:test';
import { buildAskAnswer, normalizeAskPayload } from '../../src/utils/slideAsk.ts';

describe('normalizeAskPayload', () => {
  it('normalizes a legacy single-question payload', () => {
    const p = normalizeAskPayload({ question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' });
    expect(p?.questions).toHaveLength(1);
    expect(p?.questions[0]).toEqual({
      id: 'q1',
      text: 'Canvas?',
      options: ['16:9', '4:5'],
      field: 'canvas',
    });
  });

  it('preserves multiple on a legacy single-question payload', () => {
    const p = normalizeAskPayload({ question: 'Pick styles', options: ['minimal', 'vibrant'], multiple: true });
    expect(p?.questions[0].multiple).toBe(true);
  });

  it('preserves freeText on legacy and multi-question payloads', () => {
    const legacy = normalizeAskPayload({ question: 'Pick styles', options: ['minimal'], freeText: true });
    expect(legacy?.questions[0].freeText).toBe(true);
    const multi = normalizeAskPayload({
      questions: [{ question: 'Pick styles', options: ['minimal'], freeText: true }],
    });
    expect(multi?.questions[0].freeText).toBe(true);
  });

  it('passes through a multi-question payload and assigns missing ids', () => {
    const p = normalizeAskPayload({
      questions: [
        { id: 'a', question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' },
        { question: 'Pick styles', options: ['minimal', 'vibrant'], multiple: true },
      ],
    });
    expect(p?.questions).toHaveLength(2);
    expect(p?.questions[0].id).toBe('a');
    expect(p?.questions[1].id).toBe('q2');
    expect(p?.questions[1].multiple).toBe(true);
  });

  it('returns null for missing or invalid payloads', () => {
    expect(normalizeAskPayload(null)).toBeNull();
    expect(normalizeAskPayload(undefined)).toBeNull();
    expect(normalizeAskPayload('nope')).toBeNull();
    expect(normalizeAskPayload({})).toBeNull();
    expect(normalizeAskPayload({ questions: [] })).toBeNull();
    expect(normalizeAskPayload({ questions: [{}] })).toBeNull();
  });

  it('filters non-string options', () => {
    const p = normalizeAskPayload({ questions: [{ question: 'Q', options: ['a', 42, 'b'] }] });
    expect(p?.questions[0].options).toEqual(['a', 'b']);
  });
});

describe('buildAskAnswer', () => {
  const q = (id: string, multiple?: boolean) => ({ id, text: id, ...(multiple ? { multiple } : {}) });

  it('returns the bare value for a single question', () => {
    expect(buildAskAnswer([q('q1')], { q1: '16:9' })).toBe('16:9');
  });

  it('joins a single multi-select answer with a comma', () => {
    expect(buildAskAnswer([q('q1', true)], { q1: ['minimal', 'vibrant'] })).toBe(
      'minimal, vibrant',
    );
  });

  it('appends free text to a multi-select answer', () => {
    expect(
      buildAskAnswer([q('q1', true)], { q1: ['minimal'] }, { q1: 'neon' }),
    ).toBe('minimal, neon');
  });

  it('lets free text override a single-select chip', () => {
    expect(buildAskAnswer([q('q1')], { q1: 'minimal' }, { q1: 'neon' })).toBe('neon');
  });

  it('keeps the chip answer when free text is blank', () => {
    expect(buildAskAnswer([q('q1')], { q1: 'minimal' }, { q1: '   ' })).toBe('minimal');
  });

  it('returns a JSON object for multiple questions', () => {
    expect(buildAskAnswer([q('q1'), q('q2', true)], { q1: '16:9', q2: ['a', 'b'] })).toBe(
      JSON.stringify({ q1: '16:9', q2: ['a', 'b'] }),
    );
  });
});