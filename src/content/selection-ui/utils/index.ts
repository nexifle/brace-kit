/**
 * Utilities for selection-ui module
 */

export { logger } from './logger.ts';
export { detectPageTheme, generateThemeVariables, ensureFontLoaded } from './themeDetector.ts';
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
  getEditableElement,
  applyTextToEditable,
  isExcludedElement,
} from './positioning.ts';
export {
  isExtensionContextInvalidated,
  isChromeRuntimeAvailable,
  onContextInvalidated,
} from './chromeErrorHandler.ts';
