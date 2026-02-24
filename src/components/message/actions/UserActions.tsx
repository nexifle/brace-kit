import { PencilIcon, RefreshCwIcon, GitBranchIcon } from 'lucide-react';
import { Btn } from '../../ui/Btn';
import { MessageCopyButton } from './CopyButton';
import type { UserActionsProps } from '../MessageBubble.types';

export function UserActions({
  content,
  messageIndex,
  isEditing,
  onEdit,
  onRegenerate,
  onBranch,
}: UserActionsProps) {
  if (isEditing) return null;

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 px-1 justify-end">
      <MessageCopyButton content={content} />
      {onEdit && (
        <Btn size="icon-sm" variant="ghost" onClick={onEdit} title="Edit">
          <PencilIcon size={14} />
        </Btn>
      )}
      {onRegenerate && messageIndex !== undefined && (
        <Btn size="icon-sm" variant="ghost" onClick={() => onRegenerate(messageIndex)} title="Regenerate">
          <RefreshCwIcon size={14} />
        </Btn>
      )}
      {onBranch && messageIndex !== undefined && (
        <Btn size="icon-sm" variant="ghost" onClick={() => onBranch(messageIndex)} title="Branch">
          <GitBranchIcon size={14} />
        </Btn>
      )}
    </div>
  );
}
