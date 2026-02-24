import { FileTextIcon } from 'lucide-react';
import type { SelectionSectionProps } from '../MessageBubble.types';

export function SelectionSection({ selection }: SelectionSectionProps) {
  const displayText =
    selection.selectedText.length > 100
      ? `${selection.selectedText.substring(0, 100)}...`
      : selection.selectedText;

  return (
    <div className="flex items-start gap-2.5 px-3 py-2 my-2.5 bg-black/20 border border-white/5 rounded-md">
      <div className="flex items-center justify-center w-8 h-8 bg-purple-500/10 rounded-sm text-purple-400 shrink-0">
        <FileTextIcon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
          "{displayText}"
        </div>
      </div>
    </div>
  );
}
