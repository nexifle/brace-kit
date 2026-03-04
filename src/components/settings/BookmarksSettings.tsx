import { useState, useEffect, useRef } from 'react';
import { BookmarkIcon, SearchIcon, XIcon, ExternalLinkIcon, FolderIcon, LoaderIcon, BookmarkXIcon } from 'lucide-react';
import { useBookmarks } from '../../hooks/useBookmarks.ts';
import type { SmartBookmark } from '../../types/index.ts';

function BookmarkItem({ bookmark, relevance }: { bookmark: SmartBookmark; relevance?: string }) {
  return (
    <div className="flex flex-col gap-1 p-2.5 rounded-lg border border-border/50 hover:border-border hover:bg-accent/30 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug truncate" title={bookmark.title}>
            {bookmark.title || bookmark.url}
          </p>
          {bookmark.folderPath && (
            <div className="flex items-center gap-1 mt-0.5">
              <FolderIcon size={10} className="text-muted-foreground/60 shrink-0" />
              <span className="text-xs text-muted-foreground/60 truncate">{bookmark.folderPath}</span>
            </div>
          )}
        </div>
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Open bookmark"
        >
          <ExternalLinkIcon size={14} />
        </a>
      </div>
      <p className="text-xs text-muted-foreground/70 truncate" title={bookmark.url}>
        {bookmark.url}
      </p>
      {relevance && (
        <p className="text-xs text-primary/80 mt-0.5 leading-snug">{relevance}</p>
      )}
    </div>
  );
}

export function BookmarksSettings() {
  const {
    bookmarks,
    searchResults,
    isLoading,
    isSearching,
    error,
    enableBookmarkSearch,
    fetchBookmarks,
    searchBookmarks,
    clearSearch,
    setEnableBookmarkSearch,
  } = useBookmarks();

  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasFetchedRef = useRef(false);

  // Fetch bookmarks on first mount
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchBookmarks();
    }
  }, [fetchBookmarks]);

  // Debounced AI search on query change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      clearSearch();
      return;
    }

    debounceRef.current = setTimeout(() => {
      searchBookmarks(query);
    }, 600);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchBookmarks, clearSearch]);

  const isInSearchMode = query.trim().length > 0;
  const displayedBookmarks: SmartBookmark[] = isInSearchMode
    ? (searchResults?.map((r) => r.bookmark) ?? [])
    : bookmarks;

  const resultMap = new Map<string, string>(
    searchResults?.map((r) => [r.bookmark.id, r.relevance]) ?? []
  );

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <BookmarkIcon size={14} className="text-primary" />
            Smart Bookmarks
          </h3>
          <p className="text-xs text-muted-foreground">
            Search your Chrome bookmarks using AI. Ask in chat: &ldquo;find bookmarks about X&rdquo;
          </p>
        </div>
        <button
          onClick={() => setEnableBookmarkSearch(!enableBookmarkSearch)}
          className={`relative shrink-0 w-8 h-4 rounded-full transition-colors ${
            enableBookmarkSearch ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
          title={enableBookmarkSearch ? 'Disable bookmark search tool in chat' : 'Enable bookmark search tool in chat'}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
              enableBookmarkSearch ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {enableBookmarkSearch && (
        <p className="text-xs text-primary/70 -mt-1">
          AI can search your bookmarks during chat conversations.
        </p>
      )}

      {/* Search Bar */}
      <div className="relative">
        <SearchIcon
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bookmarks with AI…"
          className="w-full pl-8 pr-8 py-2 text-sm bg-background border border-border rounded-lg placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-colors"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <XIcon size={13} />
          </button>
        )}
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 -mt-1 text-xs text-muted-foreground/60">
        {isLoading && (
          <>
            <LoaderIcon size={11} className="animate-spin" />
            <span>Loading bookmarks…</span>
          </>
        )}
        {isSearching && (
          <>
            <LoaderIcon size={11} className="animate-spin text-primary/60" />
            <span className="text-primary/60">AI searching…</span>
          </>
        )}
        {!isLoading && !isSearching && !isInSearchMode && (
          <span>{bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}</span>
        )}
        {!isLoading && !isSearching && isInSearchMode && searchResults !== null && (
          <span>
            {searchResults.length === 0
              ? 'No relevant bookmarks found'
              : `${searchResults.length} relevant bookmark${searchResults.length !== 1 ? 's' : ''}`}
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 px-2.5 py-1.5 rounded-md">{error}</p>
      )}

      {/* Bookmark list */}
      {!isLoading && displayedBookmarks.length > 0 && (
        <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto custom-scrollbar pr-0.5">
          {displayedBookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark.id}
              bookmark={bookmark}
              relevance={resultMap.get(bookmark.id)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isSearching && displayedBookmarks.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <BookmarkXIcon size={24} className="text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground/50">
            {isInSearchMode && searchResults !== null
              ? 'No bookmarks match your query'
              : 'No bookmarks found in Chrome'}
          </p>
        </div>
      )}
    </section>
  );
}
