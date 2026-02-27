import type { QuickAction, SelectionPosition } from './types.ts';
import { QUICK_ACTIONS, DEFAULT_MIN_SELECTION_LENGTH, STORAGE_KEYS } from './constants.ts';
import { detectPageTheme } from './ThemeDetector.ts';
import {
  createShadowContainer,
  removeShadowContainer,
  getSelectionUIStyles,
} from './ShadowContainer.ts';
import {
  calculateToolbarPosition,
  calculatePopoverPosition,
  getEditableElement,
  applyTextToEditable,
  isExcludedElement,
} from './Positioning.ts';
import { createFloatingToolbar, removeFloatingToolbar } from './FloatingToolbar.ts';
import { createResultPopover } from './ResultPopover.ts';

// State
let shadowContainer: {
  container: HTMLDivElement;
  shadow: ShadowRoot;
  styleElement: HTMLStyleElement;
} | null = null;

let currentSelection: string = '';
let currentEditableElement: Element | null = null;
let currentRequestId: string | null = null;
let isActionInProgress = false;
let isInitialized = false;

// Settings cache
interface SelectionSettings {
  enabled: boolean;
  minLength: number;
}

let settings: SelectionSettings = {
  enabled: true,
  minLength: DEFAULT_MIN_SELECTION_LENGTH,
};

/**
 * Load settings from storage
 */
async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.ENABLED,
      STORAGE_KEYS.MIN_LENGTH,
    ]);
    settings.enabled = (result[STORAGE_KEYS.ENABLED] as boolean | undefined) ?? true;
    settings.minLength = (result[STORAGE_KEYS.MIN_LENGTH] as number | undefined) ?? DEFAULT_MIN_SELECTION_LENGTH;
  } catch {
    // Use default settings if storage access fails
  }
}

/**
 * Initialize the selection UI
 */
export async function initSelectionUI(): Promise<void> {
  if (isInitialized) return;

  // Load settings first before attaching event listeners
  await loadSettings();

  document.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('beforeunload', forceCleanup);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Listen for settings changes from storage
  chrome.storage.onChanged.addListener(handleStorageChange);

  isInitialized = true;
}

/**
 * Destroy the selection UI and cleanup all resources
 */
export function destroySelectionUI(): void {
  if (!isInitialized) return;

  document.removeEventListener('mouseup', handleMouseUp);
  window.removeEventListener('beforeunload', forceCleanup);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  chrome.storage.onChanged.removeListener(handleStorageChange);

  forceCleanup();
  isInitialized = false;
}

/**
 * Handle storage changes
 */
function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
  if (changes[STORAGE_KEYS.ENABLED]) {
    settings.enabled = (changes[STORAGE_KEYS.ENABLED].newValue as boolean | undefined) ?? true;
    if (!settings.enabled) cleanup();
  }
  if (changes[STORAGE_KEYS.MIN_LENGTH]) {
    settings.minLength = (changes[STORAGE_KEYS.MIN_LENGTH].newValue as number | undefined) ?? DEFAULT_MIN_SELECTION_LENGTH;
  }
}

/**
 * Handle visibility change
 */
function handleVisibilityChange(): void {
  if (document.hidden) cleanup();
}

/**
 * Cleanup all UI elements
 */
export function cleanup(): void {
  if (isActionInProgress) return; // Don't cleanup while action is in progress
  removeShadowContainer();
  shadowContainer = null;
  currentSelection = '';
  currentEditableElement = null;
  currentRequestId = null;
}

/**
 * Force cleanup (for page unload)
 */
function forceCleanup(): void {
  removeShadowContainer();
  shadowContainer = null;
  currentSelection = '';
  currentEditableElement = null;
  currentRequestId = null;
  isActionInProgress = false;
}

/**
 * Handle mouse up event
 */
function handleMouseUp(e: MouseEvent): void {
  if (isActionInProgress) return;

  const target = e.target as HTMLElement;
  if (target.closest?.('#bracekit-selection-ui')) return;

  // Small delay to let selection finalize
  setTimeout(() => processSelection(), 10);
}

/**
 * Process current text selection
 */
function processSelection(): void {
  if (!settings.enabled || isActionInProgress) return;

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
  // (editable elements like inputs should NOT be excluded)
  if (!editableElement && element && isExcludedElement(element)) {
    cleanup();
    return;
  }

  // Store selection info
  currentSelection = text;
  currentEditableElement = editableElement;

  showToolbar(selection);
}

/**
 * Show the floating toolbar
 */
