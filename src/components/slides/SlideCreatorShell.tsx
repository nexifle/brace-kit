import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Presentation,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  PaperclipIcon,
  ImagePlus,
  History,
  AlertTriangle,
  Loader2,
  Square,
} from 'lucide-react';
import { useStore } from '../../store/index.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import { useSlideAgent } from '../../hooks/useSlideAgent.ts';
import { Btn } from '../ui/Btn.tsx';
import { ComposerPicker } from '../ComposerPicker.tsx';
import { SLIDE_CANVAS_PRESETS, SLIDE_PHASE_STATUS_COPY } from '../../types/index.ts';
import type { SlideSessionStatus } from '../../types/slides.ts';
import { slideComposerCanSend, slideComposerPlaceholder } from '../../utils/slideComposer.ts';
import { collectFilesTouched } from '../../utils/slideFilesTouched.ts';
import { useElementSize } from '../../hooks/index.ts';
import { AskPrompt } from './AskPrompt.tsx';
import { PlanReview } from './PlanReview.tsx';
import { SlidePreview } from './SlidePreview.tsx';
import { SlideFilmstrip } from './SlideFilmstrip.tsx';
import { ExportDeck } from './ExportDeck.tsx';
import { SlideCodeViewer } from './SlideCodeViewer.tsx';
import { Transcript } from './Transcript.tsx';
import { StreamingAgentBubble } from './StreamingAgentBubble.tsx';
import { AgentActivityFeed } from './AgentActivityFeed.tsx';
import { PhaseHeader } from './PhaseHeader.tsx';
import { FileChangeStrip } from './FileChangeStrip.tsx';
import { SlideProjectList } from './SlideProjectList.tsx';
import { usePhaseCompletionToast } from './usePhaseCompletionToast.ts';

/** Below this container width we collapse to a single-pane + chat drawer. */
const NARROW_BREAKPOINT = 820;

/* ==================================================================== */
/* Scale-to-fit slide canvas                                            */
/* ==================================================================== */

function fitBox(maxW: number, maxH: number, ratio: number, inset: number) {
  let w = Math.max(maxW - inset, 0);
  let h = Math.max(maxH - inset, 0);
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  return { width: Math.max(w, 1), height: Math.max(h, 1) };
}

