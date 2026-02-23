import { FileTextIcon, CopyIcon, DownloadIcon, CheckIcon } from 'lucide-react';
import type { Attachment } from '../../../types';

interface AttachmentsDisplayProps {
  attachments: Attachment[];
  onImageClick: (src: string) => void;
  onTextFileClick: (name: string, content: string) => void;
}

export function AttachmentsDisplay({ attachments, onImageClick, onTextFileClick }: AttachmentsDisplayProps) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {attachments.map((att, idx) =>
        att.type === 'image' ? (
          <div key={idx} className="relative rounded-sm overflow-hidden border border-border/50 group/att">
            <img
              src={att.data}
              alt={att.name}
              className="w-12 h-12 object-cover cursor-zoom-in"
              onClick={() => onImageClick(att.data)}
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none">
              <button
                className="att-image-btn att-image-copy-btn pointer-events-auto h-5 w-5 flex items-center justify-center bg-black/60 text-white rounded-xs hover:bg-primary transition-all group/btn"
                data-src={att.data}
                title="Copy image"
              >
                <div className="group-data-[state=success]/btn:hidden">
                  <CopyIcon size={10} strokeWidth={3} />
                </div>
                <div className="hidden group-data-[state=success]/btn:block text-green-400">
                  <CheckIcon size={10} strokeWidth={3} />
                </div>
              </button>
              <button
                className="att-image-btn att-image-download-btn pointer-events-auto h-5 w-5 flex items-center justify-center bg-black/60 text-white rounded-xs hover:bg-primary transition-all group/btn"
                data-src={att.data}
                data-name={att.name}
                title="Download image"
              >
                <div className="group-data-[state=success]/btn:hidden">
                  <DownloadIcon size={10} strokeWidth={3} />
                </div>
                <div className="hidden group-data-[state=success]/btn:block text-green-400">
                  <CheckIcon size={10} strokeWidth={3} />
                </div>
              </button>
            </div>
          </div>
        ) : (
          <button
            key={idx}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30 border border-border/50 rounded-sm hover:bg-muted/50 transition-all text-xs text-muted-foreground group/att"
            onClick={() => onTextFileClick(att.name, att.data)}
          >
            <FileTextIcon size={14} className="text-primary/60" />
            <span className="font-medium truncate max-w-[120px]">{att.name}</span>
          </button>
        )
      )}
    </div>
  );
}
