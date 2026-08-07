import { useCallback, useEffect, useRef, useState } from 'react';
import { useElementSize } from '../../hooks/index.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import { fitBox, fitScale } from '../../utils/slideFit.ts';
import {
  composeSlideHtml,
  rebuildDeckProjection,
} from '../../utils/slideVfs.ts';
import { SlideRenderer, type SlideRendererHandle } from './SlideRenderer.tsx';

/** How long to wait after the last deck/VFS/phase change before rendering. */
const SETTLE_DEBOUNCE_MS = 350;

/** Padding around the fitted slide so it breathes inside the pane (matches empty canvas). */
const FIT_INSET_PX = 56;

/**
 * Debounced live preview of the current slide (PRD US-021). Renders the active
 * slide's composed HTML/CSS in the opaque-origin sandbox at native canvas
 * resolution, then CSS-scales the stage into the available content area so
 * tab and sidebar modes both show the full slide (not a clipped top-left crop).
 */
export function SlidePreview() {
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const activeDeck = useSlideStore((s) => s.activeDeck);
  const currentSlideIndex = useSlideStore((s) => s.currentSlideIndex);
  const canvas = useSlideStore((s) => s.canvas);
  const busy = useSlideStore((s) => s.busy);

  const rendererRef = useRef<SlideRendererHandle | null>(null);
  const pendingRenderRef = useRef(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  /** The last successfully rendered slide, so a transient failure keeps the last frame. */
  const lastRenderedRef = useRef<{ key: string; html: string; w: number; h: number } | null>(null);
  const lastRenderedKeyRef = useRef<string | null>(null);

  const { ref: sizeRef, width: paneW, height: paneH } = useElementSize<HTMLDivElement>();

  const files = activeProject?.files ?? [];
  const deck = activeDeck ?? rebuildDeckProjection(files);
  const slide = deckSlides[currentSlideIndex];
  const preset = SLIDE_CANVAS_PRESETS[canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];
  const ratio = preset.width / preset.height;
  const box = fitBox(paneW, paneH, ratio, FIT_INSET_PX);
  const scale = fitScale(box.width, preset.width);

  const doRender = useCallback(async () => {
    pendingRenderRef.current = false;
    const r = rendererRef.current;
    if (!r || !slide || !activeProject) return;
    const w = preset.width;
    const h = preset.height;
    const html = composeSlideHtml(activeProject.files, slide, deck);
    const key = `${activeProject.updatedAt}:${slide.htmlPath}:${deck.theme ?? ''}:${deck.canvas}`;
    try {
      await r.render(html, w, h);
      lastRenderedKeyRef.current = key;
      lastRenderedRef.current = { key, html, w, h };
      setRenderError(null);
    } catch (err) {
      // Keep the last good frame; surface a subtle hint only.
      setRenderError(err instanceof Error ? err.message : String(err));
    }
  }, [activeProject, slide, deck, preset.width, preset.height]);

  // Debounced render: wait for settle/debounce, skip duplicate keys (frame stays).
  useEffect(() => {
    if (!activeProject || !slide) return;
    const timer = setTimeout(doRender, SETTLE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [activeProject, slide, doRender]);

  // While a phase is running, re-render the latest composed HTML (so the preview
  // tracks build/edit progress) — but not so often it thrashes the sandbox.
  useEffect(() => {
    if (!busy) return;
    if (!activeProject || !slide) return;
    if (pendingRenderRef.current) return;
    const timer = setTimeout(() => {
      pendingRenderRef.current = true;
      doRender();
    }, SETTLE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [busy, activeProject, slide, doRender]);

  const showEmpty = !activeProject || deckSlides.length === 0;
  const showFallback = !showEmpty && !slide;

  return (
    <div
      ref={sizeRef}
      className="relative flex h-full w-full min-h-0 items-center justify-center overflow-hidden"
    >
      {/* Soft ambient wash (matches empty PreviewCanvas). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 42%, color-mix(in oklch, var(--color-primary) 9%, transparent), transparent 70%)',
        }}
      />

      {/*
        Fitted viewport: display size follows the pane; iframe stage stays at
        native canvas px and is CSS-scaled so layout/export capture remain full-res.
      */}
      <div
        className="relative overflow-hidden rounded-xl border border-border bg-background shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]"
        style={{ width: box.width, height: box.height }}
      >
        <SlideRenderer
          ref={rendererRef}
          className="block origin-top-left"
          style={{
            width: preset.width,
            height: preset.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
          iframeClassName="block h-full w-full border-0"
          aria-label="Live slide preview"
        />
      </div>

      {showEmpty && <EmptyDeckNotice />}
      {showFallback && <PreviewFallback />}
      {renderError && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border border-border bg-background/95 px-2.5 py-1 text-2xs text-muted-foreground shadow-sm animate-in fade-in duration-200">
          Preview unavailable — {renderError}
        </div>
      )}
    </div>
  );
}

function EmptyDeckNotice() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="text-xs text-muted-foreground">Your slides will render here</p>
    </div>
  );
}

function PreviewFallback() {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <p className="text-xs text-muted-foreground">Nothing to preview yet</p>
    </div>
  );
}