function PreviewCanvas() {
  const canvas = useSlideStore((s) => s.canvas);
  const busy = useSlideStore((s) => s.busy);
  const preset = SLIDE_CANVAS_PRESETS[canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const box = fitBox(width, height, preset.width / preset.height, 56);

  return (
    <div
      ref={ref}
      className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
    >
      {/* Soft ambient wash behind the deck (product accent, not decoration). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 42%, color-mix(in oklch, var(--color-primary) 9%, transparent), transparent 70%)',
        }}
      />

      {/* Deck stack depth motif */}
      <div className="relative" aria-hidden>
        <div className="relative flex items-center justify-center">
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-full w-full rounded-xl border border-border/60 bg-muted/20 -rotate-2" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-full w-full rounded-xl border border-border/60 bg-muted/30 rotate-1" />

          <div
            key={canvas}
            role="img"
            aria-label="Empty slide preview"
            className="relative flex flex-col items-center justify-center rounded-xl border border-border bg-background shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] overflow-hidden animate-in fade-in zoom-in-95 duration-500 motion-reduce:animate-none"
            style={{ width: box.width, height: box.height }}
          >
            {/* Accent top edge on the "slide" */}
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary to-primary/40" />

            {/* Building state (no slides yet): never a dead void — show live copy. */}
            {busy ? (
              <div className="flex flex-col items-center text-center gap-4 px-8">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Loader2 size={24} className="animate-spin" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground tracking-tight">
                    Slides will appear as they are written…
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
                    The agent is building your deck — this preview updates as slides land.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-center gap-4 px-8">
                <div className="relative">
                  <span className="absolute inset-0 rounded-2xl bg-primary/25 blur-lg" aria-hidden />
                  <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-primary text-primary-foreground shadow-lg">
                    <Presentation size={24} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground tracking-tight">
                    Your slides preview
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px]">
                    Describe a deck and the agent will plan, build, and render it right here.
                  </p>
                </div>
                <Btn
                  variant="outline"
                  size="sm"
                  className="rounded-full! gap-1.5 mt-1 opacity-80"
                  onClick={() => {}}
                >
                  Start a deck
                  <ArrowUpRight size={14} />
                </Btn>
              </div>
            )}

            {/* Bottom-page dot navigation (hidden until slides exist) */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-40">
              {[0, 1].map((i) => (
                <span
                  key={i}
                  className="h-1 rounded-full bg-foreground/40"
                  style={{ width: i === 0 ? 16 : 6 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewPane({
  showRailToggle,
  railOpen,
  onToggleRail,
}: {
  showRailToggle?: boolean;
  railOpen?: boolean;
  onToggleRail?: () => void;
}) {
  const busy = useSlideStore((s) => s.busy);
  const activity = useSlideStore((s) => s.activity);
  const filesTouched = useMemo(() => collectFilesTouched(activity).length, [activity]);
  const liveUpdating = busy && filesTouched > 0;
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const currentSlideIndex = useSlideStore((s) => s.currentSlideIndex);
  const selectSlide = useSlideStore((s) => s.selectSlide);
  const canvas = useSlideStore((s) => s.canvas);
  const preset = SLIDE_CANVAS_PRESETS[canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];
  const hasDeck = !!activeProject && deckSlides.length > 0;
  const [capturingThumbs, setCapturingThumbs] = useState(false);
  const position = hasDeck
    ? `${Math.min(currentSlideIndex + 1, deckSlides.length)} / ${deckSlides.length}`
    : null;

  const goNext = () => selectSlide(Math.min(currentSlideIndex + 1, deckSlides.length - 1));
  const goPrev = () => selectSlide(Math.max(currentSlideIndex - 1, 0));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between pl-2 pr-3 h-11 border-b border-border/70 bg-background/70 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-1 min-w-0">
          {showRailToggle && (
            <button
              type="button"
              onClick={onToggleRail}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={railOpen ? 'Hide chat' : 'Show chat'}
              aria-label={railOpen ? 'Hide chat' : 'Show chat'}
            >
              {railOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
          )}
          <span className="pl-1 text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Preview
          </span>
          {liveUpdating && (
            <span
              className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary"
              role="status"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Live · updating
            </span>
          )}
          {capturingThumbs && !busy && (
            <span
              className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground"
              role="status"
            >
              <Loader2 size={10} className="animate-spin" />
              Capturing thumbnails…
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {hasDeck && <ExportDeck />}
          {hasDeck && <SlideCodeViewer />}
          {hasDeck ? (
            /* slide navigation for decks: prev / position / next */
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={currentSlideIndex <= 0}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                title="Previous slide (Left)"
                aria-label="Previous slide"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-[3.5rem] text-center text-2xs tabular-nums text-muted-foreground">
                {position}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={currentSlideIndex >= deckSlides.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
                title="Next slide (Right)"
                aria-label="Next slide"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          ) : busy && !liveUpdating ? (
            <span className="flex items-center gap-1.5 text-2xs font-medium text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Rendering
            </span>
          ) : (
            <span className="text-2xs text-muted-foreground/50">
              {preset.label} · {preset.width}×{preset.height}
            </span>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {hasDeck ? <SlidePreview /> : <PreviewCanvas />}
      </div>

      {hasDeck && <SlideFilmstrip onCapturingChange={setCapturingThumbs} />}
    </div>
  );
}

/* ==================================================================== */
/* Composer                                                             */
/* ==================================================================== */

function Composer({
  onSend,
  onStop,
  sessionStatus,
  placeholder,
  blocked,
  blockedHint,
}: {
  onSend: (text: string) => void;
  onStop: () => void;
  sessionStatus: SlideSessionStatus;
  placeholder: string;
  blocked?: boolean;
  blockedHint?: string;
}) {
  const [value, setValue] = useState('');
  const running = sessionStatus === 'running';
  const waiting = sessionStatus === 'waiting_user';
  const typed = slideComposerCanSend(sessionStatus);
  // A.6: the freeform composer is NOT a send path while running (Stop is
  // primary) nor while waiting_user (AskPrompt is primary). Send is enabled
  // only for idle/plan_ready/ready/stopped/error/done.
  const disabled = !typed || blocked;
  const canSend = typed && !blocked;

  function submit() {
    if (!canSend || !value.trim()) return;
    onSend(value);
    setValue('');
  }

  return (
    <div className="shrink-0 border-t border-border/70 bg-muted/30 p-3">
      {blocked && (
        <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-2xs leading-relaxed text-amber-200/90">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />
          <span>
            {blockedHint ??
              'Your current model cannot use the tools Slide Creator requires. Switch to a function-calling model in Settings to plan or edit decks.'}
          </span>
        </div>
      )}

      {waiting ? (
        /* A.6: while a suspended ask is pending, AskPrompt is the primary
           input — keep only a muted status + cancel affordance here. */
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={13} className="shrink-0 animate-spin text-primary" />
            <span className="truncate">Waiting for your answer above</span>
          </span>
          <button
            type="button"
            onClick={onStop}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-2xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
            title="Cancel plan"
            aria-label="Cancel plan"
          >
            <Square size={11} />
            Cancel
          </button>
        </div>
      ) : (
        <div className="relative rounded-xl border border-border bg-card/50 shadow-sm transition-all duration-200 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/10 hover:border-border">
          <textarea
            rows={2}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              blocked
                ? 'Function calling required to plan decks'
                : running
                  ? 'Generating…'
                  : placeholder
            }
            disabled={disabled}
            className="w-full resize-none bg-transparent px-4 pt-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/70 outline-none disabled:cursor-not-allowed"
          />

          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled
                className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                title="Attach file (coming soon)"
                aria-label="Attach file"
              >
                <PaperclipIcon size={12} />
              </button>
              <button
                type="button"
                disabled
                className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                title="Add image (coming soon)"
                aria-label="Add image"
              >
                <ImagePlus size={12} />
              </button>
            </div>

            <div className="min-w-0 flex-1 px-1">
              <ComposerPicker />
            </div>

            {running ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/85 text-destructive-foreground shadow-sm transition-all duration-200 hover:bg-destructive active:scale-95"
                title="Stop generating"
                aria-label="Stop generating"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={disabled || !value.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-all duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale disabled:scale-100"
                title="Send"
                aria-label="Send"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center pt-1.5">
        <span className="flex items-center gap-1 text-2xs text-muted-foreground/60">
          {waiting ? (
            'Your answer resumes the plan'
          ) : running ? (
            <>
              <span>Stop generating anytime</span>
              <span className="mx-0.5 text-muted-foreground/30">·</span>
              <span>no edits send</span>
            </>
          ) : (
            <>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
              send
              <span className="mx-0.5 text-muted-foreground/30">·</span>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Shift</kbd>
              <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>
              new line
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-10 px-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 text-primary">
        <Presentation size={22} />
      </div>
      <p className="text-sm font-semibold text-foreground">No deck yet</p>
      <p className="text-xs text-muted-foreground leading-relaxed max-w-[220px]">
        Start by describing your deck. The agent will plan it here before building slides.
      </p>
    </div>
  );
}

/* ==================================================================== */
/* Phase chip (animated on change)                                      */
/* ==================================================================== */

function PhaseChip({ busy, label }: { busy: boolean; label: string }) {
  const slot = busy ? 'busy' : label;
  return (
    <span
      key={slot}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-2xs font-semibold uppercase tracking-[0.12em] ${
        busy
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'
      } animate-in fade-in slide-in-from-top-1 duration-200`}
    >
      {busy && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
      <span className="truncate">{busy ? 'Building…' : label}</span>
    </span>
  );
}

/* ==================================================================== */
/* Wide chat rail (left, collapsible)                                   */
/* ==================================================================== */

/* ==================================================================== */
/* Wide chat rail (left, collapsible) — framer-motion like app rail      */
/* ==================================================================== */

const RAIL_WIDTH = 320;

function ChatRail({
  railOpen,
  onClose,
  onSend,
  onStop,
  onBuild,
  onAnswer,
  onNew,
  historyOpen,
  onHistory,
  placeholder,
  blocked,
}: {
  railOpen: boolean;
  onClose: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onBuild: () => void;
  onAnswer: (projectId: string, answer: string) => void;
  onNew: () => void;
  historyOpen: boolean;
  onHistory: (open: boolean) => void;
  placeholder: string;
  blocked?: boolean;
}) {
  const { activeProject, messages, pendingAsk, busy, phase, activity, sessionStatus } = useSlideStore();
  return (
    <AnimatePresence initial={false}>
      {railOpen && (
        <motion.aside
          key="slide-chat-rail"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: RAIL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="h-full shrink-0 overflow-hidden bg-background"
        >
          <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-border/70 bg-background">
            {historyOpen ? (
              <SlideProjectList
                open
                onClose={() => onHistory(false)}
                onNew={onNew}
              />
            ) : (
              <>
                <div className="flex items-center justify-between px-3 h-11 border-b border-border/70 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
                      <Plus size={13} />
                    </span>
                    <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground truncate">
                      Project
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onHistory(!historyOpen)}
                      aria-pressed={historyOpen}
                      className="flex items-center gap-1 px-2 h-7 rounded-md text-2xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Previous decks"
                    >
                      <History size={14} />
                      History
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 h-7 rounded-md text-2xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="New deck"
                      onClick={onNew}
                    >
                      <Plus size={14} />
                      New
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Hide chat"
                      aria-label="Hide chat"
                    >
                      <PanelLeftClose size={15} />
                    </button>
                  </div>
                </div>

                <PhaseHeader onStop={onStop} />
                <FileChangeStrip />

                <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-3">
                  {pendingAsk ? (
                    <AskPrompt
                      ask={pendingAsk}
                      busy={busy}
                      onSubmit={(answer) => onAnswer(pendingAsk.projectId, answer)}
                    />
                  ) : activeProject && phase === 'plan_ready' ? (
                    <PlanReview onBuild={onBuild} blocked={blocked} />
                  ) : activeProject ? (
                    <Transcript messages={messages} />
                  ) : (
                    <EmptyChat />
                  )}
                  <StreamingAgentBubble />
                  {activeProject && <AgentActivityFeed events={activity} />}
                </div>
                <Composer
                  onSend={onSend}
                  onStop={onStop}
                  sessionStatus={sessionStatus}
                  placeholder={placeholder}
                  blocked={blocked}
                />
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ==================================================================== */
/* Narrow chat drawer (bottom sheet over preview)                       */
/* ==================================================================== */

function ChatDock({
  open,
  onToggle,
  onSend,
  onStop,
  onBuild,
  onAnswer,
  placeholder,
  blocked,
}: {
  open: boolean;
  onToggle: () => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onBuild: () => void;
  onAnswer: (projectId: string, answer: string) => void;
  placeholder: string;
  blocked?: boolean;
}) {
  const { activeProject, messages, pendingAsk, busy, phase, activity, sessionStatus } = useSlideStore();
  const [dockValue, setDockValue] = useState('');
  const running = sessionStatus === 'running';
  const waiting = sessionStatus === 'waiting_user';

  if (open) {
    return (
      <div className="absolute inset-x-0 bottom-0 z-20 flex h-[62%] flex-col rounded-t-2xl border-t border-border bg-background shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.3)] animate-in slide-in-from-bottom-full duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:animate-none">
        <div className="flex items-center justify-between px-4 h-11 border-b border-border/70 shrink-0">
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Conversation
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-1 px-2 h-7 rounded-md text-2xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ChevronDown size={15} />
            View deck
          </button>
        </div>

        <PhaseHeader onStop={onStop} />
        <FileChangeStrip />

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
          {pendingAsk ? (
            <AskPrompt
              ask={pendingAsk}
              busy={busy}
              onSubmit={(answer) => onAnswer(pendingAsk.projectId, answer)}
            />
          ) : activeProject && phase === 'plan_ready' ? (
            <PlanReview onBuild={onBuild} blocked={blocked} />
          ) : activeProject ? (
            <Transcript messages={messages} />
          ) : (
            <EmptyChat />
          )}
          <StreamingAgentBubble />
          {activeProject && <AgentActivityFeed events={activity} />}
        </div>
        <Composer
          onSend={onSend}
          onStop={onStop}
          sessionStatus={sessionStatus}
          placeholder={placeholder}
          blocked={blocked}
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-20 flex items-end gap-2 rounded-2xl border border-border bg-background/95 backdrop-blur-md px-2.5 py-2 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.3)] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
        title="Open conversation"
        aria-label="Open conversation"
      >
        <ChevronUp size={15} />
      </button>
      {waiting ? (
        <>
          <span className="flex h-7 flex-1 min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={13} className="shrink-0 animate-spin text-primary" />
            <span className="truncate">Waiting for your answer</span>
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary transition-all duration-200 hover:bg-primary/20 active:scale-90"
            title="Answer the question"
            aria-label="Answer the question"
          >
            <ArrowUpRight size={13} />
          </button>
        </>
      ) : (
        <>
          <input
            value={dockValue}
            onChange={(e) => setDockValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (dockValue.trim() && !running && !blocked) {
                  onSend(dockValue);
                  setDockValue('');
                }
              }
            }}
            placeholder={
              blocked ? 'Function calling required' : running ? 'Generating…' : placeholder
            }
            disabled={running || blocked}
            className="h-7 flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:cursor-not-allowed"
          />
          {running ? (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-destructive/85 text-destructive-foreground shadow-sm transition-all duration-200 hover:bg-destructive active:scale-90"
              title="Stop generating"
              aria-label="Stop generating"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (dockValue.trim() && !blocked) {
                  onSend(dockValue);
                  setDockValue('');
                }
              }}
              disabled={blocked || !dockValue.trim()}
              className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground shadow-sm transition-all duration-200 disabled:opacity-30 disabled:grayscale hover:brightness-110 active:scale-90"
              title="Send"
              aria-label="Send"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ==================================================================== */
/* Shell                                                                */
/* ==================================================================== */

export function SlideCreatorShell() {
  const store = useStore();
  const { phase, busy, activeProject, sessionStatus } = useSlideStore();
  const { ref, width } = useElementSize<HTMLDivElement>();
  const agent = useSlideAgent();

  // US-046 (A.12): fire a success toast when a build/edit phase completes.
  usePhaseCompletionToast();

  // Restore the last-active project (files/transcript/pending ask) on open, so
  // a reload of the extension returns the user to exactly where they left off.
  useEffect(() => {
    void useSlideStore.getState().restoreLastActiveProject();
  }, []);

  // A.6 composer placeholder copy: exact per-state string, routed through the
  // pure helper so both the wide ChatRail and narrow ChatDock share one source.
  const promptPlaceholder = slideComposerPlaceholder(activeProject, phase, sessionStatus);

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    if (activeProject) {
      void agent.sendFollowUp(text);
    } else {
      void agent.createFromPrompt(text);
    }
  };

  // Abort the in-flight plan/build/edit and leave a consistent stopped workspace.
  const handleStop = () => agent.stop();

  // US-032: when the active model can't use function-calling tools, block the
  // composer + build CTA and show a clear notice instead of a silent hang.
  const blocked = !agent.canUseFunctionCalling();

  const back = () => store.closeSlideCreator();
  const phaseLabel = activeProject ? (SLIDE_PHASE_STATUS_COPY[phase] ?? 'Plan') : 'Idle';

  const narrow = width !== 0 && width < NARROW_BREAKPOINT;
  const [chatOpen, setChatOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  // "New deck" clears the active project so the composer starts a fresh deck
  // (and closes any open history). The newly created project is persisted and
  // set last-active by the orchestrator on the first prompt.
  const handleNew = () => {
    setHistoryOpen(false);
    useSlideStore.getState().setActiveProject(null);
  };

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full flex-col overflow-hidden bg-background animate-in fade-in duration-300 motion-reduce:animate-none"
    >
      {/* Header */}
      <header className="relative z-30 flex items-center justify-between gap-2 px-2.5 h-12 border-b border-border/70 bg-background/80 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={back}
            className="group flex h-7 shrink-0 items-center justify-center rounded-lg px-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Back to main"
            aria-label="Back to main"
          >
            <ArrowLeft size={16} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
          </button>

          <div className="flex items-center text-white justify-center w-7 h-7 rounded-lg bg-primary p-1 shadow-sm text-primary-foreground shrink-0">
            <Presentation size={15} />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-sm tracking-tight text-foreground whitespace-nowrap">
              Slide Creator
            </span>
            <PhaseChip busy={busy && !!activeProject} label={phaseLabel} />
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {narrow ? (
          /* Preview stays put; chat is a transient bottom sheet. */
          <div className="relative min-w-0 flex-1">
            <PreviewPane />
            <ChatDock
              open={chatOpen}
              onToggle={() => setChatOpen((o) => !o)}
              onSend={handleSend}
              onStop={handleStop}
              onBuild={() => void agent.runBuild()}
              onAnswer={(projectId, answer) => void agent.answerAsk(projectId, answer)}
              placeholder={promptPlaceholder}
              blocked={blocked}
            />
          </div>
        ) : (
          <>
            <ChatRail
              railOpen={railOpen}
              onClose={() => setRailOpen(false)}
              onSend={handleSend}
              onStop={handleStop}
              onBuild={() => void agent.runBuild()}
              onAnswer={(projectId, answer) => void agent.answerAsk(projectId, answer)}
              onNew={handleNew}
              historyOpen={historyOpen}
              onHistory={setHistoryOpen}
              placeholder={promptPlaceholder}
              blocked={blocked}
            />
            <section className="relative min-w-0 flex-1 flex-col">
              <PreviewPane
                showRailToggle={!railOpen}
                railOpen={railOpen}
                onToggleRail={() => setRailOpen((o) => !o)}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
