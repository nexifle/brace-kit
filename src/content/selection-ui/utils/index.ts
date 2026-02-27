/**
 * Utilities for selection-ui module
 */

export { logger } from './logger.ts';
export { detectPageTheme, generateThemeVariables } from './themeDetector.ts';
export {
  createShadowContainer,
  removeShadowContainer,
  hasShadowContainer,
  getSelectionUIStyles,
  updateShadowTheme,
  type ShadowContainer,
} from './shadowContainer.ts';
export {
  getContainerOffset,
  calculateToolbarPosition,
  calculateToolbarPositionFromElement,
  calculatePopoverPositionFromRect,
  calculatePopoverPosition,
  isEditableElement,
  getEditableElement,
  applyTextToEditable,
  isExcludedElement,
} from './positioning.ts';
export {
  isExtensionContextInvalidated,
  safeChromeAPICall,
  safeChromeAPICallAsync,
  isChromeRuntimeAvailable,
  onContextInvalidated,
} from './chromeErrorHandler.ts';
