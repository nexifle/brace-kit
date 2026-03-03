import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import fuzzysort from 'fuzzysort';
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
  DownloadIcon
} from 'lucide-react';
import { Btn } from './ui/Btn.tsx';
import { exportConversationToMarkdown, downloadMarkdown } from '../utils/exportMarkdown.ts';

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
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationsWithData, setConversationsWithData] = useState<ConversationWithMessages[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [pinnedCollapsed, setPinnedCollapsed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

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

  const handleExport = useCallback(async (conv: ConversationWithMessages, e: React.MouseEvent) => {
    e.stopPropagation();
    let messages = conv.messages;
    if (messages.length === 0) {
      const loaded = await getConversationMessages(conv.id);
      messages = loaded || [];
    }
    const markdown = exportConversationToMarkdown(conv, messages);
    const filename = `${conv.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    downloadMarkdown(filename, markdown);
  }, []);

  useEffect(() => {
    if (store.historyDrawerOpen) {
      setShouldRender(true);
      // Small delay to ensure animate-in triggers
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [store.historyDrawerOpen]);

  // Refactored: Only load full messages when searching to avoid memory limits
  useEffect(() => {
    if (!shouldRender) return;

    if (searchQuery.trim().length > 0) {
      // If there's a search query, fetch full messages for fuzzy search
      const loadMessagesForSearch = async () => {
        setIsLoading(true);
        const loaded: ConversationWithMessages[] = [];
        for (const conv of store.conversations) {
          try {
            let messagesOrNull = await getConversationMessages(conv.id);
            let messages: Message[] = [];
            if (messagesOrNull) {
              messages = messagesOrNull;
            }
            loaded.push({ ...conv, messages });
          } catch (e) {
            loaded.push({ ...conv, messages: [] });
          }
        }
        setConversationsWithData(loaded);
        setIsLoading(false);
      };

      const timeoutId = setTimeout(loadMessagesForSearch, 300); // Debounce search load
      return () => clearTimeout(timeoutId);
    } else {
      // If no search, just pass mapped metadata
      setConversationsWithData(store.conversations.map(c => ({ ...c, messages: [] })));
    }
  }, [shouldRender, store.conversations, searchQuery]);

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
    return result.highlight('<mark class="bg-primary/20 text-primary font-bold rounded-xs px-0.5">', '</mark>');
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

  if (!shouldRender) return null;

  const renderItem = (conv: ConversationWithMessages) => {
    const isBranched = !!conv.branchedFromId;
    const isHighlighted = highlightedIds.has(conv.id);
    const isActive = conv.id === store.activeConversationId;
    const isRenaming = renamingId === conv.id;
    const isStreamingConv = !!store.streamingConversations[conv.id];

    return (
      <div
        key={conv.id}
        className={`group/item relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all duration-200 
          ${isActive ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/40'}
          ${isHighlighted ? 'ring-2 ring-primary/40 bg-primary/5 animate-pulse' : ''}
          ${isRenaming ? 'bg-muted/30 ring-1 ring-border' : ''}`}
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

        <div className="absolute -right-px top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-all duration-200 bg-gradient-to-l from-card via-card/95 to-transparent from-0% via-60% to-100% pl-10 pr-3 py-1">
          <Btn
            variant="ghost"
            size="icon-sm"
            className={`h-6 w-6 ${conv.pinned ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-primary'}`}
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
              className="h-6 w-6 text-muted-foreground hover:text-primary"
              title="View Source"
              onClick={(e) => {
                e.stopPropagation();
                handleBranchIconClick(conv);
              }}
            >
              <ExternalLinkIcon size={12} />
            </Btn>
          )}
          <Btn
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            title="Export to Markdown"
            onClick={(e) => handleExport(conv, e)}
          >
            <DownloadIcon size={12} />
          </Btn>
          <Btn
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
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
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div
        className={`absolute inset-0 bg-background/60 backdrop-blur-sm transition-all duration-300 ${isVisible ? 'animate-in fade-in' : 'animate-out fade-out opacity-0'}`}
        onClick={() => store.setHistoryDrawerOpen(false)}
      />

      <div className={`relative w-2xs h-full bg-card/95 backdrop-blur-2xl border-l border-border/50 shadow-2xl flex flex-col transition-all duration-300 
        ${isVisible ? 'animate-in slide-in-from-right-full' : 'animate-out slide-out-to-right-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <div className="flex items-center justify-center w-7 h-7 bg-muted/50 rounded-lg text-muted-foreground">
              <HistoryIcon size={14} />
            </div>
            <span className="text-sm">History</span>
          </div>
          <Btn variant="ghost" size="icon-sm" onClick={() => store.setHistoryDrawerOpen(false)} className="rounded-full">
            <XIcon size={16} />
          </Btn>
        </div>

        <div className="p-3 flex flex-col flex-1 overflow-hidden">
          <div className="relative group mb-4">
            <SearchIcon size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input
              type="text"
              placeholder="Search chat history..."
              className="w-full bg-muted/40 border border-border/40 rounded-md pl-10 pr-10 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 transition-all outline-none focus:bg-muted/60 focus:border-primary/30 focus:ring-4 focus:ring-primary/5"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading}
            />
            {searchQuery && (
              <button
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted/80 transition-all"
                onClick={() => setSearchQuery('')}
              >
                <XIcon size={12} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin px-1 flex flex-col gap-4">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 animate-pulse">
                <HistoryIcon size={32} className="opacity-20" />
                <span className="text-xs font-bold uppercase tracking-widest opacity-40">Scanning...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <div className="w-12 h-12 bg-muted/30 rounded-full flex items-center justify-center">
                  <SearchIcon size={20} className="opacity-40" />
                </div>
                <span className="text-xs font-semibold opacity-60">
                  {searchQuery ? 'No results found' : 'No chat history yet'}
                </span>
              </div>
            ) : (
              grouped.map(({ group, convs }) => (
                <div key={group} className="flex flex-col gap-2">
                  <div
                    className={`flex items-center justify-between px-2 text-2xs font-bold uppercase tracking-[0.2em] mb-1 transition-all
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
      </div>
    </div>
  );
}
