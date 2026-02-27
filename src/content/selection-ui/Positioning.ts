import type { SelectionPosition } from './types.ts';
import { TOOLBAR_HEIGHT, POPOVER_WIDTH, POPOVER_MAX_HEIGHT, GAP } from './constants.ts';

/**
 * Calculate optimal position for floating toolbar
 * Returns position above selection if space available, otherwise below
 * Coordinates include scroll offset since container is absolute positioned
 */
export function calculateToolbarPosition(selection: Selection): SelectionPosition | null {
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

  // Calculate space above and below (viewport-relative for visibility check)
  const spaceAbove = rect.top;
  const spaceBelow = viewport.height - rect.bottom;

  let top: number;
  let placement: 'top' | 'bottom';

  // Prefer above, fallback to below
  if (spaceAbove >= TOOLBAR_HEIGHT + GAP) {
    top = rect.top + viewport.scrollY - TOOLBAR_HEIGHT - GAP;
    placement = 'top';
  } else if (spaceBelow >= TOOLBAR_HEIGHT + GAP) {
    top = rect.bottom + viewport.scrollY + GAP;
    placement = 'bottom';
  } else {
    // Not enough space, position at top of viewport (plus scroll)
    top = viewport.scrollY + GAP;
    placement = 'top';
  }

  // Center horizontally on selection, but keep within viewport
  const toolbarWidth = 200; // approximate
  let left = rect.left + viewport.scrollX + rect.width / 2 - toolbarWidth / 2;

  // Ensure within viewport bounds (plus scroll)
  const minLeft = viewport.scrollX + GAP;
  const maxLeft = viewport.scrollX + viewport.width - toolbarWidth - GAP;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  return { top, left, placement };
}

/**
 * Calculate optimal position for result popover
 * Coordinates include scroll offset since container is absolute positioned
 */
export function calculatePopoverPosition(
  selection: Selection,
  triggerRect?: DOMRect
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

  // Use trigger rect if provided (e.g., button position), otherwise use selection
  const referenceRect = triggerRect || rect;

  // Calculate space (viewport-relative for visibility check)
  const spaceAbove = referenceRect.top;
  const spaceBelow = viewport.height - referenceRect.bottom;

  let top: number;
  let placement: 'top' | 'bottom';

  // Check if popover fits above
  if (spaceAbove >= POPOVER_MAX_HEIGHT + GAP) {
    top = referenceRect.top + viewport.scrollY - POPOVER_MAX_HEIGHT - GAP;
    placement = 'top';
  } else if (spaceBelow >= POPOVER_MAX_HEIGHT + GAP) {
    // Position below
    top = referenceRect.bottom + viewport.scrollY + GAP;
    placement = 'bottom';
  } else if (spaceAbove > spaceBelow) {
    // Not enough space either way, use the larger one
    top = viewport.scrollY + GAP;
    placement = 'top';
  } else {
    top = referenceRect.bottom + viewport.scrollY + GAP;
    placement = 'bottom';
  }

  // Position horizontally - align left with selection, but keep in viewport
  let left = rect.left + viewport.scrollX;

  // Ensure popover doesn't overflow right edge
  const maxLeft = viewport.scrollX + viewport.width - POPOVER_WIDTH - GAP;
  if (left > maxLeft) {
    left = maxLeft;
  }

  // Ensure doesn't overflow left edge
  left = Math.max(viewport.scrollX + GAP, left);

  return { top, left, placement };
}

/**
 * Check if an element is editable (input, textarea, contentEditable)
 */
export function isEditableElement(element: Element | null): boolean {
  if (!element) return false;

  // Check for input/textarea
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') {
    return !(element as HTMLInputElement).readOnly && !(element as HTMLInputElement).disabled;
  }

  // Check for contenteditable
  const isContentEditable = element.closest('[contenteditable="true"]') !== null;
  if (isContentEditable) {
    return true;
  }

  return false;
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
