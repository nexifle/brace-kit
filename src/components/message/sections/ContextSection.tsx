import { GlobeIcon } from 'lucide-react';
import type { ContextSectionProps } from '../MessageBubble.types';

export function ContextSection({ context }: ContextSectionProps) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 my-2.5 bg-black/20 border border-white/5 rounded-md mt-4">
      <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-sm text-primary shrink-0">
        <GlobeIcon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-foreground truncate uppercase tracking-tight">
          {context.pageTitle}
        </div>
        <div className="text-2xs text-muted-foreground truncate opacity-70 mt-0.5">{context.pageUrl}</div>
      </div>
    </div>
  );
}
