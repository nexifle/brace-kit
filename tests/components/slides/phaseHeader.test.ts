import { describe, expect, it } from 'bun:test';
import { lastToolActivityLabel } from '../../../src/components/slides/PhaseHeader.tsx';
import type { SlideActivityEvent } from '../../../src/types/slides.ts';

function event(partial: Partial<SlideActivityEvent>): SlideActivityEvent {
  return {
    id: 'e',
    type: 'info',
    status: 'running',
    ts: Date.now(),
    phase: 'plan',
    label: 'x',
    ...partial,
  };
}

describe('PhaseHeader helpers', () => {
  it('returns null for no tool-like activity', () => {
    expect(lastToolActivityLabel([])).toBeNull();
    expect(
      lastToolActivityLabel([
        event({ type: 'connecting', label: 'Connecting to model…' }),
        event({ type: 'model_round_started', label: 'Round 1', round: 1 }),
      ]),
    ).toBeNull();
  });

  it('returns the label of the latest tool-like row', () => {
    expect(
      lastToolActivityLabel([
        event({ type: 'file_written', label: 'Creating /brief.md' }),
        event({ type: 'file_written', label: 'Updating /slides/01.html' }),
      ]),
    ).toBe('Updating /slides/01.html');
  });

  it('skips non-tool rows after a tool row (takes the last tool one)', () => {
    expect(
      lastToolActivityLabel([
        event({ type: 'tool_started', label: 'Asking you a question' }),
        event({ type: 'model_round_completed', label: 'Round 2', round: 2 }),
        event({ type: 'ask_answered', label: 'Answer received' }),
      ]),
    ).toBe('Answer received');
  });

  it('surfaces ask and file_op rows as "last tool"', () => {
    expect(lastToolActivityLabel([event({ type: 'ask_started', label: 'Asking you a question' })])).toBe(
      'Asking you a question',
    );
    expect(
      lastToolActivityLabel([event({ type: 'file_written', label: 'Updating /deck.json' })]),
    ).toBe('Updating /deck.json');
  });
});
