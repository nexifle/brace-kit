import { useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { useFileAttachments } from '../hooks';
import type { FileAttachment } from '../types/index.ts';
import { escapeHtml } from '../utils/markdown.ts';
import { TextFileViewer } from './TextFileViewer.tsx';
import { ImageLightbox } from './message/display/ImageLightbox.tsx';

type PreviewTarget =
  | { kind: 'image'; src: string; name: string }
  | { kind: 'text'; name: string; content: string };

function canPreview(att: FileAttachment): boolean {
  if (att.type === 'image' && att.data) return true;
  if (att.type === 'text' && att.data != null) return true;
  return false;
}

export function FilePreview() {
  const { attachments, removeAttachment, clearAllAttachments } = useFileAttachments();
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  // Keep an open preview mounted even if chips were cleared underneath it.
  if (attachments.length === 0 && !preview) return null;

  function openPreview(att: FileAttachment) {
    if (att.type === 'image' && att.data) {
      setPreview({ kind: 'image', src: att.data, name: att.name });
      return;
    }
    if (att.type === 'text' && att.data != null) {
      setPreview({ kind: 'text', name: att.name || 'text.txt', content: att.data });
    }
  }

  return (
    <>
      {attachments.length > 0 && (
        <div className="mb-1 flex items-start justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-2 py-2 animate-in fade-in slide-in-from-top-2">
          <div className="flex flex-1 flex-wrap gap-2">
            {attachments.map((att) => {
              const previewable = canPreview(att);
              return (
                <div
                  key={att.id}
                  className="group relative flex h-16 w-16 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-muted/30"
                >
                  <button
                    type="button"
                    className="absolute top-0.5 right-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-sm bg-background text-muted-foreground opacity-0 shadow-sm transition-colors group-hover:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeAttachment(att.id);
                    }}
                    title="Remove"
                    aria-label={`Remove ${att.name || 'attachment'}`}
                  >
                    <XIcon size={9} />
                  </button>

                  {att.type === 'error' ? (
                    <div className="flex h-full flex-col" title={att.error}>
                      <div className="flex flex-1 items-center justify-center px-1">
                        <span className="text-lg">⚠️</span>
                      </div>
                      <div className="px-1 pb-1">
                        <span
                          className="block truncate text-2xs font-medium leading-tight text-destructive"
                          title={att.error ?? att.name}
                        >
                          {escapeHtml(att.error || att.name || 'Attachment error')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={`flex h-full w-full flex-col text-left ${
                        previewable
                          ? 'cursor-zoom-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40'
                          : 'cursor-default'
                      }`}
                      onClick={() => previewable && openPreview(att)}
                      disabled={!previewable}
                      title={previewable ? `Preview ${att.name}` : att.name}
                      aria-label={
                        previewable
                          ? `Preview ${att.name || att.type}`
                          : att.name || att.type
                      }
                    >
                      {att.type === 'image' && att.data ? (
                        <>
                          <img
                            src={att.data}
                            alt=""
                            className="min-h-0 w-full flex-1 object-cover object-center"
                          />
                          <div className="bg-background/60 px-1 pb-1 backdrop-blur-sm">
                            <span className="block truncate text-2xs font-medium leading-tight text-muted-foreground">
                              {escapeHtml(att.name)}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex flex-1 items-center justify-center">
                            <span className="text-2xl">{att.type === 'pdf' ? '📄' : '📃'}</span>
                          </div>
                          <div className="px-1 pb-1">
                            <span className="block truncate text-2xs font-medium leading-tight text-muted-foreground">
                              {escapeHtml(att.name)}
                            </span>
                          </div>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm transition-colors hover:bg-destructive hover:text-destructive-foreground"
            onClick={clearAllAttachments}
            title="Remove all files"
            aria-label="Remove all files"
          >
            <XIcon size={12} />
          </button>
        </div>
      )}

      {preview?.kind === 'image' && (
        <ImageLightbox src={preview.src} onClose={() => setPreview(null)} />
      )}
      {preview?.kind === 'text' && (
        <TextFileViewer
          isOpen
          onClose={() => setPreview(null)}
          fileName={preview.name}
          content={preview.content}
        />
      )}
    </>
  );
}
