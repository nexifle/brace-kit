import { StarIcon, CopyIcon, DownloadIcon } from 'lucide-react';
import type { ImagesSectionProps } from '../MessageBubble.types';
import { copyImageToClipboard } from '../utils/imageProcessing';

export function ImagesSection({
  images,
  messageIndex,
  onImageClick,
  onToggleFavorite,
  favorites,
  activeConversationId,
}: ImagesSectionProps) {
  return (
    <div className="flex flex-wrap gap-2 mb-3">
      {images.map((img, idx) => {
        const src = `data:${img.mimeType};base64,${img.data}`;
        const imageKey =
          img.imageRef || (activeConversationId ? `img_${activeConversationId}_${messageIndex}_${idx}` : '');
        const favId = `db:${imageKey}`;
        const isFavorited = favorites.has(favId);

        return (
          <div
            key={idx}
            className="group/img w-full relative rounded-md overflow-hidden border border-border/50 shadow-md transition-transform hover:scale-[1.02]"
          >
            <img src={src} alt="Generated" className="my-0! w-full cursor-zoom-in" onClick={() => onImageClick(src)} />
            {isFavorited && (
              <div className="absolute top-2.5 left-2.5 p-1.5 bg-amber-500 rounded-lg shadow-lg shadow-amber-500/40 z-10 animate-in zoom-in-50 duration-300">
                <StarIcon size={12} fill="white" className="text-white" />
              </div>
            )}
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
              <button
                className={`h-6 w-6 flex items-center justify-center backdrop-blur-md rounded-sm transition-all
                  ${isFavorited ? 'bg-amber-500 text-white' : 'bg-black/60 text-white hover:bg-primary'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(favId);
                }}
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
              >
                <StarIcon size={12} fill={isFavorited ? 'currentColor' : 'none'} />
              </button>
              <button
                className="h-6 w-6 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  copyImageToClipboard(src);
                }}
                title="Copy"
              >
                <CopyIcon size={12} />
              </button>
              <button
                className="h-6 w-6 flex items-center justify-center bg-black/60 backdrop-blur-md text-white rounded-sm hover:bg-primary transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  const a = document.createElement('a');
                  a.href = src;
                  a.download = `generated-${Date.now()}.${img.mimeType.split('/')[1] || 'png'}`;
                  a.click();
                }}
                title="Download"
              >
                <DownloadIcon size={12} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
