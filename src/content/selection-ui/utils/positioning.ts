/**
 * Positioning utilities for selection-ui
 * Handles position calculations for toolbar and popover
 *
 * All positioning functions compute coordinates RELATIVE to the container element.
 * This makes positioning robust against ancestor elements that establish
 * unexpected CSS containing blocks (via transforms, filters, will-change, etc.).
 */

import type { SelectionPosition } from '../types.ts';
import {
  POPOVER_WIDTH,
  POPOVER_MAX_HEIGHT,
  GAP,
  FAB_SIZE,
  EXPANDED_TOOLBAR_WIDTH,
  EXPANDED_TOOLBAR_HEIGHT,
} from '../constants.ts';

const LINE_MERGE_TOLERANCE_PX = 2;

interface ViewportMetrics {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

function getViewport(): ViewportMetrics {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };
}

function clampHorizontal(
  left: number,
  chromeWidth: number,
  viewport: ViewportMetrics,
  offsetX: number
): number {
  const minLeft = viewport.scrollX + GAP - offsetX;
  const maxLeft = viewport.scrollX + viewport.width - chromeWidth - GAP - offsetX;
  return Math.max(minLeft, Math.min(left, maxLeft));
}

function copyRect(left: number, top: number, right: number, bottom: number): DOMRect {
  const width = right - left;
  const height = bottom - top;
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function mergeLineRects(rects: DOMRect[]): DOMRect[] {
  const lines: DOMRect[] = [];
  for (const r of rects) {
    const last = lines[lines.length - 1];
    const sameLine = last && Math.abs(r.top - last.top) <= LINE_MERGE_TOLERANCE_PX;
    const adjacent = last && r.left <= last.right + 8;
    if (sameLine && adjacent) {
      lines[lines.length - 1] = copyRect(
        Math.min(last.left, r.left),
        Math.min(last.top, r.top),
        Math.max(last.right, r.right),
        Math.max(last.bottom, r.bottom)
      );
    } else {
      lines.push(copyRect(r.left, r.top, r.right, r.bottom));
    }
  }
  return lines;
}

function medianWidth(rects: DOMRect[]): number {
  const widths = rects.map((r) => r.width).sort((a, b) => a - b);
  return widths[Math.floor(widths.length / 2)] ?? 0;
}

/** Drop full-width block boxes (e.g. `<li>` / markdown column) that dwarf inline text. */
function inlineClientRects(rects: DOMRect[]): DOMRect[] {
  const usable = rects.filter((r) => r.width >= 1 && r.height >= 1);
  if (usable.length === 0) return [];

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const median = medianWidth(usable);
  const maxInline = Math.max(median * 3, 80);
  const filtered = usable.filter(
    (r) => r.width <= maxInline && r.width < viewportW * 0.5
  );
  return filtered.length > 0 ? filtered : usable;
}

function caretEndRect(range: Range): DOMRect | null {
  try {
    const caretRange = range.cloneRange();
    caretRange.collapse(false);
    const c = caretRange.getBoundingClientRect();
    if (c.height > 0 || c.width > 0 || (c.top !== 0 && c.left !== 0)) {
      const height = c.height > 0 ? c.height : 16;
      const top = c.height > 0 ? c.top : c.top;
      return copyRect(c.left, top, Math.max(c.right, c.left), top + height);
    }
  } catch {
    // cloneRange can throw on detached nodes
  }
  return null;
}

/**
 * End of the last *text* line — not the union box, not a full-width block.
 */
export function getSelectionAnchorRect(range: Range): DOMRect | null {
  const caret = caretEndRect(range);
  const inline = inlineClientRects(Array.from(range.getClientRects()));
  if (inline.length > 0) {
    const lines = mergeLineRects(inline);
    const last = lines[lines.length - 1];
    if (last) {
      // Prefer caret x when it sits on the last line (true selection end).
      if (
        caret &&
        Math.abs(caret.top - last.top) <= Math.max(last.height, 16)
      ) {
        return copyRect(
          Math.min(last.left, caret.left),
          last.top,
          caret.left > last.left ? caret.left : last.right,
          last.bottom
        );
      }
      return last;
    }
  }

  if (caret && (caret.width > 0 || caret.height > 0 || caret.top !== 0)) {
    return caret;
  }

  const fallback = range.getBoundingClientRect();
  if (fallback.width === 0 && fallback.height === 0) {
    return null;
  }
  return fallback;
}

/**
 * Get the container's offset from the viewport origin.
 * When the container has position:absolute on a parent with transforms/filters,
 * its origin may not be at (0,0). This function detects that offset.
 */
export function getContainerOffset(containerElement?: HTMLElement): { offsetX: number; offsetY: number } {
  if (!containerElement) {
    return { offsetX: 0, offsetY: 0 };
  }

  const containerRect = containerElement.getBoundingClientRect();
  // The container is position:absolute at top:0, left:0
  // If the parent establishes a containing block with an offset,
  // the container's viewport position won't be at (scrollX, scrollY)
  // We compute the delta between where the container IS vs where it SHOULD be
  const offsetX = containerRect.left + window.scrollX;
  const offsetY = containerRect.top + window.scrollY;

  return { offsetX, offsetY };
}

/**
 * Collapsed FAB: sit beside the last line of the selection (right, then left,
 * then above/below) so the 40px chip does not cover highlighted text.
 */
export function calculateFabPositionFromRect(
  rect: DOMRect,
  containerElement?: HTMLElement
): SelectionPosition {
  const viewport = getViewport();
  const { offsetX, offsetY } = getContainerOffset(containerElement);

  let top = rect.top + (rect.height - FAB_SIZE) / 2 + viewport.scrollY - offsetY;
  let left = rect.right + GAP + viewport.scrollX - offsetX;
  let placement: 'top' | 'bottom' = 'bottom';

  const maxRight = viewport.scrollX + viewport.width - GAP - offsetX;
  if (left + FAB_SIZE > maxRight) {
    const leftSide = rect.left + viewport.scrollX - FAB_SIZE - GAP - offsetX;
    const minLeft = viewport.scrollX + GAP - offsetX;
    if (leftSide >= minLeft) {
      left = leftSide;
    } else {
      const spaceAbove = rect.top;
      if (spaceAbove >= FAB_SIZE + GAP) {
        top = rect.top + viewport.scrollY - FAB_SIZE - GAP - offsetY;
        placement = 'top';
      } else {
        top = rect.bottom + viewport.scrollY + GAP - offsetY;
        placement = 'bottom';
      }
      left = rect.left + viewport.scrollX + rect.width / 2 - FAB_SIZE / 2 - offsetX;
    }
  }

  left = clampHorizontal(left, FAB_SIZE, viewport, offsetX);
  return { top, left, placement };
}

export interface ChromeSize {
  width: number;
  height: number;
}

/**
 * Expanded toolbar: sit *after* the last selected line (below) so the panel
 * does not cover the highlight. Grow from the FAB horizontally when given.
 * `chrome` should be the real panel size when known (post-measure).
 */
export function calculateExpandedToolbarPositionFromRect(
  rect: DOMRect,
  containerElement?: HTMLElement,
  chrome: ChromeSize = { width: EXPANDED_TOOLBAR_WIDTH, height: EXPANDED_TOOLBAR_HEIGHT },
  fab?: SelectionPosition
): SelectionPosition {
  const viewport = getViewport();
  const { offsetX, offsetY } = getContainerOffset(containerElement);
  const { width, height } = chrome;

  const spaceAbove = rect.top;
  const spaceBelow = viewport.height - rect.bottom;

  let top: number;
  let placement: 'top' | 'bottom';

  // Prefer below the last line so selected text stays visible.
  if (spaceBelow >= height + GAP) {
    top = rect.bottom + viewport.scrollY + GAP - offsetY;
    placement = 'bottom';
  } else if (spaceAbove >= height + GAP) {
    top = rect.top + viewport.scrollY - height - GAP - offsetY;
    placement = 'top';
  } else if (spaceBelow >= spaceAbove) {
    top = rect.bottom + viewport.scrollY + GAP - offsetY;
    placement = 'bottom';
  } else {
    top = viewport.scrollY + GAP - offsetY;
    placement = 'top';
  }

  // Grow from the FAB when we have it; otherwise align to the line start.
  let left: number;
  if (fab) {
    left = fab.left;
  } else {
    left = rect.left + viewport.scrollX - offsetX;
  }

  left = clampHorizontal(left, width, viewport, offsetX);
  return { top, left, placement };
}

/**
 * Collapsed FAB position for a live Selection.
 */
export function calculateToolbarPosition(
  selection: Selection,
  containerElement?: HTMLElement
): SelectionPosition | null {
  const range = selection.getRangeAt(0);
  const rect = getSelectionAnchorRect(range);
  if (!rect) {
    return null;
  }
  return calculateFabPositionFromRect(rect, containerElement);
}

/**
 * Calculate position for toolbar from an editable element (input/textarea)
 * Used as fallback when selection range is not available
 *
 * @param element - The editable element
 * @param containerElement - The container element (used to compute relative offsets)
 */
export function calculateToolbarPositionFromElement(
  element: Element,
  containerElement?: HTMLElement
): SelectionPosition {
  return calculateFabPositionFromRect(element.getBoundingClientRect(), containerElement);
}

export function calculateExpandedToolbarPositionFromElement(
  element: Element,
  containerElement?: HTMLElement
): SelectionPosition {
  return calculateExpandedToolbarPositionFromRect(element.getBoundingClientRect(), containerElement);
}

/**
 * Calculate optimal position for result popover.
 * Coordinates are relative to the container element for robust positioning.
 *
 * @param selection - The current text selection
 * @param containerElement - The container element (used to compute relative offsets)
 * @param referenceRect - Optional rect for vertical positioning (defaults to selection rect)
 */
export function calculatePopoverPosition(
  selection: Selection,
  containerElement?: HTMLElement,
  referenceRect?: DOMRect
): SelectionPosition | null {
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  return calculatePopoverPositionFromRect(rect, containerElement, referenceRect);
}

/**
 * Calculate optimal position for result popover from a bounding rect.
 * This is the core positioning logic, independent of a live Selection object.
 * Coordinates are relative to the container element for robust positioning.
 *
 * @param rect - The bounding rect of the target (e.g., saved selection rect)
 * @param containerElement - The container element (used to compute relative offsets)
 * @param referenceRect - Optional rect for vertical positioning (defaults to `rect`)
 */
export function calculatePopoverPositionFromRect(
  rect: DOMRect,
  containerElement?: HTMLElement,
  referenceRect?: DOMRect
): SelectionPosition | null {
  if (rect.width === 0 && rect.height === 0) {
    return null;
  }

  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  const { offsetX, offsetY } = getContainerOffset(containerElement);

  // Use reference rect for vertical, fall back to rect
  const vertRef = referenceRect || rect;

  // Calculate space (viewport-relative for visibility check)
  const spaceAbove = vertRef.top;
  const spaceBelow = viewport.height - vertRef.bottom;

  let top: number;
  let placement: 'top' | 'bottom';

  // Check if popover fits above
  if (spaceAbove >= POPOVER_MAX_HEIGHT + GAP) {
    top = vertRef.top + viewport.scrollY - POPOVER_MAX_HEIGHT - GAP - offsetY;
    placement = 'top';
  } else if (spaceBelow >= POPOVER_MAX_HEIGHT + GAP) {
    // Position below
    top = vertRef.bottom + viewport.scrollY + GAP - offsetY;
    placement = 'bottom';
  } else if (spaceAbove > spaceBelow) {
    // Not enough space either way, use the larger one
    top = viewport.scrollY + GAP - offsetY;
    placement = 'top';
  } else {
    top = vertRef.bottom + viewport.scrollY + GAP - offsetY;
    placement = 'bottom';
  }

  // Position horizontally - align left with rect, but keep in viewport
  let left = rect.left + viewport.scrollX - offsetX;

  // Ensure popover doesn't overflow right edge
  const maxLeft = viewport.scrollX + viewport.width - POPOVER_WIDTH - GAP - offsetX;
  if (left > maxLeft) {
    left = maxLeft;
  }

  // Ensure doesn't overflow left edge
  left = Math.max(viewport.scrollX + GAP - offsetX, left);

  return { top, left, placement };
}

/**
 * Calculate toolbar position from a viewport point (e.g., mouse cursor coordinates).
 * Used as fallback when the selection range has no bounding rect (e.g., canvas-based editors
 * like Google Docs where getBoundingClientRect() returns a zero rect).
 */
export function calculateToolbarPositionFromPoint(
  clientX: number,
  clientY: number,
  containerElement?: HTMLElement
): SelectionPosition {
  const pointRect = copyRect(clientX, clientY, clientX, clientY);
  return calculateFabPositionFromRect(pointRect, containerElement);
}

export function calculateExpandedToolbarPositionFromPoint(
  clientX: number,
  clientY: number,
  containerElement?: HTMLElement
): SelectionPosition {
  const pointRect = copyRect(clientX, clientY, clientX, clientY);
  return calculateExpandedToolbarPositionFromRect(pointRect, containerElement);
}

/**
 * Get the editable element containing the selection
 */
export function getEditableElement(selection: Selection): Element | null {
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  let node: Node | null = range.commonAncestorContainer;

  // If text node, get parent element
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  if (!(node instanceof Element)) {
    // Try to get element from selection's anchor node as fallback
    const anchorNode = selection.anchorNode;
    if (anchorNode) {
      if (anchorNode.nodeType === Node.TEXT_NODE) {
        node = anchorNode.parentElement;
      } else if (anchorNode instanceof Element) {
        node = anchorNode;
      }
    }
  }

  if (!(node instanceof Element)) return null;

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  // Check if element itself is input/textarea
  if (tagName === 'input' || tagName === 'textarea') {
    return element;
  }

  // Check for contenteditable
  const contentEditable = element.closest('[contenteditable="true"]');
  if (contentEditable) {
    return contentEditable;
  }

  // Check if the active element is an input/textarea (for cases where
  // the selection is inside an input but range doesn't point to it)
  const activeElement = document.activeElement;
  if (activeElement) {
    const activeTag = activeElement.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea') {
      // Verify the selection is actually inside this input
      if (element.contains(activeElement) || activeElement.contains(element)) {
        return activeElement;
      }
    }
  }

  return null;
}

/**
 * Apply text to an editable element
 * Returns true if successful
 */
export function applyTextToEditable(element: Element, text: string): boolean {
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'input' || tagName === 'textarea') {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;

    // Replace selected text
    const value = input.value;
    input.value = value.substring(0, start) + text + value.substring(end);

    // Update cursor position
    const newCursorPos = start + text.length;
    input.setSelectionRange(newCursorPos, newCursorPos);

    // Trigger input event
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    return true;
  }

  // Handle contenteditable
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

    // Delete current selection
    range.deleteContents();

    // Insert new text
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);

    // Move cursor after inserted text
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);

    return true;
  }

  return false;
}

/**
 * Check if selection is within excluded elements (code blocks, etc.)
 */
export function isExcludedElement(element: Element | null): boolean {
  if (!element) return false;

  const excludedSelectors = [
    'code',
    'pre',
    '.code',
    '.code-block',
    'kbd',
    'samp',
    '.syntax-highlight',
    '[class*="language-"]',
    'script',
    'style',
    'noscript',
    'iframe',
  ];

  return excludedSelectors.some((selector) => element.closest(selector) !== null);
}
