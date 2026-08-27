import { useMemo, useState } from 'react';
import { useSlideStore } from '../../store/slideStore.ts';
import { composePageHtml, rebuildSiteProjection } from '../../utils/siteVfs.ts';
import { isWebBuilderKind, normalizeBuilderKind } from '../../types/slides.ts';

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 768 },
  { id: 'mobile', label: 'Mobile', width: 390 },
] as const;

export function WebPreview() {
  const project = useSlideStore((s) => s.activeProject);
  const files = project?.files ?? [];
  const kind = normalizeBuilderKind(project?.kind);
  const site = useMemo(() => rebuildSiteProjection(files, kind), [files, kind]);
  const [pageIndex, setPageIndex] = useState(0);
  const [viewport, setViewport] = useState<(typeof VIEWPORTS)[number]['id']>('desktop');

  if (!project || !isWebBuilderKind(kind)) return null;

  const pages = site.pages.filter((p) => files.some((f) => f.path === p.htmlPath));
  const page = pages[Math.min(pageIndex, Math.max(0, pages.length - 1))];
  const vp = VIEWPORTS.find((v) => v.id === viewport) ?? VIEWPORTS[0];

  if (!page) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground px-6 text-center">
        Pages will appear here as they are written.
      </div>
    );
  }

  const html = composePageHtml(files, page, site);

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
        <div className="flex shrink-0 gap-1">
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
        </div>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/30 p-3">
        <iframe
          title={`Preview ${page.path}`}
          sandbox="allow-scripts"
          srcDoc={html}
          className="h-full max-h-full bg-white shadow-md"
          style={{ width: Math.min(vp.width, 1280), maxWidth: '100%' }}
        />
      </div>
    </div>
  );
}
