import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import { composeSlideHtml, rebuildDeckProjection } from '../../utils/slideVfs.ts';
import { SlideRenderer, type SlideRendererHandle } from './SlideRenderer.tsx';

/** Wait for the deck to settle before (re)capturing thumbnails. */
const CAPTURE_DEBOUNCE_MS = 450;

/**
 * Horizontal thumbnail filmstrip for the current deck (PRD US-022). Shows one
 * thumbnail per slide at the canvas's aspect ratio; clicking one selects it via
 * the store (`selectSlide`). After the deck settles, a best-effort sequential
 * capture loop renders+captures each slide into its thumbnail; captures that fail
 * leave the numbered placeholder behind — never blocking, never crashing the pane.
 *
 * Uses its own hidden `SlideRenderer` instance so it never contends with the live
 * preview's renderer (which is busy rendering the active slide).
 */
export function SlideFilmstrip({
  onCapturingChange,
}: {
  /** Optional callback raising/lowering "thumbnails are being captured". */
  onCapturingChange?: (capturing: boolean) => void;
}) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const activeDeck = useSlideStore((s) => s.activeDeck);
  const currentSlideIndex = useSlideStore((s) => s.currentSlideIndex);
  const selectSlide = useSlideStore((s) => s.selectSlide);
  const busy = useSlideStore((s) => s.busy);
  const canvas = useSlideStore((s) => s.canvas);

  const rendererRef = useRef<SlideRendererHandle | null>(null);
  /** True while a capture loop is running (serializes renderer access). */
  const capturingRef = useRef(false);
  /** Set when a newer capture is requested while one is in flight -> re-run after. */
  const recaptureRequestedRef = useRef(false);
  /** htmlPath -> data URL (or 'pending' while being captured). */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  /** Latest onCapturingChange prop, so an in-flight capture always calls the current one. */
  const onCapturingChangeRef = useRef(onCapturingChange);
  onCapturingChangeRef.current = onCapturingChange;

  const files = activeProject?.files ?? [];
  const deck = activeDeck ?? rebuildDeckProjection(files);
  const canvasKey = canvas ?? deck.canvas;
  const preset = canvasKey ? SLIDE_CANVAS_PRESETS[canvasKey] : null;

  // Latest-state mirrors so an in-flight (or re-run) capture reads the newest
  // deck, not the render in which `captureAll` was created.
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const deckSlidesRef = useRef(deckSlides);
  deckSlidesRef.current = deckSlides;
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const presetRef = useRef(preset);
  presetRef.current = preset;
  /** Id of the project the current `thumbs` cache was captured for. */
  const lastProjectIdRef = useRef<string | null>(null);


  const commitThumbs = (patch: Record<string, string>) => {
    thumbsRef.current = { ...thumbsRef.current, ...patch };
    setThumbs(thumbsRef.current);
  };

  const captureAll = async () => {
    // A capture is already running; mark that we must re-run with the newest deck
    // after the current one finishes. Never drop the request.
    if (capturingRef.current) {
      recaptureRequestedRef.current = true;
      return;
    }
    capturingRef.current = true;
    onCapturingChangeRef.current?.(true);
    try {
      do {
        recaptureRequestedRef.current = false;
        const r = rendererRef.current;
        const proj = activeProjectRef.current;
        const slides = deckSlidesRef.current;
        const d = deckRef.current;
        const p = presetRef.current;
        // A project switch invalidates every htmlPath-keyed thumb: the new
        // deck's slides reuse the same keys (`/slides/01.html`, …) but hold
        // different content, so the skip guard below must not see the old
        // deck's captures. Checked inside the loop so an in-flight capture for
        // the old project that re-runs after the switch also clears.
        if (proj && lastProjectIdRef.current !== proj.id) {
          lastProjectIdRef.current = proj.id;
          thumbsRef.current = {};
          setThumbs({});
        }
        if (!r || !proj || !p) break;
        for (const slide of slides) {
          if (recaptureRequestedRef.current) break;
          const key = slide.htmlPath;
          // Skip only committed thumbs; a 'pending' key is either being captured
          // in this run or was abandoned by an aborted run — retry it either way.
          if (thumbsRef.current[key] && thumbsRef.current[key] !== 'pending') continue;

          try {
            commitThumbs({ [key]: 'pending' });
            const html = composeSlideHtml(proj.files, slide, d);
            await r.render(html, p.width, p.height);
            const dataUrl = await r.capture(p.width, p.height);
            if (!recaptureRequestedRef.current) commitThumbs({ [key]: dataUrl });
          } catch {
            // Best-effort: leave the numbered placeholder; never throw.
          }
        }
      } while (recaptureRequestedRef.current);
    } finally {
      capturingRef.current = false;
      onCapturingChangeRef.current?.(false);
    }
  };

  // When the deck settles (not busy) after a change, (re)capture thumbnails.
  const deckVersion = activeProject?.updatedAt ?? 0;
  useEffect(() => {
    if (!activeProject || deckSlides.length === 0) return;
    const timer = setTimeout(() => {
      if (busy) return; // wait until the build/edit settles
      void captureAll();
    }, CAPTURE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckVersion, busy, deckSlides.length, canvas]);

  // If the filmstrip unmounts (deck cleared) mid-capture, always drop the
  // parent's capturing flag so the preview chrome doesn't hang on the pill.
  useEffect(() => {
    return () => {
      onCapturingChangeRef.current?.(false);
    };
  }, []);

  if (!activeProject || deckSlides.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/70 bg-background/70 backdrop-blur-sm">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Slides
        </span>
        <div className="flex items-center gap-1">
          <span className="text-2xs tabular-nums text-muted-foreground/60">
            {currentSlideIndex + 1} / {deckSlides.length}
          </span>
          <button
            type="button"
            onClick={() => selectSlide(Math.max(currentSlideIndex - 1, 0))}
            disabled={currentSlideIndex <= 0}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            title="Previous slide (Left)"
            aria-label="Previous slide"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => selectSlide(Math.min(currentSlideIndex + 1, deckSlides.length - 1))}
            disabled={currentSlideIndex >= deckSlides.length - 1}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            title="Next slide (Right)"
            aria-label="Next slide"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div
        className="flex items-center gap-2 overflow-x-auto px-3 py-2.5"
        role="tablist"
        aria-label="Slides"
      >
        {deckSlides.map((slide, i) => {
          const active = i === currentSlideIndex;
          const thumb = thumbs[slide.htmlPath];
          const capturing = thumb === 'pending';
          return (
            <button
              key={slide.htmlPath}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`Slide ${i + 1}`}
              onClick={() => selectSlide(i)}
              className={`group relative flex w-16 shrink-0 flex-col overflow-hidden rounded-lg border transition-all duration-200 outline-none ${
                active
                  ? 'border-primary ring-2 ring-primary shadow-[0_2px_10px_-2px_var(--color-primary)/45] scale-[1.05]'
                  : 'border-border hover:border-border/80 hover:bg-muted/60'
              }`}
              style={{
                aspectRatio: preset
                  ? `${preset.width} / ${preset.height}`
                  : '16 / 9',
              }}

            >
              {active && (
                <span className="absolute inset-x-0 top-0 z-10 h-[3px] bg-primary" aria-hidden />
              )}
              {thumb && thumb !== 'pending' ? (
                <img
                  src={thumb}
                  alt={`Slide ${i + 1} preview`}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-muted/40 text-xs font-semibold text-muted-foreground/70">
                  {i + 1}
                </span>
              )}

              {capturing && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                  <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary/70" />
                </span>
              )}

              {/* index badge on captured thumbs */}
              {thumb && thumb !== 'pending' && (
                <span className="absolute bottom-0.5 left-1 rounded bg-black/55 px-1 text-[10px] font-medium text-white leading-4">
                  {i + 1}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hidden capture renderer — rendered off-screen; does not drive the live preview. */}
      <div className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
        <SlideRenderer ref={rendererRef} iframeClassName="h-0 w-0 border-0" />
      </div>
    </div>
  );
}
