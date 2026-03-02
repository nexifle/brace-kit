/**
 * Selection Manager for selection-ui
 * Main orchestrator that coordinates all selection UI components
 */

import type { QuickAction, SelectionPosition } from '../types.ts';
import { getAIService, type AIService } from '../services/AIService.ts';
import {
  getSettingsService,
  type SelectionSettings,
  type SettingsService,
} from '../services/SettingsService.ts';
import {
  detectPageTheme,
  createShadowContainer,
  removeShadowContainer,
  getSelectionUIStyles,
  calculateToolbarPosition,
  calculateToolbarPositionFromElement,
  getEditableElement,
  applyTextToEditable,
  isExcludedElement,
  onContextInvalidated,
  isChromeRuntimeAvailable,
  type ShadowContainer,
  logger,
} from '../utils/index.ts';
import { createFloatingToolbar, removeFloatingToolbar } from '../components/FloatingToolbar.ts';
import { createResultPopover } from '../components/ResultPopover.ts';

// === State ===

interface ManagerState {
  isInitialized: boolean;
  shadowContainer: ShadowContainer | null;
  currentSelection: string;
  currentEditableElement: Element | null;
  currentRequestId: string | null;
  isActionInProgress: boolean;
  contextCleanup: (() => void) | null;
}

// === Selection Manager ===

export interface SelectionManager {
  init(): Promise<void>;
  destroy(): void;
  cleanup(): void;
  forceCleanup(): void;
  updateSettings(partial: Partial<SelectionSettings>): void;
  isActive(): boolean;
}

