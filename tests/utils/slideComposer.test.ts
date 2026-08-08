import { describe, expect, it } from 'bun:test';
import type { SlideProject } from '../../src/types/slides.ts';
import {
  slideComposerCanSend,
  slideComposerPlaceholder,
} from '../../src/utils/slideComposer.ts';

function project(phase: SlideProject['phase'] = 'idle'): SlideProject {
  return {
    id: 'p1',
    title: 'Test deck',
    createdAt: 0,
    updatedAt: 0,
    phase,
    mode: 'plan',
    canvas: '16:9',
    messages: [],
    files: [],
    pendingAsk: null,
  };
}

describe('slideComposerPlaceholder (Amendment A.6 exact copy)', () => {
  it('no project -> "Describe the deck you want…"', () => {
    expect(slideComposerPlaceholder(null, 'idle', 'idle')).toBe(
      'Describe the deck you want…',
    );
  });

  it('plan_ready -> "Edit the plan above, or press Build slides"', () => {
    expect(slideComposerPlaceholder(project('plan_ready'), 'plan_ready', 'idle')).toBe(
      'Edit the plan above, or press Build slides',
    );
  });

  it('ready -> "Ask for changes, e.g. “Make the title darker”" (A.6 curly quotes)', () => {
    expect(slideComposerPlaceholder(project('ready'), 'ready', 'idle')).toBe(
      'Ask for changes, e.g. \u201cMake the title darker\u201d',
    );
  });

  it('error status -> "Fix settings or retry your request…" (phase-agnostic)', () => {
    expect(slideComposerPlaceholder(project('error'), 'error', 'error')).toBe(
      'Fix settings or retry your request…',
    );
    expect(slideComposerPlaceholder(project('ready'), 'ready', 'error')).toBe(
      'Fix settings or retry your request…',
    );
  });

  it('defaults to a neutral follow-up string for other active phases', () => {
    expect(slideComposerPlaceholder(project('plan'), 'plan', 'running')).toBe(
      'Send a message about this deck…',
    );
  });
});

describe('slideComposerCanSend (A.6 send window)', () => {
  it('disabled while running — even with no project', () => {
    expect(slideComposerCanSend('running')).toBe(false);
  });

  it('disabled while waiting_user (AskPrompt is primary)', () => {
    expect(slideComposerCanSend('waiting_user')).toBe(false);
  });

  it('enabled for idle/done/stopped/error', () => {
    for (const s of ['idle', 'done', 'stopped', 'error'] as const) {
      expect(slideComposerCanSend(s)).toBe(true);
    }
  });
});
