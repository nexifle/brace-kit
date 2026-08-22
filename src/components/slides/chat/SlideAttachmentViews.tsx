import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Paperclip, X } from 'lucide-react';
import { useSlideStore } from '../../../store/slideStore.ts';
import type { SlideFile, SlideUserAttachment } from '../../../types/slides.ts';
import {
  attachmentKindFromPath,
  hydrateAttachment,
  listUploadFiles,
  type SlidePendingAttachment,
} from '../../../utils/slideUploads.ts';

/** Stable empty snapshot — `?? []` in a Zustand selector infinite-loops. */
const EMPTY_FILES: SlideFile[] = [];

export type ViewableAttachment = {
  id: string;
  type: 'image' | 'text' | 'error';
  name: string;
  path?: string;
  data?: string;
  preview?: string;
  error?: string;
};

export function toViewable(att: SlidePendingAttachment | SlideUserAttachment): ViewableAttachment {
  return {
    id: att.id,
    type: att.type === 'error' ? 'error' : att.type,
    name: att.name,
    path: 'path' in att ? att.path : undefined,
    data: att.data,
    preview: 'preview' in att ? att.preview : undefined,
    error: 'error' in att ? att.error : undefined,
  };
}

export function AttachmentChip({
  att,
  onRemove,
  onOpen,
}: {
  att: ViewableAttachment;
  onRemove?: () => void;
  onOpen?: () => void;
}) {
  const clickable = att.type !== 'error' && !!onOpen;
  return (
    <div className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
      <button
        type="button"
        className="flex h-full w-full items-center justify-center"
        onClick={clickable ? onOpen : undefined}
        title={att.error ?? att.name}
        aria-label={att.name}
      >
        {att.type === 'error' ? (
          <span className="text-[10px]">⚠️</span>
        ) : att.type === 'image' && (att.preview || att.data) ? (
          <img src={att.preview || att.data} alt="" className="h-full w-full object-cover" />
        ) : (
          <FileText size={14} className="text-muted-foreground" />
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          className="absolute -right-0.5 -top-0.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow group-hover:flex hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${att.name}`}
          title="Remove"
        >
          <X size={9} />
        </button>
      )}
    </div>
  );
}

export function AttachmentLightbox({
  att,
  onClose,
}: {
  att: ViewableAttachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!att) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [att, onClose]);

  if (!att || typeof document === 'undefined') return null;

  const isImage = att.type === 'image' && att.data;
  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <span className="truncate text-sm font-medium">{att.name}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-auto p-3">
          {isImage ? (
            <img src={att.data} alt={att.name} className="mx-auto max-h-[70vh] max-w-full object-contain" />
          ) : (
            <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
              {att.data ?? '(empty)'}
            </pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Inline `/uploads` list for Project docs — no extra header chrome. */
export function DeckUploadsPanel() {
  const files = useSlideStore((s) => s.activeProject?.files) ?? EMPTY_FILES;
  const removeUploadedFile = useSlideStore((s) => s.removeUploadedFile);
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewableAttachment | null>(null);
  const uploaded = listUploadFiles(files);

  return (
    <div className="space-y-3 px-4 py-4 sm:px-8 sm:py-6">
      <p className="text-xs text-muted-foreground">
        Files you attached live at <span className="font-mono">/uploads/</span>. Slides can
        reference them with <span className="font-mono">src=&quot;/uploads/…&quot;</span>.
      </p>
      {uploaded.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No files in this deck yet. Attach txt or images from the composer paperclip.
        </p>
      ) : (
        <div className="space-y-1.5">
          {uploaded.map((f) => {
            const kind = attachmentKindFromPath(f.path, f.content);
            const att: ViewableAttachment = {
              id: f.path,
              type: kind,
              name: f.path.slice('/uploads/'.length),
              path: f.path,
              data: f.content,
            };
            return (
              <div key={f.path} className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5">
                <AttachmentChip att={att} onOpen={() => setViewer(att)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{att.name}</div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">{att.path}</div>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmPath(f.path)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
      {confirmPath && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs">
          <p className="mb-2 text-foreground leading-relaxed">
            Remove <span className="font-mono text-destructive">{confirmPath}</span>? Slides that
            reference this path may break.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-md bg-destructive px-2 py-1 font-medium text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                removeUploadedFile(confirmPath);
                setConfirmPath(null);
              }}
            >
              Remove
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setConfirmPath(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <AttachmentLightbox att={viewer} onClose={() => setViewer(null)} />
    </div>
  );
}

export function resolveUserAttachment(
  att: SlideUserAttachment,
  files: { path: string; content: string }[],
): ViewableAttachment {
  return toViewable(hydrateAttachment(att, files));
}

export function PaperclipButton({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      title="Attach txt or image"
      aria-label="Attach file"
    >
      <Paperclip size={14} />
    </button>
  );
}
