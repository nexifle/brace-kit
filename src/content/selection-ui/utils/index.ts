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
  calculateToolbarPositionFromPoint,
  calculatePopoverPositionFromRect,
  getEditableElement,
  applyTextToEditable,
  isExcludedElement,
} from './positioning.ts';
export {
  isExtensionContextInvalidated,
  isChromeRuntimeAvailable,
  isChromeRuntimeResponsive,
  onContextInvalidated,
} from './chromeErrorHandler.ts';
export {
  isGoogleDocsPage,
  isGoogleDocsReady,
  insertTextToGoogleDocs,
  replaceTextInGoogleDocs,
  type GoogleDocsInsertResult,
} from './googleDocsInserter.ts';
