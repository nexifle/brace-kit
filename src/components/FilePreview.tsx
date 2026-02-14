import { useFileAttachments } from '../hooks/useFileAttachments.ts';
import { escapeHtml } from '../utils/markdown.ts';

export function FilePreview() {
  const { attachments, removeAttachment, clearAllAttachments } = useFileAttachments();

  if (attachments.length === 0) return null;

  return (
    <div id="file-preview">
      <div className="file-preview-list">
        {attachments.map((att) => (
          <div key={att.id} className={`file-preview-item ${att.type}`}>
            {att.type === 'error' ? (
              <>
                <div className="file-info">
                  <span className="file-error">{escapeHtml(att.name)}: {att.error}</span>
                </div>
                <button
                  className="file-remove"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </>
            ) : att.type === 'image' ? (
              <>
                <img src={att.data} alt={att.name} />
                <div className="file-info">
                  <span className="file-name">{escapeHtml(att.name)}</span>
                </div>
                <button
                  className="file-remove"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </>
            ) : (
              <>
                <div className="file-info">
                  <span>{att.type === 'pdf' ? '📄' : '📃'}</span>
                  <span className="file-name">{escapeHtml(att.name)}</span>
                </div>
                <button
                  className="file-remove"
                  onClick={() => removeAttachment(att.id)}
                  title="Remove"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <button className="context-clear" onClick={clearAllAttachments} title="Remove all files">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}
