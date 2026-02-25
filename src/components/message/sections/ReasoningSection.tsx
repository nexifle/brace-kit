import { useState } from 'react';
import { CheckIcon, ChevronRightIcon, RefreshCwIcon, BrainIcon } from 'lucide-react';
import type { ReasoningSectionProps } from '../MessageBubble.types';
import { cn } from '../../../utils/cn';

export function ReasoningSection({ content, isStreaming }: ReasoningSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-4 w-full flex flex-col gap-1 max-w-full self-start">
      <div className={cn('relative group transition-all duration-300', isExpanded ? 'px-3 py-2 dark:bg-muted bg-muted-foreground/5 backdrop-blur-md rounded-lg' : '')}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center gap-2"
        >
          <BrainIcon size={12} />
          Reasoning

          <div className="flex items-center gap-2">
            {isStreaming ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/15 border border-purple-500/20">
                <RefreshCwIcon size={10} className="text-purple-400 animate-spin" />
              </div>
            ) : (
              <ChevronRightIcon
                size={14}
                className={`text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}
              />
            )}
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
