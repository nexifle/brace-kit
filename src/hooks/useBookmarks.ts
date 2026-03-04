/**
 * useBookmarks Hook
 *
 * Provides access to Chrome bookmarks and AI-powered semantic search.
 * Communicates with the background service worker for Chrome API access.
 */

import { useState, useCallback, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { SmartBookmark, BookmarkSearchResult } from '../types/index.ts';

export function useBookmarks() {
  const store = useStore();

  const [bookmarks, setBookmarks] = useState<SmartBookmark[]>([]);
  const [searchResults, setSearchResults] = useState<BookmarkSearchResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generation counter to prevent stale search results from overwriting newer ones
  const searchGenRef = useRef(0);

  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'BOOKMARKS_GET_ALL' });
      if (response?.error) {
        setError(response.error as string);
      } else if (response?.bookmarks) {
        setBookmarks(response.bookmarks as SmartBookmark[]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchBookmarks = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults(null);
        return;
      }

      const gen = ++searchGenRef.current;
      setIsSearching(true);
      setError(null);
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'BOOKMARKS_SEARCH',
          query: query.trim(),
          providerConfig: store.providerConfig,
        });

        // Discard stale response if a newer search has started
        if (gen !== searchGenRef.current) return;

        if (response?.error) {
          setError(response.error as string);
          setSearchResults([]);
        } else if (response?.results) {
          setSearchResults(response.results as BookmarkSearchResult[]);
        }
      } catch (e) {
        if (gen !== searchGenRef.current) return;
        setError((e as Error).message);
        setSearchResults([]);
      } finally {
        if (gen === searchGenRef.current) {
          setIsSearching(false);
        }
      }
    },
    [store.providerConfig]
  );

  const clearSearch = useCallback(() => {
    searchGenRef.current++; // Invalidate any in-flight search
    setSearchResults(null);
    setError(null);
    setIsSearching(false);
  }, []);

  return {
    bookmarks,
    searchResults,
    isLoading,
    isSearching,
    error,
    enableBookmarkSearch: store.enableBookmarkSearch,
    fetchBookmarks,
    searchBookmarks,
    clearSearch,
    setEnableBookmarkSearch: store.setEnableBookmarkSearch,
  };
}
