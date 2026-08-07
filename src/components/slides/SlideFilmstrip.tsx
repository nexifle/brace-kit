import { useEffect, useRef, useState } from 'react';
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
  const pendingCaptureRef = useRef(false);
  const cancelledRef = useRef(false);
  /** htmlPath -> data URL (or 'pending' while being captured). */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  /** Latest onCapturingChange prop, so an in-flight capture always calls the current one. */
  const onCapturingChangeRef = useRef(onCapturingChange);
  onCapturingChangeRef.current = onCapturingChange;

  const files = activeProject?.files ?? [];
  const deck = activeDeck ?? rebuildDeckProjection(files);
  const preset = SLIDE_CANVAS_PRESETS[canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];

  const commitThumbs = (patch: Record<string, string>) => {
    thumbsRef.current = { ...thumbsRef.current, ...patch };
    setThumbs(thumbsRef.current);
  };

  const captureAll = async () => {
    const r = rendererRef.current;
    if (!r || !activeProject || pendingCaptureRef.current) return;
    pendingCaptureRef.current = true;
    cancelledRef.current = false;
    onCapturingChangeRef.current?.(true);
    try {
      for (const slide of deckSlides) {
        if (cancelledRef.current) return;
        const key = slide.htmlPath;
        if (thumbsRef.current[key]) continue; // already captured
        if (thumbsRef.current[key] === 'pending') continue;
        const html = composeSlideHtml(activeProject.files, slide, deck);
        const w = preset.width;
        const h = preset.height;
        try {
          commitThumbs({ [key]: 'pending' });
          await r.render(html, w, h);
          const dataUrl = await r.capture(w, h);
          if (!cancelledRef.current) commitThumbs({ [key]: dataUrl });
        } catch {
          // Best-effort: leave the numbered placeholder; never throw.
        }
      }
    } finally {
      pendingCaptureRef.current = false;
      onCapturingChangeRef.current?.(false);
    }
  };

  // When the deck settles (not busy) after a change, (re)capture thumbnails.
  const deckVersion = activeProject?.updatedAt ?? 0;
  useEffect(() => {
    if (!activeProject || deckSlides.length === 0) return;
    cancelledRef.current = true; // supersede any in-flight capture
    const timer = setTimeout(() => {
      if (busy) return; // wait until the build/edit settles
      void captureAll();
    }, CAPTURE_DEBOUNCE_MS);
    return () => {
      cancelledRef.current = true;
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
        <span className="text-2xs text-muted-foreground/60">
          {deckSlides.length}
        </span>
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
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border hover:border-border/80 hover:bg-muted/60'
              }`}
              style={{ aspectRatio: `${preset.width} / ${preset.height}` }}
            >
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
