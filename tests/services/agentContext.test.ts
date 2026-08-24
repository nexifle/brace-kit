import { describe, expect, it } from 'bun:test';
import {
  capToolResult,
  estimateChars,
  shouldCompact,
  buildCompactUserMessage,
  isCompactUserMessage,
  lastRealUserMessage,
  workingFromSummary,
  COMPACT_USER_MARKER,
} from '../../src/services/agentContext.ts';
import type { APIMessage } from '../../src/types/index.ts';

describe('capToolResult', () => {
  it('returns short content unchanged', () => {
    expect(capToolResult('hello', 100)).toBe('hello');
  });

  it('is idempotent under the same limit', () => {
    const big = 'A'.repeat(50_000);
    const once = capToolResult(big, 12_000);
    expect(once.length).toBeLessThan(big.length);
    expect(once).toContain('truncated');
    expect(capToolResult(once, 12_000)).toBe(once);
  });

  it('keeps a head and a tail', () => {
    const big = 'HEAD' + 'x'.repeat(20_000) + 'TAIL';
    const out = capToolResult(big, 4_000);
    expect(out.startsWith('HEAD')).toBe(true);
    expect(out.endsWith('TAIL')).toBe(true);
    expect(out).toContain('call read_file');
  });
});

describe('shouldCompact / estimateChars', () => {
  it('counts string content', () => {
    const msgs: APIMessage[] = [
      { role: 'system', content: 'abc' },
      { role: 'user', content: 'defg' },
    ];
    expect(estimateChars(msgs)).toBe(7);
    expect(shouldCompact(msgs, 7)).toBe(true);
    expect(shouldCompact(msgs, 8)).toBe(false);
  });
});

describe('workingFromSummary', () => {
  it('keeps the leading system message and last real user turn', () => {
    const working: APIMessage[] = [
      { role: 'system', content: 'skill' },
      { role: 'user', content: 'Make a pitch deck' },
      { role: 'assistant', content: 'ok', toolCalls: [{ id: 't1', name: 'read_file', arguments: '{}' }] },
      { role: 'tool', toolCallId: 't1', name: 'read_file', content: 'x'.repeat(100) },
    ];
    const next = workingFromSummary(working, '<summary>Did plan</summary>');
    expect(next[0]).toEqual({ role: 'system', content: 'skill' });
    expect(next.some((m) => m.role === 'user' && String(m.content).includes('Did plan'))).toBe(true);
    expect(next[next.length - 1]).toEqual({ role: 'user', content: 'Make a pitch deck' });
    expect(next.every((m) => m.role !== 'tool')).toBe(true);
  });
});

describe('compact user message', () => {
  it('sits at the tail and is detectable', () => {
    const msg = buildCompactUserMessage();
    expect(isCompactUserMessage(msg)).toBe(true);
    expect(String(msg.content)).toContain(COMPACT_USER_MARKER);
    const last = lastRealUserMessage([
      { role: 'user', content: 'real' },
      msg,
    ]);
    expect(last?.content).toBe('real');
  });
});
