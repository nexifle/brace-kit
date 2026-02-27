/**
 * Result Popover component for selection-ui
 * Creates and manages the result popover using lit-html
 */

import { render } from 'lit-html';
import type { QuickAction, SelectionPosition } from '../types.ts';
import { popoverTemplate, overlayTemplate, type PopoverState, type PopoverCallbacks } from '../templates/index.ts';

// === Types ===

export interface ResultPopoverConfig {
  position: SelectionPosition;
  action: QuickAction['id'];
  isEditable: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  onApply: () => void;
  onClose: () => void;
}

export interface ResultPopoverAPI {
  element: HTMLElement;
  setContent: (content: string) => void;
  getContent: () => string;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string) => void;
  destroy: () => void;
}

// === Factory Function ===

/**
 * Create and render the result popover using lit-html
 */
export function createResultPopover(
  shadow: ShadowRoot,
  config: ResultPopoverConfig
): ResultPopoverAPI {
  const { position, action, isEditable, onRegenerate, onCopy, onApply, onClose } = config;

  // Create containers
  const overlayContainer = document.createElement('div');
  overlayContainer.className = 'bk-popover-overlay-container';
  shadow.appendChild(overlayContainer);

  const popoverContainer = document.createElement('div');
  popoverContainer.className = 'bk-popover-container';
  shadow.appendChild(popoverContainer);

  // State
  let state: PopoverState = {
    action,
    position,
    isEditable,
    viewState: { type: 'loading' },
    copyButtonText: 'Copy',
    isCopied: false,
  };

  // Store current content
  let currentContent = '';

  // === Drag Configuration ===
  const DRAG_THRESHOLD = 3; // pixels before drag starts
  const VIEWPORT_MARGIN = 8; // pixels from viewport edge
  const DEFAULT_POPOVER_WIDTH = 380;
  const DEFAULT_POPOVER_HEIGHT = 440;

  // === Drag State ===
  let isDragging = false;
  let positionOnDragStart = { top: 0, left: 0 };
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  // Cached popover element reference for performance
  let cachedPopoverEl: HTMLElement | null = null;

  // === Drag Helper Functions ===
  function getPopoverElement(): HTMLElement | null {
    if (!cachedPopoverEl || !cachedPopoverEl.isConnected) {
      cachedPopoverEl = popoverContainer.querySelector('.bk-popover') as HTMLElement | null;
    }
    return cachedPopoverEl;
  }

  function clampToViewport(top: number, left: number): { top: number; left: number } {
    const popover = getPopoverElement();
    const popoverWidth = popover?.offsetWidth || DEFAULT_POPOVER_WIDTH;
    const popoverHeight = popover?.offsetHeight || DEFAULT_POPOVER_HEIGHT;

    const minTop = window.scrollY + VIEWPORT_MARGIN;
    const maxTop = window.scrollY + window.innerHeight - popoverHeight - VIEWPORT_MARGIN;
    const minLeft = window.scrollX + VIEWPORT_MARGIN;
    const maxLeft = window.scrollX + window.innerWidth - popoverWidth - VIEWPORT_MARGIN;

    // Handle edge case: viewport smaller than popover
    // In this case, center the popover in the available space
    if (maxTop < minTop) {
      top = (minTop + maxTop) / 2;
    } else {
      top = Math.max(minTop, Math.min(top, maxTop));
    }

    if (maxLeft < minLeft) {
      left = (minLeft + maxLeft) / 2;
    } else {
      left = Math.max(minLeft, Math.min(left, maxLeft));
    }

    return { top, left };
  }

  function startDrag(clientX: number, clientY: number) {
    dragStartClientX = clientX;
    dragStartClientY = clientY;
    positionOnDragStart = { top: state.position.top, left: state.position.left };
    isDragging = false; // Will be set to true after threshold
  }

  function updateDrag(clientX: number, clientY: number) {
    const deltaX = clientX - dragStartClientX;
    const deltaY = clientY - dragStartClientY;

    // Check drag threshold
    if (!isDragging) {
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      if (distance < DRAG_THRESHOLD) {
        return;
      }
      isDragging = true;

      // Add dragging class for visual feedback
      const popover = getPopoverElement();
      if (popover) {
        popover.classList.add('bk-dragging');
      }
    }

    // Calculate and clamp new position
    const newTop = positionOnDragStart.top + deltaY;
    const newLeft = positionOnDragStart.left + deltaX;
    const clamped = clampToViewport(newTop, newLeft);

    // Update state with new position
    state = {
      ...state,
      position: { ...state.position, top: clamped.top, left: clamped.left }
    };
    renderPopover();
  }

  function endDrag() {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchmove', handleTouchMove, { capture: true } as AddEventListenerOptions);
    document.removeEventListener('touchend', handleTouchEnd);

    if (isDragging) {
      isDragging = false;

      // Remove dragging class
      const popover = getPopoverElement();
      if (popover) {
        popover.classList.remove('bk-dragging');
      }
    }
  }

  // === Mouse Event Handlers ===
  function handleMouseDown(e: MouseEvent) {
    // Only handle left-click
    if (e.button !== 0) return;

    // Don't drag if clicking on close button or other interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('.bk-popover-close, button, input, select, textarea')) {
      return;
    }

    e.preventDefault();
    startDrag(e.clientX, e.clientY);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    updateDrag(e.clientX, e.clientY);
  }

  function handleMouseUp() {
    endDrag();
  }

  // === Touch Event Handlers ===
  function handleTouchStart(e: TouchEvent) {
    // Don't drag if clicking on close button or other interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('.bk-popover-close, button, input, select, textarea')) {
      return;
    }

    const touch = e.touches[0];
    if (!touch) return;

    // Don't prevent default here - let the threshold check happen first
    startDrag(touch.clientX, touch.clientY);

    // Use capture phase to ensure we get the event before other handlers
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', handleTouchEnd);
  }

  function handleTouchMove(e: TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;

    // Check threshold before preventing default
    const deltaX = touch.clientX - dragStartClientX;
    const deltaY = touch.clientY - dragStartClientY;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    // Only prevent default after threshold is exceeded (actual drag)
    if (isDragging || distance >= DRAG_THRESHOLD) {
      e.preventDefault();
    }

    updateDrag(touch.clientX, touch.clientY);
  }

  function handleTouchEnd() {
    endDrag();
  }

  // === Setup Drag Handlers ===
  function setupDragHandlers() {
    const header = popoverContainer.querySelector('.bk-popover-header') as HTMLElement | null;
    if (header) {
      // Remove any existing listeners first
      header.removeEventListener('mousedown', handleMouseDown as EventListener);
      header.removeEventListener('touchstart', handleTouchStart as EventListener);

      // Add mouse and touch listeners
      header.addEventListener('mousedown', handleMouseDown as EventListener);
      header.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    }
  }

  // Render function
  function renderPopover() {
    render(popoverTemplate(state, callbacks), popoverContainer);
    setupDragHandlers();
  }

  // Render overlay
  function renderOverlay() {
    render(overlayTemplate(handleOverlayClick), overlayContainer);
  }

  // Callbacks
  const callbacks: PopoverCallbacks = {
    onClose: () => {
      destroy();
      onClose();
    },

    onRegenerate: () => {
      onRegenerate();
    },

    onCopy: async () => {
      await onCopy();
      // Update button state temporarily
      state = { ...state, copyButtonText: 'Copied', isCopied: true };
      renderPopover();
      setTimeout(() => {
        state = { ...state, copyButtonText: 'Copy', isCopied: false };
        renderPopover();
      }, 2000);
    },

    onApply: () => {
      onApply();
    },
  };

  // Overlay click handler
  const handleOverlayClick = (e: Event) => {
    // Only close if clicking on overlay itself
    if (e.target === overlayContainer.firstElementChild) {
      destroy();
      onClose();
    }
  };

  // Escape key handler
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      destroy();
      onClose();
    }
  };

  // Destroy function
  function destroy() {
    // Clean up drag listeners (mouse)
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // Clean up drag listeners (touch)
    document.removeEventListener('touchmove', handleTouchMove, { capture: true } as AddEventListenerOptions);
    document.removeEventListener('touchend', handleTouchEnd);

    const header = popoverContainer.querySelector('.bk-popover-header');
    if (header) {
      header.removeEventListener('mousedown', handleMouseDown as EventListener);
      header.removeEventListener('touchstart', handleTouchStart as EventListener);
    }

    document.removeEventListener('keydown', handleEscape);
    if (overlayContainer.parentNode) {
      overlayContainer.remove();
    }
    if (popoverContainer.parentNode) {
      popoverContainer.remove();
    }
  }

  // Attach escape listener
  document.addEventListener('keydown', handleEscape);

  // Initial render
  renderOverlay();
  renderPopover();

  return {
    element: popoverContainer,
    setContent: (content: string) => {
      currentContent = content;
      state = {
        ...state,
        viewState: { type: 'content', content },
        isCopied: false,
        copyButtonText: 'Copy',
      };
      renderPopover();
    },
    getContent: () => currentContent,
    setLoading: (isLoading: boolean) => {
      if (isLoading) {
        currentContent = '';
        state = {
          ...state,
          viewState: { type: 'loading' },
          isCopied: false,
          copyButtonText: 'Copy',
        };
      }
      // When setting loading to false without content, keep previous state
      // This is handled by setContent or setError
      renderPopover();
    },
    setError: (error: string) => {
      currentContent = '';
      state = {
        ...state,
        viewState: { type: 'error', message: error },
        isCopied: false,
        copyButtonText: 'Copy',
      };
      renderPopover();
    },
    destroy,
  };
}
