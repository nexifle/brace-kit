import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';
import { composePageHtml, rebuildSiteProjection } from '../../utils/siteVfs.ts';
import {
  matchSitePageIndex,
  sitePreviewPath,
} from '../../utils/sitePreview.ts';
import {
  SITE_PREVIEW_FRAME_PAGE,
  isSitePreviewNavigateMessage,
  isSitePreviewReadyMessage,
  postSitePreviewRender,
} from '../../utils/sitePreviewProtocol.ts';
import { isWebBuilderKind, normalizeBuilderKind } from '../../types/slides.ts';

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
] as const;

function previewFrameSrc(): string {
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(SITE_PREVIEW_FRAME_PAGE);
  }
  return SITE_PREVIEW_FRAME_PAGE;
}

export function WebPreview() {
  const project = useSlideStore((s) => s.activeProject);
  const files = project?.files ?? [];
  const kind = normalizeBuilderKind(project?.kind);
  const site = useMemo(() => rebuildSiteProjection(files, kind), [files, kind]);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]['id']>('desktop');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const frameReadyRef = useRef(false);

  const pages = site.pages.filter((p) => files.some((f) => f.path === p.htmlPath));
  const pagesRef = useRef(pages);
  pagesRef.current = pages;
  const page = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))];
  const html = page ? composePageHtml(files, page, site) : '';

  useEffect(() => {
    const iframeEl = iframeRef.current;
    if (!iframeEl || !html) return;
    const iframe: HTMLIFrameElement = iframeEl;

    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.contentWindow) return;
      if (!isSitePreviewReadyMessage(event.data)) return;
      frameReadyRef.current = true;
      if (iframe.contentWindow) {
        postSitePreviewRender(iframe.contentWindow, html, page?.path);
      }
    }

    function onNavigate(event: MessageEvent) {
      if (event.source !== iframe.contentWindow) return;
      if (!isSitePreviewNavigateMessage(event.data)) return;
      const idx = matchSitePageIndex(pagesRef.current, event.data.path);
      if (idx >= 0) setPageIndex(idx);
    }

    window.addEventListener('message', onMessage);
    window.addEventListener('message', onNavigate);
    if (frameReadyRef.current && iframe.contentWindow) {
      postSitePreviewRender(iframe.contentWindow, html, page?.path);
    }
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('message', onNavigate);
    };
  }, [html, page?.path]);

  if (!project || !isWebBuilderKind(kind)) return null;

  const vp = VIEWPORTS.find((v) => v.id === viewport) ?? VIEWPORTS[0];

  if (!page) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground px-6 text-center">
        Pages will appear here as they are written.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 shrink-0">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
          {pages.map((p, i) => (
            <button
              key={p.htmlPath}
              type="button"
              onClick={() => setPageIndex(i)}
              className={`shrink-0 rounded-md px-2 py-0.5 text-2xs font-medium ${
                i === pageIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {p.path}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {VIEWPORTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setViewport(v.id)}
              className={`rounded-md px-1.5 py-0.5 text-2xs ${
                viewport === v.id
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              if (!project) return;
              const url =
                chrome.runtime.getURL(sitePreviewPath(project.id, page.path));
              chrome.tabs.create({ url });
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Open preview in new tab"
            aria-label="Open preview in new tab"
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/30">
        <iframe
          ref={iframeRef}
          title={`Preview ${page.path}`}
          src={previewFrameSrc()}
          className="h-full max-h-full bg-white shadow-md"
          style={{
            width: viewport === 'desktop' ? '100%' : Math.min(vp.width, 1280),
            maxWidth: '100%',
          }}
        />
      </div>
    </div>
  );
}