export function createSelectionManager(): SelectionManager {
  const settingsService: SettingsService = getSettingsService();
  const aiService: AIService = getAIService();

  const state: ManagerState = {
    isInitialized: false,
    shadowContainer: null,
    currentSelection: '',
    currentEditableElement: null,
    currentRequestId: null,
    isActionInProgress: false,
    contextCleanup: null,
  };

  // === Event Handlers ===

  function handleMouseUp(e: MouseEvent): void {
    if (state.isActionInProgress) return;

    const target = e.target as HTMLElement;
    if (target.closest?.('#bracekit-selection-ui')) return;

    // Small delay to let selection finalize
    setTimeout(() => processSelection(), 10);
  }

  function handleVisibilityChange(): void {
    if (document.hidden) cleanup();
  }

  function handleSettingsChange(newSettings: SelectionSettings): void {
    if (!newSettings.enabled) cleanup();
  }

  // === Selection Processing ===

  function processSelection(): void {
    const settings = settingsService.getSettings();
    if (!settings.enabled || state.isActionInProgress) return;

    // Try to get selection from window.getSelection()
    const selection = window.getSelection();
    let text = selection?.toString().trim() || '';

    // If no text from window.getSelection(), try to get from active input/textarea
    const activeElement = document.activeElement;
    if (!text && activeElement) {
      const tagName = activeElement.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') {
        const input = activeElement as HTMLInputElement | HTMLTextAreaElement;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (start !== null && end !== null && start !== end) {
          text = input.value.substring(start, end).trim();
        }
      }
    }

    if (!selection || selection.rangeCount === 0) {
      cleanup();
      return;
    }

    if (text.length < settings.minLength) {
      cleanup();
      return;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const element = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : (container as Element);

    // Check if we're in an editable element first
    const editableElement = getEditableElement(selection);

    // Only check excluded elements if not in an editable element
    if (!editableElement && element && isExcludedElement(element)) {
      cleanup();
      return;
    }

    // Store selection info
    state.currentSelection = text;
    state.currentEditableElement = editableElement;

    showToolbar(selection);
  }

  // === UI Management ===

  function showToolbar(selection: Selection | null): void {
    // Save selection BEFORE cleanup resets it
    const textToSave = state.currentSelection;
    const editableToSave = state.currentEditableElement;

    cleanup();

    // Create shadow container first so we can pass it to positioning functions
    state.shadowContainer = createShadowContainer();
    if (!state.shadowContainer) return;

    const containerEl = state.shadowContainer.container;

    // Calculate position relative to the container
    let position: SelectionPosition | null = null;
    // Save the selection rect at the SAME TIME as toolbar position calculation,
    // so both see identical DOM state. This is critical for multi-element selections.
    let savedSelectionRect: DOMRect | null = null;

    if (selection && selection.rangeCount > 0) {
      position = calculateToolbarPosition(selection, containerEl);

      // For multi-element selections (heading + paragraph), getBoundingClientRect()
      // returns the union rect which can be very tall and imprecise.
      // Use getClientRects() to get a more precise anchor point.
      const range = selection.getRangeAt(0);
      const clientRects = range.getClientRects();
      if (clientRects.length > 0) {
        // Use the first client rect as the anchor — this is the start of the selection
        savedSelectionRect = clientRects[0];
      } else {
        savedSelectionRect = range.getBoundingClientRect();
      }
    }

    // Fallback: if position is null but we have an editable element, use element position
    if (!position && editableToSave) {
      position = calculateToolbarPositionFromElement(editableToSave, containerEl);
      savedSelectionRect = editableToSave.getBoundingClientRect();
    }

    if (!position) {
      // No valid position, remove the container
      removeShadowContainer();
      state.shadowContainer = null;
      return;
    }

    const theme = detectPageTheme();
    state.shadowContainer.styleElement.textContent = getSelectionUIStyles(theme);

    // Store local references to avoid closure issues
    const localShadow = state.shadowContainer;
    const localSelection = textToSave;
    const localEditable = editableToSave;
    // Capture the toolbar position — this is KNOWN to be correct and serves as
    // the most reliable reference for popover positioning
    const toolbarPosition = position;

    createFloatingToolbar(localShadow.shadow, {
      position,
      onActionClick: (action, targetLang) => {
        state.isActionInProgress = true;
        handleActionClick(action, targetLang, localShadow, localSelection, localEditable, savedSelectionRect, toolbarPosition);
      },
      onDismiss: cleanup,
    });
  }

  function handleActionClick(
    action: QuickAction['id'],
    targetLang: string | undefined,
    localShadow: ShadowContainer,
    localSelection: string,
    localEditable: Element | null,
    _savedSelectionRect: DOMRect | null,
    toolbarPosition: SelectionPosition
  ): void {
    // Remove toolbar only
    removeFloatingToolbar(localShadow.shadow);

    // Use the toolbar's known-correct position to derive the popover position.
    // The toolbar is ALWAYS positioned correctly near the selection, regardless
    // of how many elements are selected. Using the toolbar position directly
    // eliminates all edge cases with multi-element selections where
    // getClientRects() / getBoundingClientRect() return unreliable coordinates.
    const position: SelectionPosition = {
      top: toolbarPosition.top,
      left: toolbarPosition.left,
      placement: toolbarPosition.placement,
    };

    const isEditable = localEditable !== null;

    try {
      const popover = createResultPopover(localShadow.shadow, {
        position,
        action,
        isEditable,
        onBack: () => {
          // Cancel any in-flight AI request by invalidating the request ID
          state.currentRequestId = null;
          state.isActionInProgress = false;
          // Re-create toolbar in expanded state at the same position
          createFloatingToolbar(localShadow.shadow, {
            position: toolbarPosition,
            onActionClick: (nextAction, nextTargetLang) => {
              state.isActionInProgress = true;
              handleActionClick(nextAction, nextTargetLang, localShadow, localSelection, localEditable, _savedSelectionRect, toolbarPosition);
            },
            onDismiss: cleanup,
            initiallyExpanded: true,
          });
        },
        onRegenerate: () => {
          executeQuickAction(action, targetLang, localSelection, popover);
        },
        onCopy: async () => {
          try {
            const content = popover.getContent();
            if (content) {
              await navigator.clipboard.writeText(content);
            }
          } catch (error) {
            logger.warn('Failed to copy to clipboard', error);
          }
        },
        onApply: () => {
          if (localEditable) {
            const content = popover.getContent();
            if (content) {
              applyTextToEditable(localEditable, content);
            }
          }
        },
        onClose: () => {
          state.isActionInProgress = false;
          forceCleanup();
        },
      });

      executeQuickAction(action, targetLang, localSelection, popover);
    } catch (error) {
      logger.error('Failed to create popover', error);
      state.isActionInProgress = false;
      forceCleanup();
    }
  }

  async function executeQuickAction(
    action: QuickAction['id'],
    targetLang: string | undefined,
    text: string,
    popover: {
      setContent: (content: string) => void;
      getContent: () => string;
      setLoading: (isLoading: boolean) => void;
      setError: (error: string) => void;
    }
  ): Promise<void> {
    const requestId = `quick_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    state.currentRequestId = requestId;

    popover.setLoading(true);

    try {
      const response = await aiService.execute({
        action,
        text,
        targetLang,
        requestId,
      });

      // Check if request was superseded
      if (state.currentRequestId !== requestId) return;

      if (response.error) {
        popover.setError(response.error);
      } else if (response.content) {
        popover.setContent(response.content);
      }
    } catch (error) {
      logger.error('Quick action failed', error);
      if (state.currentRequestId === requestId) {
        popover.setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      if (state.currentRequestId === requestId) {
        state.currentRequestId = null;
      }
    }
  }

  // === Lifecycle ===

  async function init(): Promise<void> {
    if (state.isInitialized) return;

    // Check if extension context is valid
    if (!isChromeRuntimeAvailable()) {
      logger.warn('Extension context not available, skipping initialization');
      return;
    }

    // Load settings first before attaching event listeners
    await settingsService.loadSettings();

    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('beforeunload', forceCleanup);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Subscribe to settings changes
    settingsService.subscribe(handleSettingsChange);

    // Setup context invalidation listener
    state.contextCleanup = onContextInvalidated(() => {
      logger.info('Extension context invalidated, cleaning up');
      forceCleanup();
    });

    state.isInitialized = true;
  }

  function destroy(): void {
    if (!state.isInitialized) return;

    document.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('beforeunload', forceCleanup);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup context invalidation listener
    if (state.contextCleanup) {
      state.contextCleanup();
      state.contextCleanup = null;
    }

    forceCleanup();
    state.isInitialized = false;
  }

  function cleanup(): void {
    resetState(false);
  }

  function forceCleanup(): void {
    resetState(true);
  }

  /**
   * Reset state - extracted to avoid duplication
   * @param force - if true, reset even when action is in progress
   */
  function resetState(force: boolean): void {
    if (!force && state.isActionInProgress) return;
    removeShadowContainer();
    state.shadowContainer = null;
    state.currentSelection = '';
    state.currentEditableElement = null;
    state.currentRequestId = null;
    if (force) state.isActionInProgress = false;
  }

  function updateSettings(partial: Partial<SelectionSettings>): void {
    settingsService.updateSettings(partial);
  }

  function isActive(): boolean {
    return state.shadowContainer !== null;
  }

  return {
    init,
    destroy,
    cleanup,
    forceCleanup,
    updateSettings,
    isActive,
  };
}

// === Singleton Instance ===

let managerInstance: SelectionManager | null = null;

export function getSelectionManager(): SelectionManager {
  if (!managerInstance) {
    managerInstance = createSelectionManager();
  }
  return managerInstance;
}

export function resetSelectionManager(): void {
  if (managerInstance) {
    managerInstance.destroy();
    managerInstance = null;
  }
}
