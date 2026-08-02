/**
 * Popover placement helpers — shared by the settings ProviderSelect and the
 * chat composer selects (ComboPopover). Pure math, unit-tested.
 */

/** Minimum usable popover height before we flip to the other side */
export const POPOVER_MIN_HEIGHT = 260;
export const POPOVER_GAP = 8;

export interface PopoverPlacement {
  /** top edge of the popover (viewport coords) — used when opening below */
  top: number;
  /** bottom edge of the popover (viewport coords) — used when flipping above */
  bottom: number;
  maxHeight: number;
  flipAbove: boolean;
}

/**
 * Compute the popover position for a given trigger rect and viewport height.
 * Prefers opening below; flips above when there is more room; if neither side
 * fits, picks the side with more space. The height is always clamped so the
 * footer action stays on screen, even on very small displays.
 *
 * When flipped above, the popover is anchored by its BOTTOM edge at the
 * trigger's top (and grows upward) so the trigger is never covered and a
 * short popover hugs the trigger instead of floating at the viewport top.
 */
export function computePopoverPlacement(
  rect: { top: number; bottom: number },
  viewportHeight: number,
  gap = POPOVER_GAP,
  minHeight = POPOVER_MIN_HEIGHT
): PopoverPlacement {
  const availBelow = viewportHeight - rect.bottom - gap;
  const availAbove = rect.top - gap;

  // Plenty of room below — grow downward from the trigger's bottom edge.
  if (availBelow >= minHeight) {
    const top = rect.bottom + gap;
    const maxHeight = Math.min(availBelow, viewportHeight - top - gap);
    return { top, bottom: top + maxHeight, maxHeight, flipAbove: false };
  }

  // Plenty of room above — anchor the bottom edge at the trigger's top.
  // Keep a breathing gap at the viewport top so the popover never touches it.
  if (availAbove >= minHeight) {
    const bottom = Math.min(rect.top - gap, viewportHeight - gap);
    const maxHeight = Math.min(availAbove, viewportHeight - gap, bottom - gap);
    return { top: bottom - maxHeight, bottom, maxHeight, flipAbove: true };
  }

  // Neither side fits — pick the side with more room and fill as much of it
  // as possible without leaving the viewport.
  if (availAbove > availBelow) {
    const bottom = Math.min(rect.top - gap, viewportHeight - gap);
    const maxHeight = Math.min(Math.max(120, availAbove), viewportHeight - gap, bottom - gap);
    return { top: Math.max(gap, bottom - maxHeight), bottom, maxHeight, flipAbove: true };
  }

  const top = rect.bottom + gap;
  const maxHeight = Math.min(Math.max(120, availBelow), viewportHeight - top - gap);
  return { top, bottom: top + maxHeight, maxHeight, flipAbove: false };
}
