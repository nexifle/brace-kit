import type { SlideAskField, SlideAskPayload, SlideAskQuestion } from '../types/slides.ts';

/**
 * Normalize an `ask` payload into the canonical `{ questions: SlideAskQuestion[] }`
 * shape. Accepts both the current multi-question shape and the legacy single
 * `{ question, options?, field? }` shape (persisted by older sessions) so stored
 * pending asks render correctly after an upgrade.
 */
export function normalizeAskPayload(payload: unknown): SlideAskPayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const p = payload as Record<string, unknown>;

  // Legacy single-question shape: { question, options?, multiple?, freeText?, field? }
  if (typeof p.question === 'string' && p.question) {
    return {
      questions: [
        {
          id: 'q1',
          text: p.question,
          options: Array.isArray(p.options)
            ? (p.options as string[]).filter((o) => typeof o === 'string')
            : undefined,
          ...(p.multiple === true ? { multiple: true } : {}),
          ...(p.freeText === true ? { freeText: true } : {}),
          ...(typeof p.field === 'string' ? { field: p.field as SlideAskField } : {}),
        },
      ],
    };
  }

  // New multi-question shape: { questions: [...] }
  if (Array.isArray(p.questions)) {
    const questions: SlideAskQuestion[] = (p.questions as unknown[])
      .map((q, i) => normalizeAskQuestion(q, `q${i + 1}`))
      .filter((q): q is SlideAskQuestion => q !== null);
    if (questions.length > 0) return { questions };
  }

  return null;
}

/** Normalize a single ask question, assigning a stable id when missing. */
function normalizeAskQuestion(raw: unknown, fallbackId: string): SlideAskQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const text = typeof q.question === 'string' && q.question
    ? q.question
    : typeof q.text === 'string' && q.text
      ? q.text
      : '';
  if (!text) return null;
  return {
    id: typeof q.id === 'string' && q.id ? q.id : fallbackId,
    text,
    options: Array.isArray(q.options)
      ? (q.options as string[]).filter((o) => typeof o === 'string')
      : undefined,
    ...(q.multiple === true ? { multiple: true } : {}),
    ...(q.freeText === true ? { freeText: true } : {}),
    ...(typeof q.field === 'string' ? { field: q.field as SlideAskField } : {}),
  };
}

/**
 * Build the `ask` tool-result answer string from the user's per-question answers.
 * `freeTexts` holds the custom "add your own" text per question id; for a
 * multi-select question it is appended to the selected options, for a
 * single-select question it overrides the chip selection. Single-question
 * behaves like the legacy bare-value answer (e.g. "16:9"); a multi-question ask
 * returns a JSON object keyed by question id so the model can correctly
 * attribute each answer.
 */
export function buildAskAnswer(
  questions: SlideAskQuestion[],
  answers: Record<string, string | string[]>,
  freeTexts: Record<string, string> = {},
): string {
  const merged: Record<string, string | string[]> = {};
  for (const q of questions) {
    const free = (freeTexts[q.id] ?? '').trim();
    const value = answers[q.id];
    if (Array.isArray(value)) {
      // Multi-select: append the custom text as an extra value when provided.
      merged[q.id] = free ? [...value, free] : value;
    } else if (free) {
      // Single-select: custom text overrides a chip selection.
      merged[q.id] = free;
    } else {
      merged[q.id] = value ?? '';
    }
  }
  if (questions.length === 1) {
    const value = merged[questions[0].id];
    return Array.isArray(value) ? value.join(', ') : (value ?? '');
  }
  return JSON.stringify(merged);
}