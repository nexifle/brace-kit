import { describe, expect, it } from 'bun:test';
import { isStreamingAgentActive } from '../../src/utils/slideStreaming.ts';
import type { SlideActivityEvent } from '../../src/types/slides.ts';

function row(type: SlideActivityEvent['type'], status: SlideActivityEvent['status'], partial: Partial<SlideActivityEvent> = {}): SlideActivityEvent {
  return {
    id: `${type}_${Math.random().toString(36).slice(2)}`,
    type,
    status,
    ts: Date.now(),
    phase: 'plan',
    label: type,
    ...partial,
  };
}

describe('isStreamingAgentActive (US-039, Amendment A.8)', () => {
  it('shows when a model round is in progress with no tools yet', () => {
    expect(
      isStreamingAgentActive('running', [row('model_round_started', 'running')]),
    ).toBe(true);
  });

  it('stays visible when later rows in the same round are also open model rounds', () => {
    expect(
      isStreamingAgentActive('running', [
        row('phase_started', 'completed'),
        row('model_round_started', 'running'),
      ]),
    ).toBe(true);
  });

  it('hides once a tool row commits the round (no tools yet → tool_started)', () => {
    expect(
      isStreamingAgentActive('running', [
        row('model_round_started', 'running'),
        row('tool_started', 'running', { toolName: 'apply_patch' }),
      ]),
    ).toBe(false);
  });

  it('hides once the round completes on a clean turn (commit)', () => {
    expect(
      isStreamingAgentActive('running', [
        row('model_round_started', 'running'),
        row('model_round_completed', 'completed'),
      ]),
    ).toBe(false);
  });

  it('hides when the phase is no longer running (idle/done/waiting_user)', () => {
    const activity = [row('model_round_started', 'running')];
    expect(isStreamingAgentActive('idle', activity)).toBe(false);
    expect(isStreamingAgentActive('done', activity)).toBe(false);
    expect(isStreamingAgentActive('waiting_user', activity)).toBe(false);
    expect(isStreamingAgentActive('stopped', activity)).toBe(false);
  });

  it('hides when there is no activity yet', () => {
    expect(isStreamingAgentActive('running', [])).toBe(false);
  });

  it('hides when the last row is an open connecting row (round not started)', () => {
    expect(
      isStreamingAgentActive('running', [row('connecting', 'running')]),
    ).toBe(false);
  });

  it('hides when the model round row was closed out-of-order (failed patch row last)', () => {
    expect(
      isStreamingAgentActive('running', [
        row('model_round_started', 'running'),
        row('tool_finished', 'failed', { toolName: 'apply_patch' }),
      ]),
    ).toBe(false);
  });
});
