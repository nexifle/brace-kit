// ==================== Sandbox Renderer postMessage Protocol ====================
// Normative data shapes from PRD Appendix D.2 (locked for implementation).
// Parent page and sandbox page are different origins; they communicate ONLY via
// window.postMessage. Every sandbox -> parent message includes `fromSandbox: true`.
//
// This module is shared by BOTH sides:
//   - src/slide-renderer.ts  (sandbox runtime — receives requests, replies)
//   - src/components/slides/SlideRenderer.tsx (parent bridge, US-011)

/** Parent -> sandbox request types. */
export type SandboxRequestType = 'render' | 'capture' | 'ping';

/** A message the parent page posts into the sandbox iframe's window. */
export type SandboxParentToSandbox =
  | { type: 'render'; html: string; width: number; height: number; requestId?: string }
  | { type: 'capture'; width: number; height: number; backgroundColor?: string; requestId?: string }
  | { type: 'ping'; requestId?: string };

/** Whether the sandbox page has extension `chrome.*` access. Must be 'none' in production. */
export type SandboxChromeApiStatus = 'none' | 'present';

/** Sandbox -> parent response types. */
export type SandboxResponseType = 'ready' | 'rendered' | 'captured' | 'pong';

/** A message the sandbox page posts back to the parent window. */
export type SandboxToParent =
  | { type: 'ready'; fromSandbox: true }
  | { type: 'rendered'; fromSandbox: true; requestId?: string }
  | {
      type: 'captured';
      fromSandbox: true;
      requestId?: string;
      /** Present on success: `data:image/png;base64,...`. */
      dataUrl?: string;
      /** Present on failure. */
      error?: string;
    }
  | {
      type: 'pong';
      fromSandbox: true;
      requestId?: string;
      /** Should be `"null"` (or otherwise opaque) for a true sandbox. */
      origin: string;
      /** Must be 'none' in production. */
      chromeApi: SandboxChromeApiStatus;
    };

/** Marker that every legitimate sandbox -> parent message carries. */
export const SANDBOX_FROM_FLAG = 'fromSandbox' as const;

/**
 * True when `value` looks like a message the parent page intended for the
 * sandbox (i.e. one of the `render` / `capture` / `ping` request types).
 * The sandbox rejects anything else.
 */
export function isSandboxRequest(value: unknown): value is SandboxParentToSandbox {
  if (typeof value !== 'object' || value === null) return false;
  const msg = value as Record<string, unknown>;
  const type = msg['type'];
  if (type === 'render') {
    return (
      typeof msg['html'] === 'string' &&
      typeof msg['width'] === 'number' &&
      typeof msg['height'] === 'number'
    );
  }
  if (type === 'capture') {
    return typeof msg['width'] === 'number' && typeof msg['height'] === 'number';
  }
  if (type === 'ping') return true;
  return false;
}

/** Validate an integer, finite pixel dimension within the safe cap. */
export function isValidDimension(v: unknown): v is number {
  return (
    typeof v === 'number' &&
    Number.isInteger(v) &&
    Number.isFinite(v) &&
    v > 0 &&
    v <= 8192
  );
}

/** Read `chromeApi` status without touching `chrome.*` internals. */
export function detectChromeApiStatus(): SandboxChromeApiStatus {
  try {
    const wc = (window as unknown as { chrome?: { runtime?: unknown } }).chrome;
    return wc && typeof wc.runtime !== 'undefined' ? 'present' : 'none';
  } catch {
    return 'none';
  }
}
