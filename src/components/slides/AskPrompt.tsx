import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Paperclip, Send, X } from 'lucide-react';
import type { SlideAskState } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
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
 * Shows the question, contextual option chips (canvas presets merged in for
 * `field === 'canvas'`), a free-text answer, and up to 3 reference images.
 */
export function AskPrompt({ ask, busy, onSubmit, onCancel }: AskPromptProps) {
  const { payload } = ask;
  const [answer, setAnswer] = useState('');
  const [attachments, setAttachments] = useState<AskAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Canvas presets become chips when the ask targets the canvas field.
  const chips = payload.options ?? [];
  const isCanvas = payload.field === 'canvas';
  const canvasChips = isCanvas
    ? (Object.keys(SLIDE_CANVAS_PRESETS) as Array<keyof typeof SLIDE_CANVAS_PRESETS>)
    : [];
  const canSubmit = answer.trim().length > 0 || attachments.length > 0;

  // A.11: tapping a chip answers immediately (no separate send step).
  const submitChip = (value: string) => {
    if (busy) return;
    onSubmit(value, attachments.map((a) => a.dataUrl));
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

  const submit = () => {
    if (!canSubmit || busy) return;
    onSubmit(answer.trim(), attachments.map((a) => a.dataUrl));
  };

  // Reset the draft whenever a new question arrives.
  useEffect(() => {
    setAnswer('');
    setAttachments([]);
  }, [ask.id]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-primary/5 px-3.5 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 text-primary shrink-0">
            <HelpCircle size={14} />
          </span>
          <span className="text-2xs font-semibold uppercase tracking-[0.16em] text-primary">
            Answer needed
          </span>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Skip question"
            aria-label="Skip question"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Question */}
      <div className="px-3.5 pt-3">
        <p className="text-sm font-medium leading-relaxed text-foreground">
          {payload.question}
        </p>
      </div>

      {/* Chips — for canvas questions show the canonical labeled presets only;
          the agent's bare-key options would duplicate the same four ratios. */}
      {(chips.length > 0 || canvasChips.length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
          {isCanvas
            ? canvasChips.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => submitChip(key)}
                  className={`flex min-h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-all duration-150 ${
                    answer === key
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {SLIDE_CANVAS_PRESETS[key].label}
                </button>
              ))
            : chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => submitChip(chip)}
                  className={`flex min-h-8 items-center rounded-full border px-2.5 text-xs font-medium transition-all duration-150 ${
                    answer === chip
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  {chip}
                </button>
              ))}
        </div>
      )}

      {/* Free-text answer */}
      <div className="px-3.5 pt-2.5">
        <textarea
          autoFocus
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="Type your answer…"
          className="w-full resize-none rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none transition-colors focus:border-primary/40 focus:ring-1 focus:ring-primary/10"
        />
      </div>

      {/* Attachments */}
      {(attachments.length > 0 || attachments.length < MAX_ASK_ATTACHMENTS) && (
        <div className="flex flex-wrap items-center gap-2 px-3.5 pt-2.5">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="group relative h-12 w-12 overflow-hidden rounded-lg border border-border"
            >
              <img
                src={a.dataUrl}
                alt={a.name}
                className="h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                title="Remove image"
                aria-label="Remove image"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          {attachments.length < MAX_ASK_ATTACHMENTS && (
            <>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex h-12 w-12 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                title="Attach reference image"
                aria-label="Attach reference image"
              >
                <Paperclip size={15} />
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
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 px-3.5 pb-3 pt-3">
        <span className="text-2xs text-muted-foreground/60">
          {attachments.length}/{MAX_ASK_ATTACHMENTS} images
        </span>
        <Btn
          size="sm"
          onClick={submit}
          disabled={!canSubmit || busy}
          className="gap-1.5 rounded-full! px-3.5"
        >
          Answer
          <Send size={13} />
        </Btn>
      </div>
    </div>
  );
}