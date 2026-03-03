import { XIcon } from 'lucide-react';
import { useFileAttachments } from '../hooks';
import { escapeHtml } from '../utils/markdown.ts';

export function FilePreview() {
  const { attachments, removeAttachment, clearAllAttachments } = useFileAttachments();

  if (attachments.length === 0) return null;

  return (
    <div className="flex items-start justify-between px-2 py-2 mb-1 bg-primary/5 border border-primary/20 rounded-md animate-in fade-in slide-in-from-top-2 gap-2">
      <div className="flex flex-wrap gap-2 flex-1">
        {attachments.map((att) => (
          <div
            key={att.id}
            className="relative group w-16 h-16 bg-muted/30 border border-border rounded-md overflow-hidden shrink-0 flex flex-col"
          >
            {/* Remove button - always top-right */}
            <button
              className="absolute top-0.5 right-0.5 z-10 flex items-center justify-center w-4 h-4 bg-background/80 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => removeAttachment(att.id)}
              title="Remove"
            >
              <XIcon size={9} />
            </button>

            {att.type === 'error' ? (
              <>
                <div className="flex-1 flex items-center justify-center px-1">
                  <span className="text-lg">⚠️</span>
                </div>
                <div className="px-1 pb-1">
                  <span className="block truncate text-2xs text-destructive font-medium leading-tight">
                    {escapeHtml(att.name)}
                  </span>
                </div>
              </>
            ) : att.type === 'image' ? (
              <>
                <img
                  src={att.data}
                  alt={att.name}
                  className="w-full flex-1 object-cover min-h-0"
                />
                <div className="px-1 pb-1 bg-background/60 backdrop-blur-sm">
                  <span className="block truncate text-2xs text-muted-foreground font-medium leading-tight">
                    {escapeHtml(att.name)}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1 flex items-center justify-center">
                  <span className="text-2xl">{att.type === 'pdf' ? '📄' : '📃'}</span>
                </div>
                <div className="px-1 pb-1">
                  <span className="block truncate text-2xs text-muted-foreground font-medium leading-tight">
                    {escapeHtml(att.name)}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <button
        className="flex items-center justify-center w-6 h-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md shrink-0 transition-all"
        onClick={clearAllAttachments}
        title="Remove all files"
      >
        <XIcon size={12} />
      </button>
    </div>
  );
}
