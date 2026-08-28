import type {
  SlidePhase,
  SlideProject,
  SlideSessionStatus,
} from '../types/slides.ts';

/**
 * Pure helpers for the state-correct composer (US-041, Amendment A.6).
 *
 * The composer's enabled/placeholder behavior is a function of the session's
 * machine state (sessionStatus) plus the phase, never just `busy` — a
 * waiting_user ask is NOT a send window even though busy === false.
 */

/** Exact placeholder copy per Amendment A.6, keyed on phase + status. */
export function slideComposerPlaceholder(
  project: SlideProject | null,
  phase: SlidePhase,
  sessionStatus: SlideSessionStatus,
  pendingKind: SlideProject['kind'] = 'slides',
): string {
  const kind = project?.kind ?? pendingKind ?? 'slides';
  if (!project) {
    if (kind === 'site') return 'Describe the website you want…';
    return 'Describe the deck you want…';
  }
  if (sessionStatus === 'error') return 'Fix settings or retry your request…';
  if (phase === 'plan_ready') {
    return kind === 'slides'
      ? 'Edit the plan above, or press Build slides'
      : 'Edit the plan above, or press Build';
  }
  if (phase === 'ready') {
    return kind === 'slides'
      ? 'Ask for changes, e.g. “Make the title darker”'
      : 'Ask for changes, e.g. “Make the hero taller”';
  }
  return kind === 'slides'
    ? 'Send a message about this deck…'
    : 'Send a message about this project…';
}

/**
 * Is the freeform composer an allowed send path right now?
 *
 * A.6: the composer is a send window only for idle|done|stopped|error — NOT
 * while running (Stop is primary) nor while waiting_user (AskPrompt is the
 * primary input during a suspended ask). This is purely a function of
 * sessionStatus; `blocked` is a separate model-capability gate applied at the
 * call site, and starting a deck happens from the no-project idle state.
 */
export function slideComposerCanSend(sessionStatus: SlideSessionStatus): boolean {
  return sessionStatus !== 'running' && sessionStatus !== 'waiting_user';
}

/** Freeform send needs typed text and/or at least one valid pending attachment. */
export function slideComposerHasPayload(text: string, validAttachmentCount: number): boolean {
  return text.trim().length > 0 || validAttachmentCount > 0;
}
