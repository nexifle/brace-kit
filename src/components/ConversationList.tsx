import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import { fuzzySearchMulti, fuzzyHighlight } from '../utils/fuzzySearch.ts';
import type { Message, Conversation } from '../types/index.ts';
import { getConversationMessages } from '../utils/conversationDB.ts';
import {
  XIcon,
  SearchIcon,
  PinIcon,
  Trash2Icon,
  ChevronRightIcon,
  HistoryIcon,
  GitBranchIcon,
  ExternalLinkIcon,
} from 'lucide-react';
import { Btn } from './ui/Btn.tsx';
import { ExportMenu } from './ExportMenu.tsx';

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

interface SearchableItem {
  conv: ConversationWithMessages;
  title: string;
  content: string;
}

const MAX_SEARCHABLE_CONTENT = 3000;
const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_INDEX_NOTIFY_BATCH_SIZE = 5;

function buildSearchableContent(messages: Message[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const m of messages) {
    if (total >= MAX_SEARCHABLE_CONTENT) break;
    const chunks = [m.content, m.displayContent, m.pageContext?.content, m.pageContext?.pageTitle, m.selectedText?.selectedText];
    for (const chunk of chunks) {
      if (!chunk) continue;
      if (total + chunk.length > MAX_SEARCHABLE_CONTENT) {
        parts.push(chunk.slice(0, MAX_SEARCHABLE_CONTENT - total));
        return parts.join(' ');
      }
      parts.push(chunk);
      total += chunk.length;
    }
  }
  return parts.join(' ');
}

// Only re-read a conversation's messages when its metadata actually changed.
// Prevents re-fetching every conversation from IndexedDB on every store update.
function needsSearchRefresh(conv: Conversation, existing?: SearchableItem): boolean {
  if (!existing) return true;
  return (
    existing.conv.updatedAt !== conv.updatedAt ||
    existing.conv.title !== conv.title ||
    existing.conv.pinned !== conv.pinned ||
    existing.conv.branchedFromId !== conv.branchedFromId
  );
}

