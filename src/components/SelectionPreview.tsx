import { XIcon } from 'lucide-react';
import { usePageContext } from '../hooks/usePageContext.ts';

export function SelectionPreview() {
  const { selectedText, clearSelection } = usePageContext();

  if (!selectedText) return null;

  const displayText = selectedText.selectedText.length > 80
    ? selectedText.selectedText.substring(0, 80) + '...'
    : selectedText.selectedText;

  return (
    <div className="flex items-center justify-between px-2 py-1.5 mb-1 bg-primary/5 border border-primary/20 rounded-md animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center gap-1.5 text-xs text-primary overflow-hidden">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
        <span className="truncate max-w-[240px] font-medium italic opacity-80 leading-none">{displayText}</span>
      </div>
      <button
        className="flex items-center justify-center w-5 h-5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0 transition-all"
        onClick={clearSelection}
        title="Remove selection"
      >
        <XIcon size={10} />
      </button>
    </div>
  );
}
