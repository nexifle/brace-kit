import { forwardRef, useEffect, useImperativeHandle, useRef, type HTMLAttributes } from 'react';
import { inlineAllImages } from '../../utils/imageInlining';
import {
  isValidDimension,
  type SandboxChromeApiStatus,
  type SandboxParentToSandbox,
  type SandboxToParent,
} from '../../utils/slideRendererProtocol';

/**
 * Imperative handle exposed by the SlideRenderer (PRD Appendix D.2 "Parent bridge
 * API (React)"). All methods wait for the sandbox `ready` before doing work.
 */
export interface SlideRendererHandle {
  /**
   * Inline any external images (CORS-clean), then render `html` into the sandbox
   * stage at `width x height`. Resolves when the sandbox acks `rendered`.
   */
  render(html: string, width: number, height: number): Promise<void>;
  /** Capture the current stage at `width x height`; resolves data URL or rejects. */
  capture(width: number, height: number, backgroundColor?: string): Promise<string>;
  /** Optional diagnostic — resolves with the sandbox origin + chrome API status. */
  ping(): Promise<{ origin: string; chromeApi: SandboxChromeApiStatus }>;
}

interface SlideRendererProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Extra classes for the iframe (e.g. sizing / object-fit). */
  iframeClassName?: string;
  /** Override src (mainly for tests). Defaults to the extension sandbox page. */
  src?: string;
}

interface PendingCall {
  resolve: (msg: SandboxToParent) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Parent-side React bridge for the slide renderer sandbox.
 *
 * Mounts an opaque-origin `<iframe sandbox="allow-scripts">` (NO allow-same-origin)
 * pointing at the extension's `slide-renderer.html`, and communicates with it purely
 * via `window.postMessage` per PRD Appendix D.2. The bridge never passes functions
 * across the boundary — only serializable messages.
 */
export const SlideRenderer = forwardRef<SlideRendererHandle, SlideRendererProps>(
  function SlideRenderer({ iframeClassName, src, ...divProps }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const readyRef = useRef<Promise<void> | null>(null);
    const pendingRef = useRef<Map<string, PendingCall>>(new Map());
    const counterRef = useRef(0);

    useEffect(() => {
      let readyDone = false;
      let readyResolve = () => {};
      const ready = new Promise<void>((resolve) => {
        readyResolve = resolve;
      });
      readyRef.current = ready;

      function onMessage(event: MessageEvent) {
        const iframe = iframeRef.current;
        if (!iframe || event.source !== iframe.contentWindow) return;

        const msg: unknown = event.data;
        if (typeof msg !== 'object' || msg === null) return;
        const typed = msg as Partial<SandboxToParent>;
        if (typed.fromSandbox !== true) return; // parent must ignore non-sandbox traffic

        if (typed.type === 'ready') {
          if (!readyDone) {
            readyDone = true;
            readyResolve();
          }
          return;
        }

        const requestId = (typed as { requestId?: string }).requestId;
        if (typeof requestId !== 'string') return;
        const pending = pendingRef.current.get(requestId);
        if (!pending) return;

        pendingRef.current.delete(requestId);
        clearTimeout(pending.timer);
        if (typed.type === 'captured' && typed.error) {
          pending.reject(new Error(typed.error));
        } else {
          pending.resolve(typed as SandboxToParent);
        }
      }

      window.addEventListener('message', onMessage);
      return () => {
        window.removeEventListener('message', onMessage);
        for (const [requestId, pending] of pendingRef.current) {
          clearTimeout(pending.timer);
          pending.reject(new Error('SlideRenderer unmounted before sandbox response'));
          pendingRef.current.delete(requestId);
        }
        // Leave the ready promise unresolved so a queued caller rejects cleanly.
        readyResolve();
      };
    }, []);

    function nextRequestId(): string {
      counterRef.current += 1;
      return `slide-renderer-${Date.now()}-${counterRef.current}`;
    }

    async function ensureReady(): Promise<void> {
      const ready = readyRef.current;
      if (ready) await ready;
    }

    function postSansWait(msg: SandboxParentToSandbox, requestId: string): Promise<SandboxToParent> {
      const iframe = iframeRef.current;
      if (!iframe || !iframe.contentWindow) {
        return Promise.reject(new Error('SlideRenderer iframe is not mounted'));
      }
      const win: Window = iframe.contentWindow;
      return new Promise<SandboxToParent>((resolve, reject) => {
        const timer = setTimeout(() => {
          pendingRef.current.delete(requestId);
          reject(new Error(`SlideRenderer timed out waiting for "${msg.type}" reply`));
        }, REQUEST_TIMEOUT_MS);
        pendingRef.current.set(requestId, { resolve, reject, timer });
        win.postMessage({ ...msg, requestId }, '*'); // opaque origin: cannot use fixed target
      });
    }

    useImperativeHandle(
      ref,
      () => ({
        async render(html: string, width: number, height: number): Promise<void> {
          if (!isValidDimension(width) || !isValidDimension(height)) {
            throw new Error(`SlideRenderer: invalid render dimension ${width}x${height}`);
          }
          await ensureReady();
          const inlined = await inlineAllImages(html);
          const requestId = nextRequestId();
          await postSansWait({ type: 'render', html: inlined, width, height }, requestId);
        },
        async capture(
          width: number,
          height: number,
          backgroundColor?: string
        ): Promise<string> {
          if (!isValidDimension(width) || !isValidDimension(height)) {
            throw new Error(`SlideRenderer: invalid capture dimension ${width}x${height}`);
          }
          await ensureReady();
          const requestId = nextRequestId();
          const reply = await postSansWait(
            { type: 'capture', width, height, backgroundColor },
            requestId
          );
          if ('error' in reply && reply.error) throw new Error(reply.error);
          if (!('dataUrl' in reply) || typeof reply.dataUrl !== 'string') {
            throw new Error('SlideRenderer: capture succeeded without a data URL');
          }
          return reply.dataUrl;
        },
        async ping(): Promise<{ origin: string; chromeApi: SandboxChromeApiStatus }> {
          await ensureReady();
          const requestId = nextRequestId();
          const reply = await postSansWait({ type: 'ping' }, requestId);
          return {
            origin: reply.type === 'pong' ? reply.origin : 'null',
            chromeApi: reply.type === 'pong' ? reply.chromeApi : 'none',
          };
        },
      }),
      []
    );

    const iframeSrc = src ?? chrome.runtime.getURL('slide-renderer.html');

    return (
      <div ref={containerRef} {...divProps}>
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="Slide preview"
          sandbox="allow-scripts"
          className={iframeClassName}
        />
      </div>
    );
  }
);

SlideRenderer.displayName = 'SlideRenderer';
