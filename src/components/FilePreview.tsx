import { XIcon } from 'lucide-react';
import { useFileAttachments } from '../hooks';
import { escapeHtml } from '../utils/markdown.ts';

export function FilePreview() {
  const { attachments, removeAttachment, clearAllAttachments } = useFileAttachments();

  if (attachments.length === 0) return null;

  return (
    <div className="flex items-start justify-between px-2 py-2 mb-1 bg-primary/5 border border-primary/20 rounded-md animate-in fade-in slide-in-from-top-2 gap-2">
      <div className="flex flex-wrap gap-1.5 flex-1">
        {attachments.map((att) => (
          <div
            key={att.id}
            className={`flex items-center gap-1.5 px-2 py-1 bg-muted/30 border border-border rounded-sm text-[10px] text-muted-foreground min-w-0 max-w-[150px] ${att.type === 'image' ? 'p-1 flex-col items-start gap-1' : ''
              }`}
          >
            {att.type === 'error' ? (
              <>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-destructive font-medium truncate">{escapeHtml(att.name)}: {att.error}</span>
                </div>
                <button
                  className="flex items-center justify-center w-4.5 h-4.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm shrink-0 transition-all"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                >
                  <XIcon size={10} />
                </button>
              </>
            ) : att.type === 'image' ? (
              <>
                <div className="relative group/img">
                  <img src={att.data} alt={att.name} className="w-12 h-12 object-cover rounded-sm" />
                  <button
                    className="absolute -top-1 -right-1 flex items-center justify-center w-4.5 h-4.5 bg-destructive text-destructive-foreground rounded-sm shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity"
                    onClick={() => removeAttachment(att.id)}
                    title="Remove"
                  >
                    <XIcon size={10} />
                  </button>
                </div>
                <div className="flex items-center gap-1 min-w-0 w-full overflow-hidden">
                  <span className="truncate text-[9px] font-medium opacity-70">{escapeHtml(att.name)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                  <span className="text-xs">{att.type === 'pdf' ? '📄' : '📃'}</span>
                  <span className="truncate font-medium">{escapeHtml(att.name)}</span>
                </div>
                <button
                  className="flex items-center justify-center w-4.5 h-4.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-sm shrink-0 transition-all"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                >
                  <XIcon size={10} />
                </button>
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
