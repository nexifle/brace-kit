import { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import { formatTimeAgo } from '../utils/formatters.ts';
import fuzzysort from 'fuzzysort';
import type { Message, Conversation } from '../types/index.ts';

interface ConversationWithMessages {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  branchedFromId?: string;
  messages: Message[];
}

export function HistoryDrawer() {
  const store = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationsWithData, setConversationsWithData] = useState<ConversationWithMessages[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Map dari branchedFromId ke list branch ids, untuk highlight relasi
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
    // Kumpulkan semua id yang berkaitan: conv itu sendiri + parent + semua sibling
    const related = new Set<string>();
    related.add(conv.id);

    const parentId = conv.branchedFromId;
    if (parentId) {
      related.add(parentId);
      // Semua branch dari parent yang sama
      const siblings = branchRelations.get(parentId) ?? [];
      siblings.forEach((id) => related.add(id));
    }

    setHighlightedIds(related);

    // Navigasi ke parent
    if (parentId) {
      store.switchConversation(parentId);
    }

    // Clear highlight setelah 2 detik
    setTimeout(() => setHighlightedIds(new Set()), 2000);
  }, [branchRelations, store]);

  // Load conversation messages when drawer opens
  useEffect(() => {
    if (!store.historyDrawerOpen) return;

    const loadConversations = async () => {
      setIsLoading(true);
      const loaded: ConversationWithMessages[] = [];

      for (const conv of store.conversations) {
        try {
          const data = await chrome.storage.local.get(`conv_${conv.id}`);
          const messages = data[`conv_${conv.id}`] || [];
          loaded.push({
            ...conv,
            messages,
          });
        } catch (e) {
          console.warn('Failed to load conversation:', conv.id, e);
          loaded.push({
            ...conv,
            messages: [],
          });
        }
      }

      setConversationsWithData(loaded);
      setIsLoading(false);
    };

    loadConversations();
  }, [store.historyDrawerOpen, store.conversations]);

  const sorted = useMemo(() => {
    return [...conversationsWithData].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [conversationsWithData]);

  // Fuzzy search using fuzzysort
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return sorted;

    const query = searchQuery.trim();

    // Prepare searchable items with combined text from title and all messages
    const searchableItems = sorted.map((conv) => {
      // Combine title and all message content for searching
      const messageContent = conv.messages
        .map((m) => {
          // Include content from different message fields
          const parts: string[] = [];
          if (m.content) parts.push(m.content);
          if (m.displayContent) parts.push(m.displayContent);
          if (m.pageContext?.content) parts.push(m.pageContext.content);
          if (m.pageContext?.pageTitle) parts.push(m.pageContext.pageTitle);
          if (m.selectedText?.selectedText) parts.push(m.selectedText.selectedText);
          return parts.join(' ');
        })
        .join(' ');

      return {
        conv,
        title: conv.title,
        content: messageContent,
        combined: `${conv.title} ${messageContent}`,
      };
    });

    // Search in title (higher priority) and content
    const titleResults = fuzzysort.go(query, searchableItems, {
      key: 'title',
      threshold: -10000,
      limit: 100,
    });

    const contentResults = fuzzysort.go(query, searchableItems, {
      key: 'content',
      threshold: -10000,
      limit: 100,
    });

    // Merge results, prioritizing title matches
    const resultMap = new Map<string, { item: typeof searchableItems[0]; score: number }>();

    // Title matches get higher priority (lower score = better match)
    titleResults.forEach((result) => {
      resultMap.set(result.obj.conv.id, { item: result.obj, score: result.score * 1.5 }); // Boost title matches
    });

    // Add content matches
    contentResults.forEach((result) => {
      const existing = resultMap.get(result.obj.conv.id);
      if (existing) {
        // If already in map from title, combine scores
        existing.score = Math.max(existing.score, result.score);
      } else {
        resultMap.set(result.obj.conv.id, { item: result.obj, score: result.score });
      }
    });

    // Convert to array and sort by score (higher is better for fuzzysort)
    const mergedResults = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score)
      .map((r) => r.item.conv);

    return mergedResults;
  }, [searchQuery, sorted]);

  // Highlight matched text
  const highlightMatch = (text: string, query: string): string => {
    if (!query.trim()) return text;
    const result = fuzzysort.single(query, text);
    if (!result) return text;
    return result.highlight('<mark>', '</mark>');
  };

  if (!store.historyDrawerOpen) return null;

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
            <button
              className="history-search-clear"
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
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
            filtered.map((conv) => {
              const isBranched = !!conv.branchedFromId;
              const isHighlighted = highlightedIds.has(conv.id);

              return (
                <div
                  key={conv.id}
                  className={[
                    'history-item',
                    conv.id === store.activeConversationId ? 'active' : '',
                    isHighlighted ? 'branch-highlight' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div
                    className="history-item-info"
                    onClick={() => store.switchConversation(conv.id)}
                  >
                    <div className="history-item-title-row">
                      <div
                        className="history-item-title"
                        dangerouslySetInnerHTML={{
                          __html: searchQuery
                            ? highlightMatch(conv.title, searchQuery)
                            : conv.title,
                        }}
                      />
                      {isBranched && (
                        <span className="branch-badge" title={`Branched from another conversation`}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="6" y1="3" x2="6" y2="15"/>
                            <circle cx="18" cy="6" r="3"/>
                            <circle cx="6" cy="18" r="3"/>
                            <path d="M18 9a9 9 0 0 1-9 9"/>
                          </svg>
                          Branch
                        </span>
                      )}
                    </div>
                    <div className="history-item-time">{formatTimeAgo(conv.updatedAt)}</div>
                  </div>
                  {isBranched && (
                    <button
                      className="history-item-branch-link"
                      title="Go to source conversation"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBranchIconClick(conv);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="6" y1="3" x2="6" y2="15"/>
                        <circle cx="18" cy="6" r="3"/>
                        <circle cx="6" cy="18" r="3"/>
                        <path d="M18 9a9 9 0 0 1-9 9"/>
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
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
