import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import fuzzysort from 'fuzzysort';
import type { Message, Conversation } from '../types/index.ts';

interface ConversationWithMessages {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  branchedFromId?: string;
  pinned?: boolean;
  messages: Message[];
}

type TimeGroup = 'pinned' | 'today' | 'yesterday' | 'last7' | 'last30' | 'older';

const GROUP_LABELS: Record<TimeGroup, string> = {
  pinned: 'Pinned',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 Days',
  last30: 'Last 30 Days',
  older: 'Older',
};

function getTimeGroup(conv: ConversationWithMessages): TimeGroup {
  if (conv.pinned) return 'pinned';
  const now = Date.now();
  const diff = now - conv.updatedAt;
  const day = 86400000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (conv.updatedAt >= todayStart.getTime()) return 'today';
  if (conv.updatedAt >= yesterdayStart.getTime()) return 'yesterday';
  if (diff < 7 * day) return 'last7';
  if (diff < 30 * day) return 'last30';
  return 'older';
}

export function HistoryDrawer() {
  const store = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationsWithData, setConversationsWithData] = useState<ConversationWithMessages[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);

  const branchRelations = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const conv of store.conversations) {
      if (conv.branchedFromId) {
        const arr = map.get(conv.branchedFromId) ?? [];
        arr.push(conv.id);
        map.set(conv.branchedFromId, arr);
      }
    }
    return map;
  }, [store.conversations]);

  const handleBranchIconClick = useCallback((conv: Conversation) => {
    const related = new Set<string>();
    related.add(conv.id);
    const parentId = conv.branchedFromId;
    if (parentId) {
      related.add(parentId);
      const siblings = branchRelations.get(parentId) ?? [];
      siblings.forEach((id) => related.add(id));
    }
    setHighlightedIds(related);
    if (parentId) store.switchConversation(parentId);
    setTimeout(() => setHighlightedIds(new Set()), 2000);
  }, [branchRelations, store]);

  useEffect(() => {
    if (!store.historyDrawerOpen) return;

    const loadConversations = async () => {
      setIsLoading(true);
      const loaded: ConversationWithMessages[] = [];

      for (const conv of store.conversations) {
        try {
          const data = await chrome.storage.local.get(`conv_${conv.id}`);
          loaded.push({ ...conv, messages: data[`conv_${conv.id}`] || [] });
        } catch (e) {
          console.warn('Failed to load conversation:', conv.id, e);
          loaded.push({ ...conv, messages: [] });
        }
      }

      setConversationsWithData(loaded);
      setIsLoading(false);
    };

    loadConversations();
  }, [store.historyDrawerOpen, store.conversations]);

  const sorted = useMemo(() => {
    return [...conversationsWithData].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [conversationsWithData]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sorted;

    const query = searchQuery.trim();

    const searchableItems = sorted.map((conv) => {
      const messageContent = conv.messages
        .map((m) => {
          const parts: string[] = [];
          if (m.content) parts.push(m.content);
          if (m.displayContent) parts.push(m.displayContent);
          if (m.pageContext?.content) parts.push(m.pageContext.content);
          if (m.pageContext?.pageTitle) parts.push(m.pageContext.pageTitle);
          if (m.selectedText?.selectedText) parts.push(m.selectedText.selectedText);
          return parts.join(' ');
        })
        .join(' ');

      return { conv, title: conv.title, content: messageContent };
    });

    const titleResults = fuzzysort.go(query, searchableItems, { key: 'title', threshold: -10000, limit: 100 });
    const contentResults = fuzzysort.go(query, searchableItems, { key: 'content', threshold: -10000, limit: 100 });

    const resultMap = new Map<string, { item: typeof searchableItems[0]; score: number }>();
    titleResults.forEach((r) => resultMap.set(r.obj.conv.id, { item: r.obj, score: r.score * 1.5 }));
    contentResults.forEach((r) => {
      const existing = resultMap.get(r.obj.conv.id);
      if (existing) existing.score = Math.max(existing.score, r.score);
      else resultMap.set(r.obj.conv.id, { item: r.obj, score: r.score });
    });

    return Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item.conv);
  }, [searchQuery, sorted]);

  const highlightMatch = (text: string, query: string): string => {
    if (!query.trim()) return text;
    const result = fuzzysort.single(query, text);
    if (!result) return text;
    return result.highlight('<mark>', '</mark>');
  };

  // Kelompokkan conversations berdasarkan time group
  const grouped = useMemo(() => {
    const order: TimeGroup[] = ['pinned', 'today', 'yesterday', 'last7', 'last30', 'older'];
    const map = new Map<TimeGroup, ConversationWithMessages[]>();
    for (const conv of filtered) {
      const group = getTimeGroup(conv);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(conv);
    }
    return order.filter((g) => map.has(g)).map((g) => ({ group: g, convs: map.get(g)! }));
  }, [filtered]);

  if (!store.historyDrawerOpen) return null;

  const renderItem = (conv: ConversationWithMessages) => {
    const isBranched = !!conv.branchedFromId;
    const isHighlighted = highlightedIds.has(conv.id);
    const isActive = conv.id === store.activeConversationId;

    return (
      <div
        key={conv.id}
        className={[
          'history-item',
          isActive ? 'active' : '',
          isHighlighted ? 'branch-highlight' : '',
        ].filter(Boolean).join(' ')}
        title={conv.title}
        onClick={() => store.switchConversation(conv.id)}
      >
        {isBranched && (
          <span className="history-item-branch-icon" title="Branch">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </span>
        )}
        <span
          className="history-item-title"
          dangerouslySetInnerHTML={{
            __html: searchQuery ? highlightMatch(conv.title, searchQuery) : conv.title,
          }}
        />
        <span className={`history-item-actions${conv.pinned ? ' has-pinned' : ''}`}>
          <button
            className={`history-item-pin${conv.pinned ? ' pinned' : ''}`}
            title={conv.pinned ? 'Unpin' : 'Pin'}
            onClick={(e) => {
              e.stopPropagation();
              store.togglePinConversation(conv.id);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill={conv.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="17" x2="12" y2="22"/>
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
            </svg>
          </button>
          {isBranched && (
            <button
              className="history-item-action-btn"
              title="Go to source conversation"
              onClick={(e) => {
                e.stopPropagation();
                handleBranchIconClick(conv);
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9"/>
                <path d="M21 3L9 15"/>
                <polyline points="9 3 3 3 3 21 21 21"/>
              </svg>
            </button>
          )}
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
        </span>
      </div>
    );
  };

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
        <div className="history-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            disabled={isLoading}
          />
          {searchQuery && (
            <button className="history-search-clear" onClick={() => setSearchQuery('')} title="Clear search">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <div id="history-list" className="history-list">
          {isLoading ? (
            <div className="history-empty">Loading conversations...</div>
          ) : filtered.length === 0 ? (
            <div className="history-empty">
              {searchQuery ? 'No conversations found.' : 'No conversations yet.'}
            </div>
          ) : (
            grouped.map(({ group, convs }) => (
              <div key={group} className="history-group">
                <button
                  className={`history-group-label${group === 'pinned' ? ' pinned' : ''}`}
                  onClick={() => group === 'pinned' && setPinnedCollapsed((v) => !v)}
                  style={{ cursor: group === 'pinned' ? 'pointer' : 'default' }}
                >
                  {group === 'pinned' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="17" x2="12" y2="22"/>
                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                    </svg>
                  )}
                  {GROUP_LABELS[group]}
                  {group === 'pinned' && (
                    <svg
                      className={`history-group-chevron${pinnedCollapsed ? ' collapsed' : ''}`}
                      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                    >
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  )}
                </button>
                {!(group === 'pinned' && pinnedCollapsed) && convs.map(renderItem)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
