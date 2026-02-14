import { usePageContext } from '../hooks/usePageContext.ts';

export function SelectionPreview() {
  const { selectedText, clearSelection } = usePageContext();

  if (!selectedText) return null;

  const displayText = selectedText.selectedText.length > 80
    ? selectedText.selectedText.substring(0, 80) + '...'
    : selectedText.selectedText;

  return (
    <div id="selection-preview">
      <div className="selection-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
        </svg>
        <span id="selection-text">{displayText}</span>
      </div>
      <button className="context-clear" onClick={clearSelection} title="Remove selection">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
