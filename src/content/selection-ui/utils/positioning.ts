/**
 * Positioning utilities for selection-ui
 * Handles position calculations for toolbar and popover
 *
 * All positioning functions compute coordinates RELATIVE to the container element.
 * This makes positioning robust against ancestor elements that establish
 * unexpected CSS containing blocks (via transforms, filters, will-change, etc.).
 */

import type { SelectionPosition } from '../types.ts';
import { TOOLBAR_HEIGHT, TOOLBAR_WIDTH, POPOVER_WIDTH, POPOVER_MAX_HEIGHT, GAP } from '../constants.ts';

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
 * Calculate optimal position for floating toolbar
 * Returns position above selection if space available, otherwise below
 * Coordinates are relative to the container element for robust positioning
 *
 * @param selection - The current text selection
 * @param containerElement - The container element (used to compute relative offsets)
 */
export function calculateToolbarPosition(
  selection: Selection,
  containerElement?: HTMLElement
): SelectionPosition | null {
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

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

  // Calculate space above and below (viewport-relative for visibility check)
  const spaceAbove = rect.top;
  const spaceBelow = viewport.height - rect.bottom;

  let top: number;
  let placement: 'top' | 'bottom';

  // Prefer above, fallback to below
  if (spaceAbove >= TOOLBAR_HEIGHT + GAP) {
    top = rect.top + viewport.scrollY - TOOLBAR_HEIGHT - GAP - offsetY;
    placement = 'top';
  } else if (spaceBelow >= TOOLBAR_HEIGHT + GAP) {
    top = rect.bottom + viewport.scrollY + GAP - offsetY;
    placement = 'bottom';
  } else {
    // Not enough space, position at top of viewport (plus scroll)
    top = viewport.scrollY + GAP - offsetY;
    placement = 'top';
  }

  // Center horizontally on selection, but keep within viewport
  let left = rect.left + viewport.scrollX + rect.width / 2 - TOOLBAR_WIDTH / 2 - offsetX;

  // Ensure within viewport bounds (relative to container)
  const minLeft = viewport.scrollX + GAP - offsetX;
  const maxLeft = viewport.scrollX + viewport.width - TOOLBAR_WIDTH - GAP - offsetX;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  return { top, left, placement };
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
  const rect = element.getBoundingClientRect();
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  const { offsetX, offsetY } = getContainerOffset(containerElement);

  // Position above or below the element
  const spaceAbove = rect.top;
  let top: number;
  let placement: 'top' | 'bottom';

  if (spaceAbove >= TOOLBAR_HEIGHT + GAP) {
    top = rect.top + viewport.scrollY - TOOLBAR_HEIGHT - GAP - offsetY;
    placement = 'top';
  } else {
    top = rect.bottom + viewport.scrollY + GAP - offsetY;
    placement = 'bottom';
  }

  // Center horizontally
  let left = rect.left + viewport.scrollX + rect.width / 2 - TOOLBAR_WIDTH / 2 - offsetX;
  const minLeft = viewport.scrollX + GAP - offsetX;
  const maxLeft = viewport.scrollX + viewport.width - TOOLBAR_WIDTH - GAP - offsetX;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  return { top, left, placement };
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
