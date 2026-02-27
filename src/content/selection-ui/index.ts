/**
 * Selection UI Module - Entry Point
 *
 * Provides text selection AI features for web pages:
 * - Floating toolbar with quick actions (summarize, explain, translate, rephrase)
 * - Result popover with copy/apply functionality
 * - Theme detection for dark/light mode adaptation
 * - Shadow DOM isolation from host page styles
 *
 * @example
 * ```ts
 * import { initSelectionUI, destroySelectionUI } from './selection-ui';
 *
 * // Initialize on page load
 * await initSelectionUI();
 *
 * // Clean up on page unload
 * destroySelectionUI();
 * ```
 */

import { getSelectionManager, resetSelectionManager } from './core/SelectionManager.ts';
import { resetAIService } from './services/AIService.ts';
import { resetSettingsService, type SelectionSettings } from './services/SettingsService.ts';

// === Core Functions ===

/**
 * Initialize the selection UI
 * Sets up event listeners and loads settings from storage
 */
export async function initSelectionUI(): Promise<void> {
  const manager = getSelectionManager();
  await manager.init();
}

/**
 * Destroy the selection UI and cleanup all resources
 * Removes all event listeners and DOM elements
 */
export function destroySelectionUI(): void {
  resetSelectionManager();
  resetAIService();
  resetSettingsService();
}

/**
 * Cleanup all UI elements (but keep event listeners)
 */
export function cleanup(): void {
  const manager = getSelectionManager();
  manager.cleanup();
}

/**
 * Update settings
 */
export function updateSettings(newSettings: Partial<SelectionSettings>): void {
  const manager = getSelectionManager();
  manager.updateSettings(newSettings);
}

/**
 * Check if selection UI is currently active
 */
export function isActive(): boolean {
  const manager = getSelectionManager();
  return manager.isActive();
}

// === Types ===

export type {
  QuickAction,
  SelectionPosition,
  ThemeDetectionResult,
  QuickActionRequest,
  QuickActionResponse,
  SelectionUIState,
  ResultPopoverState,
} from './types.ts';

// === Services (for advanced usage) ===

export { getAIService, createAIService, type AIService } from './services/AIService.ts';
export { getSettingsService, createSettingsService, type SelectionSettings, type SettingsService } from './services/SettingsService.ts';

// === Constants ===

export {
  QUICK_ACTIONS,
  DEFAULT_MIN_SELECTION_LENGTH,
  TOOLBAR_HEIGHT,
  POPOVER_WIDTH,
  POPOVER_MAX_HEIGHT,
  GAP,
  TRANSLATION_TARGETS,
  STORAGE_KEYS,
  RATE_LIMIT_MS,
} from './constants.ts';
