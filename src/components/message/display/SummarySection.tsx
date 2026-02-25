import { ChevronRightIcon } from 'lucide-react';
import { renderMarkdown } from '../../../utils/markdown';
import type { SummarySectionProps } from '../MessageBubble.types';

export function SummarySection({ summary, isExpanded, onToggle }: SummarySectionProps) {
  return (
    <div className="py-1">
      <div
        className="flex items-center gap-2 text-sm font-semibold text-text-muted cursor-pointer select-none transition-colors duration-200 hover:text-muted-foreground"
        onClick={onToggle}
      >
        <ChevronRightIcon
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        />
        History Memory
      </div>
      {isExpanded && (
        <div
          className="leading-normal max-h-[250px] overflow-y-auto text-text-default pt-0 pb-1 mt-3 border-t border-border"
          // Note: renderMarkdown sanitizes content internally
          dangerouslySetInnerHTML={{ __html: renderMarkdown(summary, false) }}
        />
      )}
    </div>
  );
}
