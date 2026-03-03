import { RefreshCwIcon } from 'lucide-react';

/**
 * ImageGenerationIndicator - Loading state for image generation models.
 * Shows a pulsing placeholder with shimmer animation while waiting for image.
 */
export function ImageGenerationIndicator() {
  return (
    <div className="mt-2 h-40 w-full rounded-md bg-muted/30 animate-pulse flex items-center justify-center relative overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-r from-transparent via-primary/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
      <div className="text-xs font-medium text-muted-foreground flex flex-col items-center gap-2">
        <RefreshCwIcon size={16} className="animate-spin text-primary/60" />
        Generating image...
      </div>
    </div>
  );
}
