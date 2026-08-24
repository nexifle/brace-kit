import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import { collectFilesTouched } from '../../utils/slideFilesTouched.ts';
import { RoundHistory } from './RoundHistory.tsx';
import { ExportDeck } from './ExportDeck.tsx';
import { SlideCodeViewer } from './SlideCodeViewer.tsx';

const MENU_GAP = 6;

/**
 * Right-side action cluster for the Slide Creator preview header.
 *
 * Shared by the wide `PreviewPane` header (all actions visible) and the narrow
 * sidebar toggle bar (decluttered: Export + size + prev/next stay put, while
 * round history and the slide-code viewer collapse behind a `⋯` overflow
 * menu). Reads the slide store directly, like `ExportDeck`/`RoundHistory`.
 *
 * The `⋯` overflow menu is portaled to `document.body` with fixed,
 * viewport-clamped positioning (mirroring `RoundHistory`) so it can never be
 * clipped by the header's backdrop-blur containing block. It embeds
 * `RoundHistory`/`SlideCodeViewer` as its rows and does NOT close when they are
 * clicked — their own overlays (RoundHistory popover `z-70`, SlideCodeViewer
 * modal `z-100`) render above it (`z-55`), so their viewport anchors stay
 * valid. The menu closes on outside mousedown or Escape.
 */
export function PreviewActions({ compact = false }: { compact?: boolean }) {
  const busy = useSlideStore((s) => s.busy);
  const activity = useSlideStore((s) => s.activity);
  const filesTouched = useMemo(() => collectFilesTouched(activity).length, [activity]);
  const liveUpdating = busy && filesTouched > 0;
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const currentSlideIndex = useSlideStore((s) => s.currentSlideIndex);
  const selectSlide = useSlideStore((s) => s.selectSlide);
  const canvas = useSlideStore((s) => s.canvas);
  const preset = canvas ? SLIDE_CANVAS_PRESETS[canvas] : null;

  const hasDeck = !!activeProject && deckSlides.length > 0;
  const position = hasDeck
    ? `${Math.min(currentSlideIndex + 1, deckSlides.length)} / ${deckSlides.length}`
    : null;

  const goNext = () => selectSlide(Math.min(currentSlideIndex + 1, deckSlides.length - 1));
  const goPrev = () => selectSlide(Math.max(currentSlideIndex - 1, 0));

  const [moreOpen, setMoreOpen] = useState(false);
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Clamp the fixed-positioned overflow menu to the viewport (mirrors
  // RoundHistory): drop below the trigger, flip above when that would overflow
  // the bottom, and clamp horizontally so a narrow sidebar never clips it.
  const placeMenu = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const t = trigger.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = t.bottom + MENU_GAP;
    if (top + m.height > vh) top = Math.max(MENU_GAP, t.top - MENU_GAP - m.height);
    let left = t.right - m.width;
    if (left < MENU_GAP) left = MENU_GAP;
    if (left + m.width > vw - MENU_GAP) left = vw - MENU_GAP - m.width;

    setPlacement({ top, left });
  };

  useEffect(() => {
    if (!moreOpen) return;
    placeMenu();
    const reposition = () => placeMenu();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Node).isConnected) return;
      const menu = menuRef.current;
      const trigger = triggerRef.current;
      if (
        menu &&
        !menu.contains(e.target as Node) &&
        trigger &&
        !trigger.contains(e.target as Node)
      ) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  // No committed deck yet: status fallback (mirrors the old PreviewPane header).
  if (!hasDeck) {
    return busy && !liveUpdating ? (
      <span className="flex items-center gap-1.5 text-2xs font-medium text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
        Rendering
      </span>
    ) : (
      <span className="text-2xs text-muted-foreground/50">
        {preset ? `${preset.label} · ${preset.width}×${preset.height}` : 'Choose a slide size to continue'}
      </span>
    );
  }

  const sizeChip = preset ? (
    <span
      className="shrink-0 rounded-full border border-border/80 bg-muted/70 px-2 py-0.5 text-2xs font-medium tabular-nums tracking-tight text-foreground/80"
      title={`${preset.label} · ${preset.width}×${preset.height} (export / canvas size)`}
    >
      {preset.width}×{preset.height}
    </span>
  ) : (
    <span className="shrink-0 rounded-full border border-border/80 bg-muted/70 px-2 py-0.5 text-2xs font-medium text-muted-foreground">
      Size not set
    </span>
  );

  const prevNext = (
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
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <ExportDeck />
        {sizeChip}
        {prevNext}
        <div className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ${
              moreOpen ? 'bg-muted text-foreground' : ''
            }`}
            title="More actions"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal size={15} />
          </button>
          {moreOpen &&
            createPortal(
              <div
                ref={menuRef}
                role="menu"
                aria-label="More actions"
                style={
                  placement
                    ? { position: 'fixed', top: placement.top, left: placement.left }
                    : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
                }
                className="z-[55] flex items-center gap-1 rounded-md border border-border/80 bg-popover p-1 shadow-lg"
              >
                <RoundHistory compact />
                <SlideCodeViewer />
              </div>,
              document.body,
            )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <RoundHistory />
      <ExportDeck />
      <SlideCodeViewer />
      {sizeChip}
      {prevNext}
    </div>
  );
}