export function ConversationList() {
  const store = useStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // Bumped in batches while the search index is being built so the list stays
  // responsive instead of re-rendering (and re-sorting) on every single fetch.
  const [searchIndexVersion, setSearchIndexVersion] = useState(0);
  const renameInputRef = useRef<HTMLInputElement>(null);
  // Which conversation's export menu is open (keeps its row visible while open)
  const [exportMenuFor, setExportMenuFor] = useState<string | null>(null);

  // Cache: store messages + pre-built searchable strings, survive across search changes
  const messagesCacheRef = useRef<Map<string, Message[]>>(new Map());
  const searchableRef = useRef<Map<string, SearchableItem>>(new Map());
  const indexingRunRef = useRef(0);
  const isIndexingRef = useRef(false);
  // Set when a store change arrives while an indexing pass is running, so the
  // finished pass re-checks for conversations it may have missed mid-run.
  const reindexQueuedRef = useRef(false);

  // Debounced search query — prevents main-thread thrashing on every keystroke
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSwitchConversation = (id: string) => {
    if (id === store.activeConversationId) return;
    // Switch directly – active streams continue running in background
    store.switchConversation(id);
  };

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

  const startRename = useCallback((conv: ConversationWithMessages) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
    setTimeout(() => renameInputRef.current?.select(), 0);
  }, []);

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      store.updateConversationTitle(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, store]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

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

  // Sorted list derived directly from the store + message cache. Recomputes only
  // when conversations change or the search index version bumps (batched).
  const sorted = useMemo(() => {
    return [...store.conversations]
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      })
      .map((conv) => ({
        ...conv,
        messages: messagesCacheRef.current.get(conv.id) ?? [],
      }));
  }, [searchIndexVersion, store.conversations]);

  // Incrementally index conversations during idle time (requestIdleCallback),
  // one at a time, yielding to the main thread between each. This keeps the UI
  // responsive even with hundreds/thousands of conversations instead of
  // eagerly batch-loading all messages up front.
  const ensureSearchData = useCallback((conversations: Conversation[]) => {
    if (isIndexingRef.current) {
      // A pass is already running — flag it so the completed pass re-checks
      // with the freshest conversation list (changes may have arrived mid-run).
      reindexQueuedRef.current = true;
      return;
    }

    const missing = conversations.filter((conv) => needsSearchRefresh(conv, searchableRef.current.get(conv.id)));
    if (missing.length === 0) {
      setIsLoading(false);
      return;
    }

    isIndexingRef.current = true;
    const runId = ++indexingRunRef.current;
    const cache = messagesCacheRef.current;
    const searchable = searchableRef.current;
    let processedSinceNotify = 0;
    setIsLoading(true);

    const scheduleNext = (cb: () => void) => {
      const requestIdle = window.requestIdleCallback as
        | ((callback: IdleRequestCallback, options?: IdleRequestOptions) => number)
        | undefined;
      if (requestIdle) {
        requestIdle(() => cb(), { timeout: 100 });
        return;
      }
      window.setTimeout(cb, 0);
    };

    const step = async (index: number) => {
      if (index >= missing.length || runId !== indexingRunRef.current) {
        isIndexingRef.current = false;
        setIsLoading(false);
        if (processedSinceNotify > 0) {
          setSearchIndexVersion((v) => v + 1);
        }
        if (reindexQueuedRef.current) {
          reindexQueuedRef.current = false;
          scheduleNext(() => {
            ensureSearchData(useStore.getState().conversations);
          });
        }
        return;
      }

      const conv = missing[index];
      const existing = searchable.get(conv.id);
      const needsMessageReload = !existing || existing.conv.updatedAt !== conv.updatedAt;
      let messages = needsMessageReload ? undefined : cache.get(conv.id);
      if (!messages) {
        try {
          messages = (await getConversationMessages(conv.id)) ?? [];
        } catch {
          messages = [];
        }
        cache.set(conv.id, messages);
      }

      searchable.set(conv.id, {
        conv: { ...conv, messages },
        title: conv.title,
        content: buildSearchableContent(messages),
      });
      processedSinceNotify += 1;

      if (processedSinceNotify >= SEARCH_INDEX_NOTIFY_BATCH_SIZE || debouncedQuery.trim()) {
        processedSinceNotify = 0;
        setSearchIndexVersion((v) => v + 1);
      }

      scheduleNext(() => {
        void step(index + 1);
      });
    };

    scheduleNext(() => {
      void step(0);
    });
  }, [debouncedQuery]);

  useEffect(() => {
    ensureSearchData(store.conversations);
  }, [ensureSearchData, store.conversations]);

  // Reset all caches when unmounting (drawer close / rail unmount).
  useEffect(() => {
    return () => {
      messagesCacheRef.current.clear();
      searchableRef.current.clear();
      indexingRunRef.current += 1;
      isIndexingRef.current = false;
      reindexQueuedRef.current = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!debouncedQuery.trim()) return sorted;

    const query = debouncedQuery.trim();
    const sortedIds = new Set(sorted.map(c => c.id));
    // Fuzzy search only over what has been indexed so far.
    const indexedItems = Array.from(searchableRef.current.values()).filter((item) => sortedIds.has(item.conv.id));
    const indexedResults = fuzzySearchMulti<SearchableItem>(indexedItems, query, [
      { key: 'title', weight: 1.5 },
      { key: 'content' },
    ], {
      getId: (item) => item.conv.id,
      threshold: -10000,
      limit: 100,
      shortQueryFallback: (items, q) => {
        const lower = q.toLowerCase();
        return items.filter(item => item.title.toLowerCase().includes(lower));
      },
    }).map(item => item.conv);

    // Title fallback for conversations not yet indexed — keeps search instantly
    // responsive while the idle indexer is still running.
    const indexedResultIds = new Set(indexedResults.map((conv) => conv.id));
    const titleFallback = sorted.filter((conv) => {
      if (indexedResultIds.has(conv.id)) return false;
      return conv.title.toLowerCase().includes(query.toLowerCase());
    });

    return [...indexedResults, ...titleFallback];
  }, [debouncedQuery, searchIndexVersion, sorted]);

  const highlightMatch = (text: string, query: string): string => {
    return fuzzyHighlight(text, query, '<mark class="bg-primary/20 text-primary font-bold rounded-xs">', '</mark>');
  };

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

  const renderItem = (conv: ConversationWithMessages) => {
    const isBranched = !!conv.branchedFromId;
    const isHighlighted = highlightedIds.has(conv.id);
    const isActive = conv.id === store.activeConversationId;
    const isRenaming = renamingId === conv.id;
    const isStreamingConv = !!store.streamingConversations[conv.id];

    return (
      <div
        key={conv.id}
        className={`group/item relative flex items-center gap-2 px-2.5 py-1.5 rounded-none cursor-pointer transition-all duration-200
          ${isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/40'}
          ${isHighlighted ? 'ring-2 ring-primary/40 bg-primary/5 animate-pulse' : ''}
          ${isRenaming ? 'bg-muted/30 ring-1 ring-border' : ''}`}
        style={{ contentVisibility: 'auto', containIntrinsicSize: '0 36px' }}
        onClick={() => !isRenaming && handleSwitchConversation(conv.id)}
        onDoubleClick={() => !isRenaming && startRename(conv)}
      >
        <div className="w-full min-w-0 overflow-hidden">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              className="w-full bg-transparent border-none outline-none text-sm font-medium py-0"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                else if (e.key === 'Escape') cancelRename();
              }}
              onBlur={commitRename}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-2 w-full">
              {isBranched && (
                <GitBranchIcon size={12} className="text-muted-foreground/50 shrink-0" />
              )}
              {isStreamingConv && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0"
                  title="Generating response…"
                />
              )}
              <span
                className={`text-sm truncate w-full ${isActive ? 'text-primary font-semibold' : 'text-foreground'}`}
                dangerouslySetInnerHTML={{
                  __html: searchQuery ? highlightMatch(conv.title, searchQuery) : conv.title,
                }}
              />
            </div>
          )}
        </div>

        <div className={`absolute -right-px top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-gradient-to-l from-card via-card/95 to-transparent from-0% via-60% to-100% pl-10 pr-3 py-1 transition-all duration-200 ${exportMenuFor === conv.id ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100'}`}>
          <Btn
            variant="ghost"
            size="icon-sm"
            className={`h-6 w-6 rounded-none ${conv.pinned ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
            title={conv.pinned ? 'Unpin' : 'Pin'}
            onClick={(e) => {
              e.stopPropagation();
              store.togglePinConversation(conv.id);
            }}
          >
            <PinIcon size={12} fill={conv.pinned ? 'currentColor' : 'none'} className={conv.pinned ? '' : 'rotate-45'} />
          </Btn>
          {isBranched && (
            <Btn
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 rounded-none text-muted-foreground hover:text-primary"
              title="View Source"
              onClick={(e) => {
                e.stopPropagation();
                handleBranchIconClick(conv);
              }}
            >
              <ExternalLinkIcon size={12} />
            </Btn>
          )}
          <ExportMenu
            conversation={conv}
            messages={conv.messages}
            open={exportMenuFor === conv.id}
            onOpenChange={(o) => setExportMenuFor(o ? conv.id : null)}
          />
          <Btn
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 rounded-none text-muted-foreground hover:text-destructive"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              store.deleteConversation(conv.id);
            }}
          >
            <Trash2Icon size={12} />
          </Btn>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="relative group mb-3 shrink-0">
        <SearchIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <input
          type="text"
          placeholder="Search chat history..."
          className="w-full bg-muted/40 border border-border/40 rounded-none pl-10 pr-10 py-2 text-xs text-foreground placeholder:text-muted-foreground/50 transition-all outline-none focus:bg-muted/60 focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-none hover:bg-muted/80 transition-all"
            onClick={() => setSearchQuery('')}
          >
            <XIcon size={12} />
          </button>
        )}
      </div>
      {isLoading && searchQuery.trim() && (
        <div className="text-2xs text-muted-foreground/60 mb-2 px-1">
          Indexing messages for search...
        </div>
      )}

      <div className="flex-1 overflow-y-auto scrollbar-thin px-1 flex flex-col gap-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <div className="w-12 h-12 bg-muted/30 rounded-none flex items-center justify-center">
              <HistoryIcon size={20} className="opacity-40" />
            </div>
            <span className="text-xs font-semibold opacity-60">
              {searchQuery ? 'No results found' : 'No chat history yet'}
            </span>
          </div>
        ) : (
          grouped.map(({ group, convs }) => (
            <div key={group} className="flex flex-col gap-1">
              <div
                className={`flex items-center justify-between px-2 text-2xs font-bold uppercase tracking-[0.2em] mb-0.5 transition-all
                  ${group === 'pinned' ? 'text-primary' : 'text-muted-foreground/60'}`}
              >
                <div className="flex items-center gap-2">
                  {group === 'pinned' && <PinIcon size={10} fill="currentColor" />}
                  <span>{GROUP_LABELS[group]}</span>
                </div>
                {group === 'pinned' && (
                  <button
                    onClick={() => setPinnedCollapsed(!pinnedCollapsed)}
                    className="hover:text-primary transition-colors p-1"
                  >
                    <ChevronRightIcon size={12} className={`transition-transform duration-300 ${pinnedCollapsed ? '' : 'rotate-90'}`} />
                  </button>
                )}
              </div>

              {!(group === 'pinned' && pinnedCollapsed) && (
                <div className="flex flex-col gap-0.5">
                  {convs.map(renderItem)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