function showToolbar(selection: Selection | null): void {
  // Save selection BEFORE cleanup resets it
  const textToSave = currentSelection;
  const editableToSave = currentEditableElement;

  cleanup();

  // Calculate position - use active element for input/textarea if no selection range
  let position: SelectionPosition | null = null;

  if (selection && selection.rangeCount > 0) {
    position = calculateToolbarPosition(selection);
  }

  // Fallback: if position is null but we have an editable element, use element position
  if (!position && editableToSave) {
    // For input/textarea without valid selection range, use element position
    const rect = editableToSave.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    };

    // Position above or below the element
    const spaceAbove = rect.top;
    const TOOLBAR_HEIGHT = 48;
    const GAP = 8;

    let top: number;
    let placement: 'top' | 'bottom';

    if (spaceAbove >= TOOLBAR_HEIGHT + GAP) {
      top = rect.top + viewport.scrollY - TOOLBAR_HEIGHT - GAP;
      placement = 'top';
    } else {
      top = rect.bottom + viewport.scrollY + GAP;
      placement = 'bottom';
    }

    // Center horizontally
    const toolbarWidth = 200;
    let left = rect.left + viewport.scrollX + rect.width / 2 - toolbarWidth / 2;
    const minLeft = viewport.scrollX + GAP;
    const maxLeft = viewport.scrollX + viewport.width - toolbarWidth - GAP;
    left = Math.max(minLeft, Math.min(left, maxLeft));

    position = { top, left, placement };
  }

  if (!position) return;

  shadowContainer = createShadowContainer();
  if (!shadowContainer) return;

  const theme = detectPageTheme();
  shadowContainer.styleElement.textContent = getSelectionUIStyles(theme);

  // Store local references to avoid closure issues
  const localShadow = shadowContainer;
  const localSelection = textToSave;
  const localEditable = editableToSave;

  createFloatingToolbar(localShadow.shadow, {
    position,
    onActionClick: (action, targetLang) => {
      isActionInProgress = true;
      handleActionClick(action, targetLang, localShadow, localSelection, localEditable);
    },
    onDismiss: cleanup,
  });
}

/**
 * Handle action button click
 */
function handleActionClick(
  action: QuickAction['id'],
  targetLang: string | undefined,
  localShadow: NonNullable<typeof shadowContainer>,
  localSelection: string,
  localEditable: Element | null
): void {
  const actionConfig = QUICK_ACTIONS.find((a) => a.id === action);
  if (!actionConfig) {
    isActionInProgress = false;
    return;
  }

  // Remove toolbar only
  removeFloatingToolbar(localShadow.shadow);

  // Get fresh selection for positioning
  const selection = window.getSelection();
  let position: SelectionPosition;

  if (selection && selection.rangeCount > 0) {
    const calcPos = calculatePopoverPosition(selection);
    if (calcPos) {
      position = calcPos;
    } else {
      position = { top: window.scrollY + 100, left: window.scrollX + 100, placement: 'bottom' };
    }
  } else {
    position = { top: window.scrollY + 100, left: window.scrollX + 100, placement: 'bottom' };
  }

  const isEditable = localEditable !== null;

  try {
    const popover = createResultPopover(localShadow.shadow, {
      position,
      action,
      isEditable,
      onRegenerate: () => {
        executeQuickAction(action, targetLang, localSelection, popover);
      },
      onCopy: async () => {
        try {
          const content = popover.getContent();
          if (content) {
            await navigator.clipboard.writeText(content);
          }
        } catch {
          // Silent fail - clipboard may not be available
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
        isActionInProgress = false;
        forceCleanup();
      },
    });

    executeQuickAction(action, targetLang, localSelection, popover);
  } catch {
    isActionInProgress = false;
    forceCleanup();
  }
}

/**
 * Execute a quick action via AI
 */
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
  const actionConfig = QUICK_ACTIONS.find((a) => a.id === action);
  if (!actionConfig) return;

  if (!text || text.trim().length === 0) {
    popover.setError('No text selected. Please select some text first.');
    return;
  }

  const requestId = `quick_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  currentRequestId = requestId;

  popover.setLoading(true);

  try {
    const prompt = actionConfig.prompt(text, targetLang);
    const storage = await chrome.storage.local.get(['providerConfig', 'providerKeys']);
    const providerConfig = storage.providerConfig as { providerId: string; [key: string]: unknown } | undefined;
    const providerKeys = (storage.providerKeys as Record<string, { apiKey: string }> | undefined) || {};

    if (!providerConfig) {
      throw new Error('No provider configured. Please configure a provider in the BraceKit sidebar.');
    }

    const configWithKey = {
      ...providerConfig,
      apiKey: providerKeys[providerConfig.providerId]?.apiKey || '',
    };

    if (!configWithKey.apiKey) {
      throw new Error(`No API key found for ${providerConfig.providerId}. Please add your API key in the BraceKit sidebar.`);
    }

    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_REQUEST',
      messages: [{ role: 'user', content: prompt }],
      providerConfig: configWithKey,
      tools: [],
      options: { stream: false },
      requestId,
    });

    if (currentRequestId !== requestId) return;

    if (chrome.runtime.lastError) {
      throw new Error(`Extension error: ${chrome.runtime.lastError.message}`);
    }

    if (response?.error) {
      throw new Error(response.error as string);
    }

    const content = (response?.content as string) || '';
    popover.setContent(content);
  } catch (error) {
    if (currentRequestId !== requestId) return;
    popover.setError(error instanceof Error ? error.message : 'Request failed');
  } finally {
    if (currentRequestId === requestId) {
      currentRequestId = null;
    }
  }
}

/**
 * Update settings
 */
export function updateSettings(newSettings: {
  enabled?: boolean;
  minLength?: number;
}): void {
  if (newSettings.enabled !== undefined) settings.enabled = newSettings.enabled;
  if (newSettings.minLength !== undefined) settings.minLength = newSettings.minLength;
  if (!settings.enabled) cleanup();
}

/**
 * Check if selection UI is currently active
 */
export function isActive(): boolean {
  return shadowContainer !== null;
}
