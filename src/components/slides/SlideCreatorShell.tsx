import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Presentation,
  ArrowUpRight,
  History,
  FolderOpen,
  Loader2,
  BookOpen,
  MessageSquare,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../store/index.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import { applySlideProjectTitle, generateSlideProjectTitle, useSlideAgent } from '../../hooks/useSlideAgent.ts';
import { parseSlashCommand, SLASH_HELP_URL } from '../../utils/slashCommands.ts';
import { Btn } from '../ui/Btn.tsx';
import { Logo } from '../ui/Logo.tsx';
import { SLIDE_CANVAS_PRESETS, SLIDE_PHASE_STATUS_COPY } from '../../types/index.ts';
import { slideComposerPlaceholder } from '../../utils/slideComposer.ts';
import { collectFilesTouched } from '../../utils/slideFilesTouched.ts';
import { useElementSize } from '../../hooks/index.ts';
import { fitBox } from '../../utils/slideFit.ts';
import { SlidePreview } from './SlidePreview.tsx';
import { SlideFilmstrip } from './SlideFilmstrip.tsx';
import { KindPicker } from './KindPicker.tsx';
import { WebPreview } from './WebPreview.tsx';
import { isWebBuilderKind, normalizeBuilderKind } from '../../types/index.ts';
import { collectPageHtmlPaths } from '../../utils/siteVfs.ts';
import { PreviewActions } from './PreviewActions.tsx';
import { SlideProjectList } from './SlideProjectList.tsx';
import { PlanDocs } from './PlanDocs.tsx';
import { usePhaseCompletionToast } from './usePhaseCompletionToast.ts';
import { SlideChat } from './chat/SlideChat.tsx';
import { SlideChatComposer } from './chat/SlideChatComposer.tsx';
import type { SlidePendingAttachment } from '../../utils/slideUploads.ts';

/** Below this container width we collapse to a single-pane + chat drawer. */
const NARROW_BREAKPOINT = 820;

/** v0-style chat rail width. */
const RAIL_WIDTH = 400;

function PreviewCanvas({ onStartDeck }: { onStartDeck?: () => void }) {
  const canvas = useSlideStore((s) => s.canvas);
  const busy = useSlideStore((s) => s.busy);
  const activeKind = useSlideStore((s) => s.activeProject?.kind);
  const pendingKind = useSlideStore((s) => s.pendingKind);
  const web = isWebBuilderKind(normalizeBuilderKind(activeKind ?? pendingKind));
  // Layout-only frame when size is unset — not a chosen project canvas.
  const ratio = canvas ? SLIDE_CANVAS_PRESETS[canvas].width / SLIDE_CANVAS_PRESETS[canvas].height : 16 / 9;
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const box = fitBox(width, height, ratio, 56);


  return (
    <div
      ref={ref}
      className="relative flex-1 min-h-0 flex items-center justify-center overflow-hidden"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 42%, color-mix(in oklch, var(--color-primary) 9%, transparent), transparent 70%)',
        }}
      />

      <div className="relative" aria-hidden>
        <div className="relative flex items-center justify-center">
          <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 h-full w-full rounded-xl border border-border/60 bg-muted/20 -rotate-2" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-full w-full rounded-xl border border-border/60 bg-muted/30 rotate-1" />

          <div
            key={canvas}
            role="img"
            aria-label={web ? 'Empty site preview' : 'Empty slide preview'}
            className="relative flex flex-col items-center justify-center rounded-xl border border-border bg-background shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)] overflow-hidden animate-in fade-in zoom-in-95 duration-500 motion-reduce:animate-none"
            style={{ width: box.width, height: box.height }}
          >
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-primary to-primary/40" />

            {busy ? (
              <div className="flex flex-col items-center text-center gap-4 px-8">
                <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Loader2 size={24} className="animate-spin" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground tracking-tight">
                    {web
                      ? 'Pages will appear as they are written…'
                      : 'Slides will appear as they are written…'}
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
                    {web
                      ? 'The agent is building your site — this preview updates as pages land.'
                      : 'The agent is building your deck — this preview updates as slides land.'}
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
                    Preview
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[260px]">
                    Pick slides or a website — then describe what to build.
                  </p>
                </div>
                <Btn
                  variant="outline"
                  size="sm"
                  className="rounded-full! gap-1.5 mt-1 opacity-80"
                  onClick={onStartDeck}
                >
                  Start building
                  <ArrowUpRight size={14} />
                </Btn>
              </div>
            )}

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
  hideHeader = false,
  onStartDeck,
}: {
  showRailToggle?: boolean;
  railOpen?: boolean;
  onToggleRail?: () => void;
  /** Render only the preview body + filmstrip; the header moves to the toggle bar. */
  hideHeader?: boolean;
  /** Focus the composer from the empty-state CTA. */
  onStartDeck?: () => void;
}) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const busy = useSlideStore((s) => s.busy);
  const [capturingThumbs, setCapturingThumbs] = useState(false);
  const kind = normalizeBuilderKind(activeProject?.kind);
  const hasWeb =
    !!activeProject &&
    isWebBuilderKind(kind) &&
    collectPageHtmlPaths(activeProject.files).length > 0;
  const hasDeck = hasWeb || (!!activeProject && deckSlides.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!hideHeader && (
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
            <PreviewStatusBadges />
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

          <PreviewActions />
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
        {hasDeck ? (
          isWebBuilderKind(kind) ? (
            <WebPreview />
          ) : (
            <SlidePreview />
          )
        ) : (
          <PreviewCanvas onStartDeck={onStartDeck} />
        )}
      </div>

      {hasDeck && !isWebBuilderKind(kind) && (
        <SlideFilmstrip onCapturingChange={setCapturingThumbs} />
      )}
    </div>
  );
}

