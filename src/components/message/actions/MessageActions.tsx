import type { MessageActionsProps } from '../MessageBubble.types';
import { MessageCopyButton } from './CopyButton';
import { BranchButton } from './BranchButton';

export function MessageActions({ content, messageIndex, onBranch }: MessageActionsProps) {
  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 px-1">
      <MessageCopyButton content={content} />
      {onBranch && messageIndex !== undefined && <BranchButton messageIndex={messageIndex} onBranch={onBranch} />}
    </div>
  );
}
