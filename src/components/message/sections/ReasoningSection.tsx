import { useState } from 'react';
import { CheckIcon, ChevronRightIcon, RefreshCwIcon, BrainIcon } from 'lucide-react';
import type { ReasoningSectionProps } from '../MessageBubble.types';

export function ReasoningSection({ content, isStreaming }: ReasoningSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-4 w-full flex flex-col gap-1 max-w-full self-start mb-2">
      <div className="relative group px-3 py-2 dark:bg-muted bg-muted-foreground/5 backdrop-blur-md border rounded-lg transition-all duration-300">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isStreaming ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-500/15 text-purple-400'
              }`}
            >
              <BrainIcon size={12} />
            </div>
            <div className="flex flex-col gap-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-foreground/80 leading-none">
                Reasoning
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/15 border border-purple-500/20">
                <RefreshCwIcon size={10} className="text-purple-400 animate-spin" />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 border border-success/20">
                <CheckIcon size={10} className="text-success" />
              </div>
            )}
            <ChevronRightIcon
              size={14}
              className={`text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
            />
          </div>
        </button>

        {isExpanded && (
          <div className="mt-2">
            <div className="text-xs my-0! font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto scrollbar-thin text-muted-foreground leading-relaxed">
              {content}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
