/**
 * Chrome Extension Context Error Handler
 *
 * Handles the "Extension context invalidated" error that occurs when
 * the extension is reloaded while content scripts are still running.
 */

import { logger } from './logger.ts';

/** Error message patterns that indicate extension context is invalid */
const CONTEXT_INVALIDATED_PATTERNS = [
  'Extension context invalidated',
  'Extension not loaded',
  'Error connecting to extension',
  'The message port closed before a response was received',
];

/**
 * Check if an error indicates the extension context has been invalidated
 */
export function isExtensionContextInvalidated(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message || '';
  return CONTEXT_INVALIDATED_PATTERNS.some(pattern =>
    message.includes(pattern)
  );
}

/**
 * Check if Chrome runtime is available (extension context is valid)
 */
export function isChromeRuntimeAvailable(): boolean {
  try {
    return !!(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

/**
 * Setup a listener for extension context disconnection
 * Returns a cleanup function
 */
export function onContextInvalidated(callback: () => void): () => void {
  if (!isChromeRuntimeAvailable()) {
    // Already invalidated
    callback();
    return () => {};
  }

  const handleDisconnect = () => {
    logger.info('Extension context disconnected');
    callback();
  };

  // Listen for port disconnect (happens when extension reloads)
  const port = chrome.runtime.connect({ name: 'selection-ui-context' });
  port.onDisconnect.addListener(handleDisconnect);

  // Return cleanup function
  return () => {
    try {
      port.onDisconnect.removeListener(handleDisconnect);
      port.disconnect();
    } catch {
      // Port may already be disconnected
    }
  };
}
