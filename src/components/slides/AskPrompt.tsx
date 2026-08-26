import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, HelpCircle, Paperclip, Send, X } from 'lucide-react';
import type { SlideAskState } from '../../store/slideStore.ts';
import type { PendingAsk, AskQuestion } from '../../types/index.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import { buildAskAnswer, normalizeAskPayload } from '../../utils/ask.ts';
import { encodeImageForVision } from '../../utils/slideImageResize.ts';
import { Btn } from '../ui/Btn.tsx';
import { IconButton } from '../ui/IconButton.tsx';

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
  ask: PendingAsk | SlideAskState;
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
  const isWizard = questions.length > 1;
  const [stepIndex, setStepIndex] = useState(0);
  const [stepDir, setStepDir] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [freeTexts, setFreeTexts] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<AskAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<AskAttachment | null>(null);
  const [confirmKind, setConfirmKind] = useState<'submit' | 'skip' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const formMeasureRef = useRef<HTMLDivElement>(null);
  const overlayMeasureRef = useRef<HTMLDivElement>(null);
  const [shellHeight, setShellHeight] = useState<number | 'auto'>('auto');
  const reduceMotion = useReducedMotion();

  const isAnswered = (q: AskQuestion) => {
    const v = answers[q.id];
    const hasChip = Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim().length > 0;
    return hasChip || (freeTexts[q.id] ?? '').trim().length > 0;
  };
  const allAnswered = questions.every(isAnswered);
  const unansweredCount = questions.length - questions.filter(isAnswered).length;
  const canSubmit = allAnswered || attachments.length > 0;
  const safeStep = Math.min(stepIndex, Math.max(0, questions.length - 1));
  const current = questions[safeStep];
  const isLastStep = !isWizard || safeStep >= questions.length - 1;

  // Reset the draft whenever a new question arrives.
  useEffect(() => {
    setAnswers({});
    setFreeTexts({});
    setAttachments([]);
    setAttachError(null);
    setStepIndex(0);
    setStepDir(1);
    setLightbox(null);
    setConfirmKind(null);
    setShellHeight('auto');
  }, [ask.id]);

  useLayoutEffect(() => {
    const el = confirmKind ? overlayMeasureRef.current : formMeasureRef.current;
    if (!el) return;
    const apply = () => {
      const next = el.getBoundingClientRect().height;
      if (next > 0) setShellHeight(next);
    };
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [confirmKind, isWizard, current?.id]);

  const setValue = (id: string, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const toggleOption = (q: AskQuestion, option: string) => {
    const current = answers[q.id];
    const list = Array.isArray(current) ? current : [];
    const next = list.includes(option)
      ? list.filter((o) => o !== option)
      : [...list, option];
    setValue(q.id, next);
  };

  const readImage = (file: File) => {
    if (attachments.length >= MAX_ASK_ATTACHMENTS) return;
    void (async () => {
      try {
        const { dataUrl } = await encodeImageForVision(file);
        setAttachError(null);
        setAttachments((prev) => {
          if (prev.length >= MAX_ASK_ATTACHMENTS) return prev;
          return [
            ...prev,
            {
              id: `ask_att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              name: file.name,
              dataUrl,
            },
          ];
        });
      } catch (err) {
        setAttachError((err as Error).message || 'Could not attach image');
      }
    })();
  };

  const onFilesPicked = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) readImage(file);
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  const goStep = (dir: 1 | -1) => {
    setConfirmKind(null);
    setStepDir(dir);
    setStepIndex((i) => Math.min(questions.length - 1, Math.max(0, i + dir)));
  };

  // A single-question, single-select (non-multi) ask answers immediately on chip
  // tap — no separate send step (A.11). Everything else collects then submits.
  const immediateSubmit = (value: string) =>
    onSubmit(value, attachments.map((a) => a.dataUrl));

  const commitSubmit = () => {
    if (busy) return;
    setConfirmKind(null);
    onSubmit(
      buildAskAnswer(questions, answers, freeTexts),
      attachments.map((a) => a.dataUrl),
    );
  };

  const commitSkip = () => {
    if (busy || !onCancel) return;
    setConfirmKind(null);
    onCancel();
  };

  const requestSubmit = () => {
    if (busy) return;
    if (isWizard && unansweredCount > 0) {
      setConfirmKind('submit');
      return;
    }
    if (!canSubmit) return;
    commitSubmit();
  };

  const requestSkip = () => {
    if (busy || !onCancel) return;
    setConfirmKind((kind) => (kind === 'skip' ? null : 'skip'));
  };

  /** Render the input widget for a single question. */
  function renderQuestion(q: AskQuestion, index: number): ReactNode {
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
  const showFooter = showSubmitButton || isWizard || attachments.length > 0 || attachError != null;

  const onCardKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (busy) return;
    if (confirmKind) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmKind(null);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (confirmKind === 'skip') commitSkip();
        else commitSubmit();
      }
      return;
    }
    if (!isWizard) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
      if (e.key !== 'Enter' || e.shiftKey) return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      goStep(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isLastStep) goStep(1);
    } else if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      requestSubmit();
    }
  };

  const heightTransition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 36, mass: 0.7 };
  const slideTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

  const questionBody = (q: AskQuestion, index: number) => (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        {isWizard && (
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
            {index + 1}
          </span>
        )}
        <p className="min-w-0 flex-1 text-[13px] font-medium leading-snug text-foreground">
          {q.text}
          {q.multiple && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-muted/70 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Select all that apply
            </span>
          )}
        </p>
      </div>
      {renderQuestion(q, index)}
    </div>
  );

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onKeyDown={onCardKeyDown}
      className="overflow-hidden rounded-xl border border-border bg-card/70 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <div aria-hidden className="h-[2px] bg-gradient-to-r from-primary to-primary/30" />

      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-primary/[0.04] px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
            <HelpCircle size={12} />
          </span>
          <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
            Answer needed
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isWizard && (
            <span className="rounded-full bg-muted/70 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {safeStep + 1}/{questions.length}
            </span>
          )}
          {onCancel && (
            <IconButton
              size="sm"
              onClick={requestSkip}
              title="Skip question"
              aria-label="Skip question"
            >
              <X size={14} />
            </IconButton>
          )}
        </div>
      </div>

      <motion.div
        className="relative overflow-hidden"
        initial={false}
        animate={{ height: shellHeight }}
        transition={heightTransition}
      >
        <div ref={formMeasureRef} className={confirmKind ? 'invisible' : undefined}>
          {isWizard && (
            <div className="flex gap-0.5 px-3 pt-2" aria-hidden>
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setConfirmKind(null);
                    setStepDir(i >= safeStep ? 1 : -1);
                    setStepIndex(i);
                  }}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i === safeStep
                      ? 'bg-primary'
                      : isAnswered(q)
                        ? 'bg-primary/40'
                        : 'bg-muted'
                  }`}
                  aria-label={`Question ${i + 1}${isAnswered(q) ? ', answered' : ''}`}
                />
              ))}
            </div>
          )}

          {isWizard && current ? (
            <motion.div
              key={current.id}
              className="px-3 py-2.5"
              initial={reduceMotion ? false : { opacity: 0, x: 18 * stepDir }}
              animate={{ opacity: 1, x: 0 }}
              transition={slideTransition}
            >
              {questionBody(current, safeStep)}
            </motion.div>
          ) : (
            <div className="px-3 py-2.5">
              {questions.map((q, i) => (
                <div key={q.id}>{questionBody(q, i)}</div>
              ))}
            </div>
          )}
        </div>

        <AnimatePresence>
          {confirmKind && (
            <motion.div
              key={`confirm-${confirmKind}`}
              ref={overlayMeasureRef}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="ask-confirm-title"
              aria-describedby="ask-confirm-desc"
              className="absolute inset-x-0 top-0 z-10 flex flex-col justify-center gap-3 bg-card/90 px-4 py-4 backdrop-blur-sm"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              <div className="flex items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  confirmKind === 'skip' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                }`}>
                  <AlertTriangle size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p id="ask-confirm-title" className="text-sm font-semibold leading-snug text-foreground">
                    {confirmKind === 'skip' ? 'Skip this question?' : 'Submit anyway?'}
                  </p>
                  <p id="ask-confirm-desc" className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                    {confirmKind === 'skip'
                      ? 'Are you sure you want to skip? You can keep chatting afterward.'
                      : unansweredCount === 1
                        ? '1 question is still unanswered. Are you sure you want to submit?'
                        : `${unansweredCount} questions are still unanswered. Are you sure you want to submit?`}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Btn
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmKind(null)}
                  aria-label={confirmKind === 'skip' ? 'Cancel skip' : 'Cancel submit'}
                  className="rounded-full! px-3"
                >
                  Cancel
                </Btn>
                <Btn
                  size="sm"
                  variant={confirmKind === 'skip' ? 'destructive' : 'default'}
                  onClick={confirmKind === 'skip' ? commitSkip : commitSubmit}
                  aria-label={
                    confirmKind === 'skip'
                      ? 'Confirm skip question'
                      : 'Confirm submit with unanswered questions'
                  }
                  className="rounded-full! px-3.5"
                >
                  {confirmKind === 'skip' ? 'Skip' : 'Submit'}
                </Btn>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {showFooter && (
        <div className="flex items-center gap-1.5 border-t border-border/50 bg-muted/20 px-2.5 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            {attachments.map((a) => (
              <div
                key={a.id}
                className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40"
              >
                <button
                  type="button"
                  className="h-full w-full"
                  onClick={() => setLightbox(a)}
                  title={a.name}
                  aria-label={a.name}
                >
                  <img
                    src={a.dataUrl}
                    alt=""
                    className="h-full w-full object-cover object-center"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.id)}
                  className="absolute -right-0.5 -top-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-background text-muted-foreground shadow group-hover:flex hover:bg-destructive hover:text-destructive-foreground"
                  title={`Remove ${a.name}`}
                  aria-label={`Remove image ${a.name}`}
                >
                  <X size={9} />
                </button>
              </div>
            ))}
            {attachments.length < MAX_ASK_ATTACHMENTS && (
              <>
                <IconButton
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  title="Attach reference image"
                  aria-label="Attach reference image"
                >
                  <Paperclip size={14} />
                </IconButton>
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
            {attachments.length > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {attachments.length}/{MAX_ASK_ATTACHMENTS}
              </span>
            )}
            {attachError && (
              <p className="min-w-0 truncate text-[11px] text-destructive" role="alert">
                {attachError}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {isWizard && (
              <>
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => goStep(-1)}
                  disabled={busy || !!confirmKind || safeStep === 0}
                  aria-label="Previous question"
                  title="Previous question"
                  className="gap-1 rounded-full! px-2.5"
                >
                  <ChevronLeft size={14} />
                  Prev
                </Btn>
                <Btn
                  variant="outline"
                  size="sm"
                  onClick={() => goStep(1)}
                  disabled={busy || !!confirmKind || isLastStep}
                  aria-label="Next question"
                  title="Next question"
                  className="gap-1 rounded-full! px-2.5"
                >
                  Next
                  <ChevronRight size={14} />
                </Btn>
              </>
            )}
            {showSubmitButton && (
              <Btn
                size="sm"
                onClick={requestSubmit}
                disabled={busy || !!confirmKind || (!isWizard && !canSubmit)}
                className="gap-1.5 rounded-full! px-3.5"
              >
                <Send size={13} />
                Answer
              </Btn>
            )}
          </div>
        </div>
      )}

      {lightbox && (
        <AskAttachmentLightbox att={lightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}

function AskAttachmentLightbox({
  att,
  onClose,
}: {
  att: AskAttachment;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <span className="truncate text-xs font-medium">{att.name}</span>
          <IconButton size="sm" onClick={onClose} aria-label="Close" title="Close">
            <X size={14} />
          </IconButton>
        </div>
        <div className="p-3">
          <img src={att.dataUrl} alt={att.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />
        </div>
      </div>
    </div>
  );
}
