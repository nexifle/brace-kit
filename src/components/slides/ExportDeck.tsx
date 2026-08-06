import { useCallback, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '../ui/index.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS } from '../../types/index.ts';
import { composeSlideHtml, rebuildDeckProjection } from '../../utils/slideVfs.ts';
import { buildZip, dataUrlToBytes, slugify, type ZipEntry } from '../../utils/zipWriter.ts';
import { SlideRenderer, type SlideRendererHandle } from './SlideRenderer.tsx';

/** Best-effort export of the whole deck as a PNG zip (PRD US-020/FR-20).
 *
 * Available whenever the deck has ≥1 slide and no agent phase is busy. Runs its OWN
 * hidden `SlideRenderer` (never the live preview's, which is rendering the active
 * slide) to sequentially render + capture each slide at the deck canvas size,
 * packs the PNGs into a STORED-method zip, and triggers a browser download. A slide
 * whose capture fails is skipped and reported; the rest still export.
 */
export function ExportDeck() {
  const activeProject = useSlideStore((s) => s.activeProject);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const activeDeck = useSlideStore((s) => s.activeDeck);
  const canvas = useSlideStore((s) => s.canvas);
  const busy = useSlideStore((s) => s.busy);

  const rendererRef = useRef<SlideRendererHandle | null>(null);
  const exportingRef = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const { success, error, warning } = useToast();

  const files = activeProject?.files ?? [];
  const deck = activeDeck ?? rebuildDeckProjection(files);
  const preset = SLIDE_CANVAS_PRESETS[canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];
  const disabled = exporting || busy || deckSlides.length === 0;

  const onExport = useCallback(async () => {
    const r = rendererRef.current;
    if (!r || !activeProject || exportingRef.current || deckSlides.length === 0) return;
    exportingRef.current = true;
    setExporting(true);

    const w = preset.width;
    const h = preset.height;
    // Stable 2-digit prefix + slugified deck title, e.g. 01-my-deck.png
    const base = slugify(deck.title) || 'slides';
    const entries: ZipEntry[] = [];
    const failed: number[] = [];

    try {
      for (let i = 0; i < deckSlides.length; i++) {
        const slide = deckSlides[i];
        setProgress({ done: i, total: deckSlides.length });
        try {
          const html = composeSlideHtml(activeProject.files, slide, deck);
          await r.render(html, w, h);
          const dataUrl = await r.capture(w, h);
          const { data } = dataUrlToBytes(dataUrl);
          entries.push({ name: `${String(i + 1).padStart(2, '0')}-${base}.png`, data });
        } catch {
          failed.push(i + 1); // surface which slides failed; keep exporting the rest
        }
      }

      const zip = buildZip(entries);
      if (zip.length > 0) {
        const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        if (failed.length === 0) {
          success(`Exported ${entries.length} PNG${entries.length > 1 ? 's' : ''}`);
        } else {
          warning(
            `Exported ${entries.length}/${deckSlides.length} — slide${failed.length > 1 ? 's' : ''} ${failed.join(', ')} failed`
          );
        }
      } else if (failed.length === deckSlides.length) {
        error('Export failed — no slides could be captured');
      }
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }, [activeProject, deckSlides, deck, preset.width, preset.height, success, warning, error]);

  return (
    <>
      <button
        type="button"
        onClick={() => void onExport()}
        disabled={disabled}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
        title={exporting ? `Exporting… ${progress.done}/${progress.total}` : 'Export deck as PNGs (zip)'}
        aria-label="Export deck as PNGs (zip)"
      >
        {exporting ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Download size={15} />
        )}
      </button>
      {/* Hidden capture renderer — off-screen; never contends with the live preview. */}
      <div className="pointer-events-none absolute -left-[9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
        <SlideRenderer ref={rendererRef} iframeClassName="h-0 w-0 border-0" />
      </div>
    </>
  );
}
