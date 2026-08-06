import { useCallback, useEffect, useRef, useState } from 'react';
import { useSlideStore } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import {
  composeSlideHtml,
  rebuildDeckProjection,
} from '../../utils/slideVfs.ts';
import { SlideRenderer, type SlideRendererHandle } from './SlideRenderer.tsx';

/** How long to wait after the last deck/VFS/phase change before rendering. */
const SETTLE_DEBOUNCE_MS = 350;

/**
 * Debounced live preview of the current slide (PRD US-021). Renders the active
 * slide's composed HTML/CSS in the opaque-origin sandbox, settled so it does not
 * thrash on every intermediate `apply_patch` — it waits for the phase to stop
 * running (or a quiet settle window) before posting a `render`. On failure it
 * falls back to a graceful message instead of crashing the pane.
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

  const files = activeProject?.files ?? [];
  const deck = activeDeck ?? rebuildDeckProjection(files);
  const slide = deckSlides[currentSlideIndex];
  const preset = SLIDE_CANVAS_PRESETS[canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];

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
    <div className="relative h-full w-full min-h-0">
      <SlideRenderer
        ref={rendererRef}
        iframeClassName="h-full w-full border-0"
        aria-label="Live slide preview"
      />
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
