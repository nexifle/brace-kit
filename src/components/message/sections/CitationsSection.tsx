import { GlobeIcon } from 'lucide-react';
import type { CitationsSectionProps } from '../MessageBubble.types';

export function CitationsSection({ groundingMetadata }: CitationsSectionProps) {
  const groundingChunks = groundingMetadata?.groundingChunks;

  if (!groundingChunks || groundingChunks.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-3 border-t border-border pb-4">
      <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
        <GlobeIcon size={10} />
        Sources
      </div>
      <div className="flex flex-wrap gap-1">
        {groundingChunks.map((chunk, idx) =>
          chunk.web ? (
            <a
              key={idx}
              href={chunk.web.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 bg-muted/20 border border-border/40 rounded-sm text-xs text-muted-foreground hover:bg-muted/40 hover:text-primary transition-all"
            >
              <span className="font-bold text-primary/60">[{idx + 1}]</span>
              <span className="max-w-[140px] truncate">
                {chunk.web.title || new URL(chunk.web.uri).hostname}
              </span>
            </a>
          ) : null
        )}
      </div>
    </div>
  );
}
