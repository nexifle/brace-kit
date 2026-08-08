import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, HelpCircle, Plus, Send, X } from 'lucide-react';
import type { SlideAskState } from '../../store/slideStore.ts';
import type { SlideAskQuestion } from '../../types/slides.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import { buildAskAnswer, normalizeAskPayload } from '../../utils/slideAsk.ts';
import { Btn } from '../ui/Btn.tsx';

/** Max reference images a user may attach to an ask answer. */
const MAX_ASK_ATTACHMENTS = 3;

/** A decoded image attachment (data URL) ready to send as part of an answer. */
interface AskAttachment {
  id: string;
  name: string;
  dataUrl: string;
}

export interface AskPromptProps {
  /** The suspended question the plan session is waiting on. */
  ask: SlideAskState;
  /** Whether the answer is being sent (disables the form). */
  busy?: boolean;
  /** Submit the answer (+ optional reference images) to resume the plan session. */
  onSubmit: (answer: string, attachments: string[]) => void;
  /** Called when the user dismisses/skips the question. */
  onCancel?: () => void;
}

/**
 * Human-in-the-loop question card for an `ask` tool call (PRD US-017 / US-006).
 * Renders one or more questions from the ask payload. Each question with options
 * shows selectable chips (single-select, or multi-select checkboxes when
 * `multiple` is true); canvas questions use the canonical labeled presets; others
 * accept free text. A single question with a single-select option answers on chip
 * tap (A.11); multi-question / multi-select asks collect answers and submit
 * together. Up to 3 reference images may be attached.
 */
