/**
 * Chrome Extension Context Error Handler
 *
 * Handles the "Extension context invalidated" error that occurs when
 * the extension is reloaded while content scripts are still running.
 */

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
 *
 * Uses periodic polling instead of chrome.runtime.connect() because a
 * persistent port causes visible "Extension context disconnected" logs in the
 * page console and interferes with Cloudflare Turnstile bot-detection
 * fingerprinting when the service worker goes idle and the port drops.
 */
export function onContextInvalidated(callback: () => void): () => void {
  if (!isChromeRuntimeAvailable()) {
    callback();
    return () => {};
  }

  const POLL_INTERVAL_MS = 5_000;
  const timerId = setInterval(() => {
    if (!isChromeRuntimeAvailable()) {
      clearInterval(timerId);
      callback();
    }
  }, POLL_INTERVAL_MS);

  return () => clearInterval(timerId);
}
