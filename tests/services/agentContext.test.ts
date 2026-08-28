import { describe, expect, it } from 'bun:test';
import {
  capToolResult,
  estimateChars,
  shouldCompact,
  buildCompactUserMessage,
  buildAgentSummarizationPlan,
  combineAgentCompactSummary,
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
  it('keeps the leading system message and a checkpoint plus recent tail', () => {
    const working: APIMessage[] = [
      { role: 'system', content: 'skill' },
      { role: 'user', content: 'Make a pitch deck' },
      { role: 'assistant', content: 'ok', toolCalls: [{ id: 't1', name: 'read_file', arguments: '{}' }] },
      { role: 'tool', toolCallId: 't1', name: 'read_file', content: 'x'.repeat(100) },
      { role: 'user', content: 'continue' },
    ];
    const next = workingFromSummary(working, '## Goal\nDid plan');
    expect(next[0]).toEqual({ role: 'system', content: 'skill' });
    expect(next.some((m) => m.role === 'user' && String(m.content).includes('Did plan'))).toBe(true);
    expect(next.some((m) => m.role === 'user' && String(m.content).includes('continue'))).toBe(true);
  });
});

describe('buildAgentSummarizationPlan', () => {
  it('includes a turn-prefix request when the cut splits a turn', () => {
    const working: APIMessage[] = [
      { role: 'system', content: 'skill' },
      { role: 'user', content: 'do the big job ' + 'x'.repeat(400) },
      { role: 'assistant', content: 'calling', toolCalls: [{ id: 't1', name: 'read_file', arguments: '{"path":"a.ts"}' }] },
      { role: 'tool', toolCallId: 't1', name: 'read_file', content: 'y'.repeat(800) },
      { role: 'assistant', content: 'later ' + 'z'.repeat(40) },
    ];
    const plan = buildAgentSummarizationPlan(working, 30);
    expect(plan).not.toBeNull();
    expect(plan?.prefix).toBeDefined();
    expect(String(plan!.prefix![1].content)).toContain('PREFIX of a turn');
    expect(String(plan!.history[1].content)).toContain('## Goal');
    const withExtra = buildAgentSummarizationPlan(working, 30, 'keep file ops');
    expect(String(withExtra!.history[1].content)).toContain('keep file ops');
    expect(combineAgentCompactSummary('hist', 'pref')).toContain('Turn Context (split turn)');
  });
});

describe('compact user message', () => {
  it('is a summarizer user prompt, not the agent system prompt', () => {
    const msg = buildCompactUserMessage();
    expect(String(msg.content)).toContain('<conversation>');
    expect(String(msg.content)).toContain('## Goal');
    const checkpoint = { role: 'user' as const, content: `${COMPACT_USER_MARKER}\n## Goal` };
    expect(isCompactUserMessage(checkpoint)).toBe(true);
    const last = lastRealUserMessage([
      { role: 'user', content: 'real' },
      checkpoint,
    ]);
    expect(last?.content).toBe('real');
  });
});