/** Live · updating pill for the preview header / narrow toggle bar. */
function PreviewStatusBadges() {
  const busy = useSlideStore((s) => s.busy);
  const activity = useSlideStore((s) => s.activity);
  const filesTouched = useMemo(() => collectFilesTouched(activity).length, [activity]);
  const liveUpdating = busy && filesTouched > 0;
  if (!liveUpdating) return null;
  return (
    <span
      className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary"
      role="status"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
      Live · updating
    </span>
  );
}

/** Narrow sidebar: switch the main area between the slide preview and the chat. */
function SegmentedToggle({
  value,
  onChange,
}: {
  value: 'preview' | 'chat';
  onChange: (v: 'preview' | 'chat') => void;
}) {
  const options: Array<{ value: 'preview' | 'chat'; label: string; icon: LucideIcon; title: string }> = [
    { value: 'preview', label: 'Preview', icon: Presentation, title: 'Show slide preview' },
    { value: 'chat', label: 'Chat', icon: MessageSquare, title: 'Show conversation' },
  ];
  return (
    <div
      className="flex items-center shrink-0 rounded-none border border-border/80 bg-muted/50 p-0.5"
      role="group"
      aria-label="Builder view"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1 px-2 h-6 rounded-none text-2xs font-semibold transition-colors ${
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <o.icon size={12} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

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

/* Plan/Agent mode toggle (Lovable-style). Agent mode auto-continues plan -> build;
   plan docs (brief.md, design.md, deck.json) are ALWAYS written in both modes. */
function ModeToggle() {
  const activeProject = useSlideStore((s) => s.activeProject);
  const setProjectMode = useSlideStore((s) => s.setProjectMode);
  const defaultMode = useSlideStore((s) => s.defaultMode);
  const sessionStatus = useSlideStore((s) => s.sessionStatus);
  const mode = activeProject?.mode ?? defaultMode;
  const disabled = sessionStatus === 'running';
  const options: Array<{ value: 'plan' | 'agent'; label: string; title: string }> = [
    { value: 'plan', label: 'Plan', title: 'Plan mode: review and approve the plan before building' },
    { value: 'agent', label: 'Agent', title: 'Agent mode: auto-build after planning (plan docs are still written)' },
  ];
  return (
    <div
      className="flex items-center shrink-0 rounded-none border border-border/80 bg-muted/50 p-0.5"
      role="group"
      aria-label="Builder mode"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          title={o.title}
          aria-pressed={mode === o.value}
          onClick={() => setProjectMode(o.value)}
          className={`px-2 h-6 rounded-none text-2xs font-semibold transition-colors ${
            mode === o.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ==================================================================== */
/* Wide chat rail — v0 full step stream + floating composer              */
/* ==================================================================== */

function ChatRail({
  railOpen,
  onClose,
  onSend,
  onStop,
  onBuild,
  onAnswer,
  onRetry,
  onNew,
  historyOpen,
  onHistory,
  placeholder,
  blocked,
  processingCommand,
}: {
  railOpen: boolean;
  onClose: () => void;
  onSend: (text: string, attachments?: SlidePendingAttachment[]) => void;
  onStop: () => void;
  onBuild: () => void;
  onAnswer: (projectId: string, answer: string) => void;
  onRetry?: () => void;
  onNew: () => void;
  historyOpen: boolean;
  onHistory: (open: boolean) => void;
  placeholder: string;
  blocked?: boolean;
  processingCommand?: 'compacting' | 'renaming' | null;
}) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const sessionStatus = useSlideStore((s) => s.sessionStatus);
  const [seedText, setSeedText] = useState<string | undefined>();
  const [seedKey, setSeedKey] = useState(0);

  const title = activeProject?.title?.trim() || 'New project';

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
          <div
            className="flex h-full shrink-0 flex-col border-r border-border/70 bg-background"
            style={{ width: RAIL_WIDTH }}
          >
            {historyOpen ? (
              <SlideProjectList open onClose={() => onHistory(false)} onNew={onNew} />
            ) : (
              <>
                <div className="flex items-center justify-between px-3 h-11 border-b border-border/70 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
                      <Presentation size={13} />
                    </span>
                    <span className="text-sm font-medium text-foreground truncate" title={title}>
                      {title}
                    </span>
                    <ModeToggle />
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onHistory(!historyOpen)}
                      aria-pressed={historyOpen}
                      className="flex items-center gap-1 px-2 h-7 rounded-md text-2xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Previous projects"
                    >
                      <History size={14} />
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1 px-2 h-7 rounded-md text-2xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="New project"
                      onClick={onNew}
                    >
                      <Plus size={14} />
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

                <SlideChat
                  onBuild={onBuild}
                  onAnswer={onAnswer}
                  onRetry={onRetry}
                  blocked={blocked}
                  onFillComposer={(text) => {
                    setSeedText(text);
                    setSeedKey((k) => k + 1);
                  }}
                />
                {!activeProject && (
                  <div className="px-3 pb-2">
                    <KindPicker />
                  </div>
                )}
                <SlideChatComposer
                  onSend={onSend}
                  onStop={onStop}
                  sessionStatus={sessionStatus}
                  placeholder={placeholder}
                  blocked={blocked}
                  seedText={seedText}
                  seedKey={seedKey}
                  processingCommand={processingCommand}
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
/* Shell                                                                 */
/* ==================================================================== */

export function SlideCreatorShell() {
  const store = useStore();
  const { phase, busy, activeProject, sessionStatus } = useSlideStore();
  const { ref, width } = useElementSize<HTMLDivElement>();
  const agent = useSlideAgent();

  usePhaseCompletionToast();

  useEffect(() => {
    void useSlideStore.getState().restoreLastActiveProject();
  }, []);

  const narrow = width !== 0 && width < NARROW_BREAKPOINT;
  const panelView = useSlideStore((s) => s.panelView);
  const setPanelView = useSlideStore((s) => s.setPanelView);
  const pendingAsk = useSlideStore((s) => s.pendingAsk);
  // Narrow collapses the default 'split' view to the deck preview.
  const narrowView = panelView === 'chat' ? 'chat' : 'preview';

  const pendingKind = useSlideStore((s) => s.pendingKind);
  const promptPlaceholder = slideComposerPlaceholder(
    activeProject,
    phase,
    sessionStatus,
    pendingKind,
  );

  const [processingCommand, setProcessingCommand] = useState<
    'compacting' | 'renaming' | null
  >(null);

  const handleSend = (
    text: string,
    attachments?: SlidePendingAttachment[],
  ) => {
    const pending = (attachments ?? []).filter((a) => a.type !== 'error' && a.data);
    if (!text.trim() && pending.length === 0) return;

    const slash = parseSlashCommand(text);
    if (slash) {
      if (slash.kind === 'help') {
        window.open(SLASH_HELP_URL, '_blank');
        return;
      }
      if (slash.kind === 'rename') {
        if (!activeProject || processingCommand) return;
        if (slash.title) {
          applySlideProjectTitle(activeProject.id, slash.title);
          return;
        }
        setProcessingCommand('renaming');
        void generateSlideProjectTitle(activeProject.id, { force: true }).finally(() => {
          setProcessingCommand(null);
        });
        return;
      }
      if (slash.kind === 'compact') {
        if (!activeProject || processingCommand) return;
        setProcessingCommand('compacting');
        void agent.compactProject(slash.extra || undefined).finally(() => {
          setProcessingCommand(null);
        });
        return;
      }
    }

    // In narrow mode the conversation is a separate view — bring the user to it
    // so they can see the assistant's reply as soon as they send.
    if (narrow && narrowView === 'preview') setPanelView('chat');
    if (activeProject) {
      void agent.sendFollowUp(text, pending);
    } else {
      void agent.createFromPrompt(text, pending);
    }
  };

  const handleStop = () => agent.stop();
  const blocked = !agent.canUseFunctionCalling();
  const back = () => store.closeSlideCreator();
  const openInTab = async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tab.html') + '?open=builder' });
    // Close the side panel so only the standalone tab stays open.
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.close({ windowId: win.id! });
    } catch {
      // Panel may not be closable (e.g. Chrome flag disabled) — ignore.
    }
  };
  const phaseLabel = activeProject ? (SLIDE_PHASE_STATUS_COPY[phase] ?? 'Plan') : 'Idle';

  const [railOpen, setRailOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [composerFocusKey, setComposerFocusKey] = useState(0);
  const [seedText, setSeedText] = useState<string | undefined>();
  const [seedKey, setSeedKey] = useState(0);

  // A blocking ask lives in the chat transcript (AskPrompt) — bring the user to it.
  useEffect(() => {
    if (narrow && pendingAsk) setPanelView('chat');
  }, [narrow, pendingAsk, setPanelView]);

  const handleNew = () => {
    setHistoryOpen(false);
    useSlideStore.getState().setActiveProject(null);
  };

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full flex-col overflow-hidden bg-background animate-in fade-in duration-300 motion-reduce:animate-none"
    >
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

          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center text-white justify-center w-7 h-7 bg-primary p-1 shadow-sm text-primary-foreground shrink-0">
              <Logo />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground whitespace-nowrap">
              BraceKit
            </span>
            <span className="inline-flex items-center text-2xs font-mono uppercase tracking-[0.25em] text-muted-foreground/70 border-l border-border pl-3 truncate">
              Builder
            </span>
            {activeProject && (
              <span className="hidden sm:inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {normalizeBuilderKind(activeProject.kind)}
              </span>
            )}
            <PhaseChip busy={busy && !!activeProject} label={phaseLabel} />
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {store.mode === 'sidebar' && (
            <button
              type="button"
              onClick={openInTab}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Open in new tab"
              aria-label="Open in new tab"
            >
              <ExternalLink size={15} />
            </button>
          )}
          {narrow && (
            <>
              <button
                type="button"
                onClick={() => setHistoryOpen((o) => !o)}
                aria-pressed={historyOpen}
                className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${historyOpen ? 'bg-muted text-foreground' : ''}`}
                title="Previous projects"
                aria-label="Previous projects"
              >
                <FolderOpen size={15} />
              </button>
              <button
                type="button"
                onClick={handleNew}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="New project"
                aria-label="New project"
              >
                <Plus size={15} />
              </button>
            </>
          )}
          {activeProject ? (
            <button
              type="button"
              onClick={() => setDocsOpen(true)}
              className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Brief, design, and uploaded files"
              aria-label="Open project docs"
            >
              <BookOpen size={15} />
              <span className="hidden sm:inline">Docs</span>
            </button>
          ) : null}
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {narrow ? (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {/* View toggle bar */}
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-background/70 px-2.5 backdrop-blur-sm">
              <div className="flex min-w-0 items-center gap-2">
                <SegmentedToggle
                  value={narrowView}
                  onChange={(v) => {
                    setHistoryOpen(false);
                    setPanelView(v);
                  }}
                />
                {narrowView === 'preview' && <PreviewStatusBadges />}
              </div>
              {historyOpen ? null : narrowView === 'preview' ? (
                <PreviewActions compact />
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <ModeToggle />
                </div>
              )}
            </div>

            {/* Main area */}
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              {historyOpen ? (
                <SlideProjectList open onClose={() => setHistoryOpen(false)} onNew={handleNew} />
              ) : narrowView === 'preview' ? (
                <PreviewPane
                  hideHeader
                  onStartDeck={() => setComposerFocusKey((k) => k + 1)}
                />
              ) : (
                <SlideChat
                  onBuild={() => void agent.runBuild()}
                  onAnswer={(projectId, answer) => void agent.answerAsk(projectId, answer)}
                  onRetry={() => void agent.retryFailedPhase()}
                  blocked={blocked}
                  onFillComposer={(text) => {
                    setSeedText(text);
                    setSeedKey((k) => k + 1);
                  }}
                />
              )}
            </div>

            {!activeProject && (
              <div className="px-3 pt-2">
                <KindPicker compact />
              </div>
            )}
            {/* Always-visible composer */}
            <SlideChatComposer
              onSend={handleSend}
              onStop={handleStop}
              sessionStatus={sessionStatus}
              placeholder={promptPlaceholder}
              blocked={blocked}
              seedText={seedText}
              seedKey={seedKey}
              focusKey={composerFocusKey}
              processingCommand={processingCommand}
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
              onRetry={() => void agent.retryFailedPhase()}
              onNew={handleNew}
              historyOpen={historyOpen}
              onHistory={setHistoryOpen}
              placeholder={promptPlaceholder}
              blocked={blocked}
              processingCommand={processingCommand}
            />
            <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <PreviewPane
                showRailToggle={!railOpen}
                railOpen={railOpen}
                onToggleRail={() => setRailOpen((o) => !o)}
              />
            </section>
          </>
        )}
      </div>

      <PlanDocs open={docsOpen} onClose={() => setDocsOpen(false)} />
    </div>
  );
}