export function AskPrompt({ ask, busy, onSubmit, onCancel }: AskPromptProps) {
  const payload = normalizeAskPayload(ask.payload) ?? { questions: [] };
  const questions = payload.questions;
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<AskAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const allAnswered = questions.every((q) => {
    const v = answers[q.id];
    const hasChip = Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
    const hasFree = (freeTexts[q.id] ?? '').trim().length > 0;
    return hasChip || hasFree;
  });
  const canSubmit = allAnswered || attachments.length > 0;

  // Reset the draft whenever a new question arrives.
  useEffect(() => {
    setAnswers({});
    setFreeTexts({});
    setAttachments([]);
  }, [ask.id]);

  const setValue = (id: string, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const toggleOption = (q: SlideAskQuestion, option: string) => {
    const current = answers[q.id];
    const list = Array.isArray(current) ? current : [];
    const next = list.includes(option)
      ? list.filter((o) => o !== option)
      : [...list, option];
    setValue(q.id, next);
  };

  const readImage = (file: File) => {
    if (attachments.length >= MAX_ASK_ATTACHMENTS) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      img.onload = null;
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setAttachments((prev) => {
          if (prev.length >= MAX_ASK_ATTACHMENTS) return prev;
          return [
            ...prev,
            {
              id: `ask_att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              dataUrl: canvas.toDataURL('image/jpeg', 0.9),
            },
          ];
        });
      }
    };
    img.src = url;
  };

  const onFilesPicked = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) readImage(file);
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // A single-question, single-select (non-multi) ask answers immediately on chip
  // tap — no separate send step (A.11). Everything else collects then submits.
  const immediateSubmit = (value: string) =>
    onSubmit(value, attachments.map((a) => a.dataUrl));

  const submit = () => {
    if (!canSubmit || busy) return;
    onSubmit(
      buildAskAnswer(questions, answers, freeTexts),
      attachments.map((a) => a.dataUrl),
    );
  };

  /** Render the input widget for a single question. */
  function renderQuestion(q: SlideAskQuestion, index: number): ReactNode {
    const isCanvas = q.field === 'canvas';
    const options: string[] = isCanvas
      ? Object.keys(SLIDE_CANVAS_PRESETS)
      : q.options ?? [];
    const labelFor = (key: string) =>
      isCanvas
        ? SLIDE_CANVAS_PRESETS[key as keyof typeof SLIDE_CANVAS_PRESETS].label
        : key;
    const singleOnly = questions.length === 1 && !q.multiple && !q.freeText;

    // Shared focus/hover affordance so chips read as interactive, not text.
    const chipBase =
      'flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40';

    // "Add your own" free-text input, shown when the question opts in (or when
    // it has no options at all).
    const freeTextInput = (autoFocus = false) => (
      <textarea
        autoFocus={autoFocus}
        value={freeTexts[q.id] ?? ''}
        onChange={(e) => setFreeTexts((prev) => ({ ...prev, [q.id]: e.target.value }))}
        rows={2}
        placeholder={options.length > 0 ? 'Or add your own answer…' : 'Type your answer…'}
        className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none transition-all focus:border-primary/50 focus:bg-muted/40 focus:ring-2 focus:ring-primary/15"
      />
    );

    if (options.length > 0) {
      const chips = q.multiple ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((key) => {
            const label = labelFor(key);
            const active = (answers[q.id] as string[] | undefined)?.includes(key) ?? false;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleOption(q, key)}
                disabled={busy}
                aria-pressed={active}
                className={`${chipBase} ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span
                  className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border transition-colors ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent'
                  }`}
                >
                  {active && <Check size={10} strokeWidth={3} />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((key) => {
            const label = labelFor(key);
            const active = answers[q.id] === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => (singleOnly ? immediateSubmit(key) : setValue(q.id, key))}
                disabled={busy}
                aria-pressed={active}
                className={`${chipBase} ${
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-muted hover:text-foreground'
                }`}
              >
                {label}
                {active && <Check size={13} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      );
      return (
        <div className="space-y-2">
          {chips}
          {q.freeText ? freeTextInput() : null}
        </div>
      );
    }

    // Free-text-only answer.
    return freeTextInput(index === 0);
  }

  // Hide the submit button only for a single single-select (non-multi) question
  // with options, which answers immediately on chip tap (A.11). Everything else
  // — multiple questions, multi-select, or free text — collects and needs a submit.
  const onlyImmediate =
    questions.length === 1 &&
    !questions[0].multiple &&
    !questions[0].freeText &&
    (questions[0].options?.length ?? 0) > 0;
  const showSubmitButton = !onlyImmediate;

  // How many questions the user has answered (for the multi-question progress).
  const answeredCount = questions.filter((q) => {
    const v = answers[q.id];
    const hasChip = Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
    return hasChip || (freeTexts[q.id] ?? '').trim().length > 0;
  }).length;

  const showFooter = showSubmitButton || attachments.length > 0;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      {/* Accent edge — subtle brand line so the card reads as the active input. */}
      <div
        aria-hidden
        className="h-[3px] bg-gradient-to-r from-primary to-primary/30"
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-primary/[0.04] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm">
            <HelpCircle size={15} />
          </span>
          <div className="min-w-0">
            <span className="block text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
              Answer needed
            </span>
            {questions.length > 1 && (
              <span className="block text-[11px] leading-tight text-muted-foreground/80">
                {answeredCount} of {questions.length} answered
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {questions.length > 1 && (
            <span className="hidden rounded-full bg-muted/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground sm:inline">
              {answeredCount}/{questions.length}
            </span>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              title="Skip question"
              aria-label="Skip question"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4 px-4 pt-3.5">
        {questions.map((q, i) => (
          <div key={q.id} className="space-y-2">
            <div className="flex items-start gap-2">
              {questions.length > 1 && (
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                  {i + 1}
                </span>
              )}
              <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
                {q.text}
                {q.multiple && (
                  <span className="mt-0.5 mb-1 inline-flex items-center rounded-full bg-muted/70 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Select all that apply
                  </span>
                )}
              </p>
            </div>
            {renderQuestion(q, i)}
          </div>
        ))}
      </div>

      {/* Attachments */}
      {(attachments.length > 0 || attachments.length < MAX_ASK_ATTACHMENTS) && (
        <div className="mx-4 my-3 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
              Reference images
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground/60">
              {attachments.length}/{MAX_ASK_ATTACHMENTS}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border bg-muted shadow-sm"
              >
                <img
                  src={a.dataUrl}
                  alt={a.name}
                  title={a.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white opacity-90 transition-all hover:bg-black/80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  title={`Remove ${a.name}`}
                  aria-label={`Remove image ${a.name}`}
                >
                  <X size={11} />
                </button>
              </div>
            ))}
            {attachments.length < MAX_ASK_ATTACHMENTS && (
              <>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/80 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Attach reference image"
                  aria-label="Attach reference image"
                >
                  <Plus size={16} />
                  <span className="text-[9px] font-medium leading-none">Add</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onFilesPicked(e.target.files);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      {showFooter && (
        <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/20 px-4 py-2.5">
          <span className="min-w-0 truncate text-[11px] text-muted-foreground/70">
            {attachments.length > 0
              ? `${attachments.length}/${MAX_ASK_ATTACHMENTS} images`
              : showSubmitButton
                ? 'Answer all, then submit'
                : ''}
          </span>
          {showSubmitButton && (
            <Btn
              size="sm"
              onClick={submit}
              disabled={!canSubmit || busy}
              className="gap-1.5 rounded-full! px-4"
            >
              <Send size={13} />
              Answer
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}
