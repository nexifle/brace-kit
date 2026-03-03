import { XIcon } from 'lucide-react';
import { usePageContext } from '../hooks';

export function PageContextPreview() {
  const { pageContext, clearPageContext } = usePageContext();

  if (!pageContext) return null;

  return (
    <div className="mb-1 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-md shadow-sm">
        <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-sm text-primary shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-foreground truncate leading-tight tracking-tight uppercase">{pageContext.pageTitle}</div>
          <div className="text-2xs text-muted-foreground truncate opacity-70 mt-0.5">{pageContext.pageUrl}</div>
        </div>
        <button
          className="flex items-center justify-center w-6 h-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0 transition-all"
          onClick={clearPageContext}
          title="Remove page context"
        >
          <XIcon size={12} />
        </button>
      </div>
    </div>
  );
}
