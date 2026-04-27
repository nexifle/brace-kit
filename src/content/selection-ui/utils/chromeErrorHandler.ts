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
    if (!(chrome && chrome.runtime && chrome.runtime.id && chrome.storage?.local)) {
      return false;
    }

    // `runtime.id` can remain truthy for a stale content-script context after the
    // extension is disabled. Touch a runtime method as a stronger validity check.
    const baseUrl = chrome.runtime.getURL('');
    return typeof baseUrl === 'string' && baseUrl.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check whether the current extension context is not just present, but still
 * responsive for storage/runtime operations.
 */
export async function isChromeRuntimeResponsive(): Promise<boolean> {
  if (!isChromeRuntimeAvailable()) {
    return false;
  }

  try {
    await chrome.storage.local.get([]);
    return true;
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
