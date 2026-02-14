import { useStore } from '../store/index.ts';
import { formatTimeAgo } from '../utils/formatters.ts';

export function HistoryDrawer() {
  const store = useStore();

  if (!store.historyDrawerOpen) return null;

  const sorted = [...store.conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div id="history-drawer">
      <div className="history-drawer-backdrop" onClick={() => store.setHistoryDrawerOpen(false)} />
      <div className="history-drawer-panel">
        <div className="history-drawer-header">
          <h3>Chat History</h3>
          <button className="icon-btn" title="Close" onClick={() => store.setHistoryDrawerOpen(false)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div id="history-list" className="history-list">
          {sorted.length === 0 ? (
            <div className="history-empty">No conversations yet.</div>
          ) : (
            sorted.map((conv) => (
              <div
                key={conv.id}
                className={`history-item${conv.id === store.activeConversationId ? ' active' : ''}`}
              >
                <div
                  className="history-item-info"
                  onClick={() => store.switchConversation(conv.id)}
                >
                  <div className="history-item-title">{conv.title}</div>
                  <div className="history-item-time">{formatTimeAgo(conv.updatedAt)}</div>
                </div>
                <button
                  className="history-item-delete"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    store.deleteConversation(conv.id);
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
