// Slide renderer sandbox runtime.
// Implements the normative postMessage protocol from PRD Appendix D.2:
//   - Parent -> sandbox: `render` | `capture` | `ping`
//   - Sandbox -> parent: `ready` | `rendered` | `captured` | `pong` (all with fromSandbox: true)
//
// The iframe is mounted with `sandbox="allow-scripts"` (NO allow-same-origin => opaque
// origin). No chrome.* APIs are available here; rendering and PNG capture are done with
// pure web APIs + the bundled `html-to-image` lib. The parent inlines all images before
// sending `render`, so capture is never CORS-tainted and the sandbox never fetches.

import { toPng } from 'html-to-image';
import {
  isSandboxRequest,
  isValidDimension,
  detectChromeApiStatus,
  type SandboxParentToSandbox,
  type SandboxToParent,
} from './utils/slideRendererProtocol';

const SANDBOX_1310_MAX_DIM = 8192;

const stageEl = document.getElementById('stage') as HTMLDivElement | null;
if (!stageEl) {
  throw new Error('slide-renderer: #stage element not found');
}
const stage: HTMLDivElement = stageEl;

/** Post a sandbox -> parent message. */
function reply(msg: SandboxToParent): void {
  window.parent.postMessage(msg, '*');
}

/** Wrap the message with the response type + optional requestId correlation. */
function ack(
  type: 'rendered' | 'captured' | 'pong',
  requestId: string | undefined,
  extra?: Partial<Omit<SandboxToParent, 'type' | 'fromSandbox' | 'requestId'>>
): SandboxToParent {
  return { type, fromSandbox: true, requestId, ...(extra ?? {}) } as SandboxToParent;
}

/**
 * Wait briefly for fonts/images to settle before acknowledging a render, or for a
 * serialized render-then-capture flow. Never rejects; best-effort.
 */
function settle(ms = 300): Promise<void> {
  const fallback = new Promise<void>((resolve) => setTimeout(resolve, ms));
  const fontsReady =
    typeof document.fonts?.ready === 'object'
      ? document.fonts.ready.then(() => undefined)
      : Promise.resolve();
  return Promise.race([fontsReady, fallback]).then(() => undefined);
}

/** Apply an already-inlined HTML document fragment to the stage at fixed size. */
function applyRender(req: Extract<SandboxParentToSandbox, { type: 'render' }>): void {
  manualRender(stage, req.html, req.width, req.height);
}

/** Shared sizing helper. `manualRender` is exported for tests/embedders. */
export function manualRender(el: HTMLElement, html: string, w: number, h: number): void {
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.transform = 'none';
  el.style.transformOrigin = 'top left';
  el.innerHTML = html;
}

/** Rasterize the current stage to a PNG data URL at `w x h`. */
async function capture(req: Extract<SandboxParentToSandbox, { type: 'capture' }>): Promise<string> {
  const { width: w, height: h, backgroundColor } = req;
  const previous = {
    width: stage.style.width,
    height: stage.style.height,
    transform: stage.style.transform,
  };
  // Capture at exact requested size regardless of any parent-side fit transform.
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  stage.style.transform = 'none';
  try {
    await settle(30);
    return await toPng(stage, {
      width: w,
      height: h,
      pixelRatio: 1,
      cacheBust: false,
      backgroundColor: backgroundColor ?? '#ffffff',
      // Embed slide @font-face (already data-URL-inlined by the parent) so exported
      // text metrics match the preview; sandbox does no network fetch (FR-18).
      skipFonts: false,
    });
  } finally {
    stage.style.width = previous.width;
    stage.style.height = previous.height;
    stage.style.transform = previous.transform;
  }
}

// ---- Announce readiness (once) ----
reply({ type: 'ready', fromSandbox: true });

// ---- Handle messages from the parent page ----
window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source !== window.parent) return;
  const req: unknown = event.data;
  if (!isSandboxRequest(req)) return; // parent must ignore unknown sandbox messages; sandbox mirrors guard

  const requestId = req.requestId;

  if (req.type === 'ping') {
    reply(
      ack('pong', requestId, {
        origin: typeof window.origin === 'string' ? window.origin : 'null',
        chromeApi: detectChromeApiStatus(),
      })
    );
    return;
  }

  if (req.type === 'render') {
    if (!isValidDimension(req.width) || !isValidDimension(req.height)) {
      reply(ack('rendered', requestId)); // always ack; an unusable size renders an empty-safe stage
      return;
    }
    applyRender(req);
    await settle();
    reply(ack('rendered', requestId));
    return;
  }

  if (req.type === 'capture') {
    if (!isValidDimension(req.width) || !isValidDimension(req.height)) {
      reply(ack('captured', requestId, { error: `invalid capture dimension ${req.width}x${req.height}` }));
      return;
    }
    if (req.width > SANDBOX_1310_MAX_DIM || req.height > SANDBOX_1310_MAX_DIM) {
      reply(ack('captured', requestId, { error: 'capture dimension exceeds sandbox limit' }));
      return;
    }
    try {
      const dataUrl = await capture(req);
      reply(ack('captured', requestId, { dataUrl }));
    } catch (err) {
      reply(ack('captured', requestId, { error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }
});
