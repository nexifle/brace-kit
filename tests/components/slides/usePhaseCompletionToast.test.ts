import { describe, expect, it } from 'bun:test';
import {
  completionToastFor,
  EDIT_COMPLETED_COPY,
  toastDedupKey,
} from '../../../src/components/slides/usePhaseCompletionToast.ts';
import type { PhaseCompletedToastEvent } from '../../../src/components/slides/usePhaseCompletionToast.ts';

function ev(partial: Partial<PhaseCompletedToastEvent>): PhaseCompletedToastEvent {
  return {
    type: 'phase_completed',
    phase: 'build',
    label: 'Deck ready — 4 slides',
    ...partial,
  };
}

describe('completionToastFor (US-046 / A.12)', () => {
  it('emits the exact A.12 build copy incl. slide count', () => {
    expect(completionToastFor(ev({ phase: 'build', label: 'Deck ready — 3 slides' }))).toBe(
      'Deck ready — 3 slides',
    );
  });

  it('emits "Edits applied" for edit (A.12 copy, not the A.5 row label)', () => {
    expect(completionToastFor(ev({ phase: 'edit', label: 'Updates applied' }))).toBe(
      EDIT_COMPLETED_COPY,
    );
    expect(EDIT_COMPLETED_COPY).toBe('Edits applied');
  });

  it('returns null for plan completion (surfaces via PlanReview, not a toast)', () => {
    expect(completionToastFor(ev({ phase: 'plan', label: 'Plan ready — review brief & design' }))).toBeNull();
  });

  it('returns null for non-phase_completed rows', () => {
    expect(completionToastFor(ev({ type: 'phase_failed', phase: 'build' }))).toBeNull();
    expect(completionToastFor(ev({ type: 'tool_started', phase: 'edit' }))).toBeNull();
  });
});

describe('toastDedupKey (US-046 / repeat-run id collision)', () => {
  it('distinguishes two completions that share an emitter id across repeated runs', () => {
    // The phase emitter resets its per-run seq, so a second build run with the
    // same tool-row count reuses the SAME id (`build_phase_completed_2`) — ts
    // (epoch ms) is the disambiguator that keeps the repeat toast firing.
    expect(toastDedupKey({ id: 'build_phase_completed_2', ts: 1700000000000 })).not.toBe(
      toastDedupKey({ id: 'build_phase_completed_2', ts: 1700000005000 }),
    );
  });

  it('is stable for the same event', () => {
    expect(toastDedupKey({ id: 'edit_phase_completed_1', ts: 1700000000000 })).toBe(
      'edit_phase_completed_1:1700000000000',
    );
  });
});
