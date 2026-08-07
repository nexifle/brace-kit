import type { Slide } from '../../types/slides.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import {
  collectFilesTouched,
  slideTouchSymbol,
  type SlideFileTouch,
} from '../../utils/slideFilesTouched.ts';

/* ==================================================================== */
/* File change strip (PRD Amendment A.9)                                */
/* ==================================================================== */

/** Chip glyph+color for a patch op (A.9: `+` create, `~` update, `-` delete). */
function touchOpTone(op: SlideFileTouch['op']): {
  symbol: string;
  className: string;
} {
  switch (op) {
    case 'create_file':
      return { symbol: '+', className: 'bg-success/10 text-success' };
    case 'delete_file':
      return { symbol: '-', className: 'bg-destructive/10 text-destructive' };
    case 'update_file':
    default:
      return { symbol: '~', className: 'bg-primary/10 text-primary' };
  }
}

/** Map a VFS path to the deck slide index whose HTML or CSS path matches it. */
export function slideIndexForTouch(touch: SlideFileTouch, slides: Slide[]): number {
  return slides.findIndex(
    (s) => s.htmlPath === touch.path || s.cssPath === touch.path
  );
}

/**
 * File change strip (A.9): a compact horizontal row of chips (order = first
 * touch, unique paths) showing which files the agent touched in the current
 * phase run. Rendered under PhaseHeader in BOTH the wide ChatRail and narrow
 * ChatDock. Clicking a chip whose path matches a slide in the deck selects
 * that slide in the preview; non-slide paths (brief/design/theme/deck.json)
 * are inert chips. Returns null when there are no touched files this run.
 */
export function FileChangeStrip({
  onSelect,
}: {
  /** Called with the slide index when a slide-path chip is clicked (or omitted). */
  onSelect?: (index: number) => void;
}) {
  const activity = useSlideStore((s) => s.activity);
  const deckSlides = useSlideStore((s) => s.deckSlides);
  const selectSlide = useSlideStore((s) => s.selectSlide);

  const touches = collectFilesTouched(activity);
  if (touches.length === 0) return null;

  const pick = (index: number) => {
    if (onSelect) onSelect(index);
    else if (index >= 0) selectSlide(index);
  };

  return (
    <div className="flex items-start gap-1.5 px-3 py-1.5 border-b border-border/50 bg-background/60">
      <span className="mt-px shrink-0 text-2xs font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
        Files
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {touches.map((touch) => {
          const slideIndex = slideIndexForTouch(touch, deckSlides);
          const tone = touchOpTone(touch.op);
          const clickable = slideIndex >= 0;
          const chip = (
            <span
              key={touch.path}
              className={
                'group flex h-5 max-w-[210px] shrink-0 items-center gap-1 rounded-md border border-border/70 px-1.5 text-2xs font-medium transition-colors ' +
                (clickable
                  ? 'cursor-pointer hover:border-primary/50 hover:bg-muted'
                  : 'bg-muted/40 text-muted-foreground')
              }
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              title={touch.path}
              onClick={clickable ? () => pick(slideIndex) : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        pick(slideIndex);
                      }
                    }
                  : undefined
              }
            >
              <span
                className={
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px] font-semibold leading-none ' +
                  tone.className
                }
                aria-hidden
              >
                {slideTouchSymbol(touch.op)}
              </span>
              <span className="truncate font-mono text-[10.5px] text-foreground/90">
                {touch.path}
              </span>
            </span>
          );
          return chip;
        })}
      </div>
    </div>
  );
}
