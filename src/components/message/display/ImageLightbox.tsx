import { useState } from 'react';
import { XIcon, DownloadIcon, CopyIcon, CheckIcon, StarIcon } from 'lucide-react';
import { Btn } from '../../ui/Btn';
import { copyImageToClipboard } from '../utils/imageProcessing';
import type { ImageLightboxProps } from '../MessageBubble.types';

export function ImageLightbox({ src, favId, isFavorited, onToggleFavorite, onClose }: ImageLightboxProps) {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyImageToClipboard(src).then((ok) => {
      if (ok) {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 1500);
      }
    });
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let downloadUrl = src;
      let ext = 'png';

      if (src.startsWith('data:')) {
        const mimeMatch = src.match(/data:([^;]+);/);
        if (mimeMatch) {
          ext = mimeMatch[1].split('/')[1] || 'png';
        }
      } else {
        ext = src.split('.').pop()?.split('?')[0] || 'png';
        try {
          const res = await fetch(src);
          const blob = await res.blob();
          downloadUrl = URL.createObjectURL(blob);
        } catch (e) {
          console.error('Fetch failed, falling back to direct link', e);
        }
      }

      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `attachment-${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (downloadUrl.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100);
      }

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 1500);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center bg-background/95 backdrop-blur-2xl animate-in fade-in duration-300"
      onClick={onClose}
    >
      {/* Controls Overlay Header */}
      <div className="absolute inset-x-0 top-0 p-5 flex items-center justify-between z-10 bg-linear-to-b from-background to-transparent pointer-events-none">
        <div className="flex flex-col gap-0.5 pointer-events-auto">
          <span className="text-2xs font-black uppercase tracking-widest text-primary leading-none">
            Attachment Detail
          </span>
          <span className="text-sm font-bold text-foreground">Image Viewer</span>
        </div>
        <Btn
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="rounded-full bg-background/40 backdrop-blur-md border border-border/50 hover:bg-destructive/10 hover:text-destructive pointer-events-auto"
        >
          <XIcon size={20} />
        </Btn>
      </div>

      {/* Bottom Action Bar */}
      <div className="absolute inset-x-0 bottom-10 px-5 flex items-center justify-center gap-4 z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 p-1.5 bg-background/40 backdrop-blur-xl border border-white/5 rounded-lg pointer-events-auto shadow-2xl">
          {favId && onToggleFavorite && (
            <>
              <Btn
                variant="ghost"
                size="sm"
                className={`gap-2 ${isFavorited ? 'text-amber-500 bg-amber-500/10' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(favId);
                }}
              >
                <StarIcon size={14} fill={isFavorited ? 'currentColor' : 'none'} />
                {isFavorited ? 'Favorited' : 'Favorite'}
              </Btn>
              <div className="w-px h-4 bg-border/20 mx-1" />
            </>
          )}
          <Btn
            variant="ghost"
            size="sm"
            className={`gap-2 ${copySuccess ? 'text-green-500 bg-green-500/10' : ''}`}
            onClick={handleCopy}
          >
            {copySuccess ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
            {copySuccess ? 'Copied' : 'Copy'}
          </Btn>
          <div className="w-px h-4 bg-border/20 mx-1" />
          <Btn
            variant="ghost"
            size="sm"
            className={`gap-2 ${downloadSuccess ? 'text-primary bg-primary/10' : ''}`}
            onClick={handleDownload}
          >
            <DownloadIcon size={14} />
            {downloadSuccess ? 'Saving...' : 'Download'}
          </Btn>
        </div>
      </div>

      {/* Image Container */}
      <div
        className="max-w-[90vw] max-h-[75vh] relative animate-in zoom-in-95 duration-500"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt="Preview"
          className="w-full h-full object-contain rounded-lg shadow-[0_0_100px_rgba(var(--primary-rgb),0.2)] grayscale-0"
        />
      </div>
    </div>
  );
}
