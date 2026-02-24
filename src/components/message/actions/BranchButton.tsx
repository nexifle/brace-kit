import { GitBranchIcon } from 'lucide-react';
import { Btn } from '../../ui/Btn';

interface BranchButtonProps {
  messageIndex: number;
  onBranch: (index: number) => void;
}

export function BranchButton({ messageIndex, onBranch }: BranchButtonProps) {
  return (
    <Btn size="icon-sm" variant="ghost" onClick={() => onBranch(messageIndex)} title="Branch">
      <GitBranchIcon size={14} />
    </Btn>
  );
}
