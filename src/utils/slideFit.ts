/**
 * Fit a fixed-aspect rectangle inside a max box, with optional uniform inset.
 * Used by empty PreviewCanvas and live SlidePreview so both match the pane.
 */
export function fitBox(
  maxW: number,
  maxH: number,
  ratio: number,
  inset = 0
): { width: number; height: number } {
  let w = Math.max(maxW - inset, 0);
  let h = Math.max(maxH - inset, 0);
  if (w <= 0 || h <= 0 || !Number.isFinite(ratio) || ratio <= 0) {
    return { width: 1, height: 1 };
  }
  if (w / h > ratio) w = h * ratio;
  else h = w / ratio;
  return { width: Math.max(w, 1), height: Math.max(h, 1) };
}

/** Scale factor that maps a native canvas size into a fitted display box. */
export function fitScale(
  boxWidth: number,
  nativeWidth: number
): number {
  if (nativeWidth <= 0) return 1;
  return boxWidth / nativeWidth;
}
