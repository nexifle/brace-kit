import { useState } from 'react';

interface ToolMessageProps {
  name: string;
  content: string;
  toolCallId?: string;
}

export function ToolMessage({ name, content, toolCallId }: ToolMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isCalling = content === '⏳ Calling...';
  const isError = content.startsWith('Error:');
  const status = isCalling ? 'calling' : isError ? 'error' : 'result';
  const statusIcon = isCalling ? '⏳' : isError ? '❌' : '✅';

  return (
    <div className="message tool">
      <div className="message-bubble">
        <div className="tool-header">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
          </svg>
          {statusIcon} {name}
        </div>
        {!isCalling && (
          <details className={`tool-result ${isError ? 'error' : 'success'}`} open={isExpanded} onToggle={(e) => setIsExpanded((e.target as HTMLDetailsElement).open)}>
            <summary>{content.length > 80 ? content.slice(0, 80) + '…' : content}</summary>
            <div className="tool-result-content">{content}</div>
          </details>
        )}
      </div>
    </div>
  );
}
