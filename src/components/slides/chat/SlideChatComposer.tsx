import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { SlideSessionStatus } from '../../../types/slides.ts';
import { slideComposerCanSend, slideComposerHasPayload } from '../../../utils/slideComposer.ts';
import type { SlidePendingAttachment } from '../../../utils/slideUploads.ts';
import { MAX_SLIDE_COMPOSER_ATTACHMENTS } from '../../../utils/slideUploads.ts';
import { useSlideComposerAttachments } from '../../../hooks/useSlideComposerAttachments.ts';
import { ComposerPicker } from '../../ComposerPicker.tsx';
import { ReasoningPopover } from '../../ReasoningPopover.tsx';
import {
  AttachmentChip,
  AttachmentLightbox,
  PaperclipButton,
  toViewable,
  type ViewableAttachment,
} from './SlideAttachmentViews.tsx';

/**
 * Slide rail composer: same provider + thinking controls as main chat
 * (`ComposerPicker`, `ReasoningPopover`), with session gates from US-041.
 */
export function SlideChatComposer({
  onSend,
  onStop,
  sessionStatus,
  placeholder,
  blocked,
  blockedHint,
  seedText,
  seedKey,
  focusKey,
}: {
  onSend: (text: string, attachments: SlidePendingAttachment[]) => void;
  onStop: () => void;
  sessionStatus: SlideSessionStatus;
  placeholder: string;
  blocked?: boolean;
  blockedHint?: string;
  /** When seedKey changes, value is replaced with seedText. */
  seedText?: string;
  seedKey?: number;
  /** When focusKey changes, the composer textarea is focused (empty-state CTA). */
  focusKey?: number;
}) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { attachments, valid, handleFileSelect, handlePaste, removeAttachment, clearAttachments, loading } =
    useSlideComposerAttachments();
  const [viewer, setViewer] = useState<ViewableAttachment | null>(null);
  const running = sessionStatus === 'running';
  const waiting = sessionStatus === 'waiting_user';
  const typed = slideComposerCanSend(sessionStatus);
  const disabled = !typed || blocked;
  const canSend = typed && !blocked && !loading && slideComposerHasPayload(value, valid.length);

  useEffect(() => {
    if (seedKey == null) return;
    if (seedText != null) setValue(seedText);
  }, [seedKey, seedText]);

  useEffect(() => {
    if (focusKey == null) return;
    textareaRef.current?.focus();
  }, [focusKey]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const onPaste = (e: Event) => void handlePaste(e as ClipboardEvent);
    el.addEventListener('paste', onPaste);
    return () => el.removeEventListener('paste', onPaste);
  }, [handlePaste]);

  function submit() {
    if (!canSend) return;
    onSend(value, valid);
    setValue('');
    clearAttachments();
  }

  return (
    <div className="shrink-0 border-t border-border/70 bg-muted/20 px-3 pb-3 pt-2">
      {blocked && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-2xs leading-relaxed text-amber-200/90">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />
          <span>
            {blockedHint ??
              'This model cannot use tools. Pick a function-calling model below (or in Settings).'}
          </span>
        </div>
      )}

      {waiting ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground shadow-sm">
          <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
          <span className="min-w-0 flex-1 truncate">Answer the question above to continue</span>
          <button
            type="button"
            onClick={onStop}
            className="flex h-7 shrink-0 items-center rounded-lg border border-border px-2.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            title="Cancel"
            aria-label="Cancel plan"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div
          className="relative rounded-xl border border-border bg-card shadow-[0_8px_30px_-12px_rgba(0,0,0,0.28)] focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/15"
          onDragOver={(e) => {
            if (disabled) return;
            e.preventDefault();
          }}
          onDrop={(e) => {
            if (disabled) return;
            e.preventDefault();
            void handleFileSelect(e.dataTransfer.files);
          }}
        >
          {attachments.length > 0 && (
            <div className="flex items-center gap-1 px-2.5 pt-2">
              {attachments.slice(0, MAX_SLIDE_COMPOSER_ATTACHMENTS).map((att) => (
                <AttachmentChip
                  key={att.id}
                  att={toViewable(att)}
                  onRemove={disabled ? undefined : () => removeAttachment(att.id)}
                  onOpen={() => setViewer(toViewable(att))}
                />
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            disabled={disabled && !running}
            placeholder={running ? 'Generating…' : placeholder}
            className="max-h-[420px] min-h-[52px] w-full resize-none field-sizing-content overflow-y-auto bg-transparent px-3 pt-2.5 pb-1 text-sm leading-snug text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />

          {/* Toolbar: same controls as main InputArea (subset) */}
          <div className="relative flex items-center gap-1.5 px-2 pb-2 pt-0.5">
            <PaperclipButton
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,.txt,text/plain"
              multiple
              className="hidden"
              onChange={(e) => {
                void handleFileSelect(e.target.files);
                e.target.value = '';
              }}
            />
            <ReasoningPopover />
            <div className="min-w-0 flex-1" />
            <ComposerPicker />
            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-all hover:brightness-110 active:scale-95"
                title="Stop"
                aria-label="Stop generating"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!canSend}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
                title="Send"
                aria-label="Send"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}
      <AttachmentLightbox att={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}
