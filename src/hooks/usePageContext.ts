import { useCallback, useEffect } from 'react';
import { useStore } from '../store/index.ts';
import type { PageContext, SelectedText } from '../types/index.ts';

export function usePageContext() {
  const store = useStore();

  const attachPageContext = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });
      if (response?.error) {
        store.addMessage({ role: 'error', content: `Failed to read page: ${response.error}` });
        return;
      }
      store.setPageContext(response as PageContext);
    } catch (e) {
      store.addMessage({ role: 'error', content: `Failed to read page: ${(e as Error).message}` });
    }
  }, [store]);

  const clearPageContext = useCallback(() => {
    store.setPageContext(null);
  }, [store]);

  const grabSelection = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' });
      if (response?.selectedText) {
        store.setSelectedText(response as SelectedText);
      } else {
        store.addMessage({ role: 'error', content: 'No text selected on the page. Highlight some text first.' });
      }
    } catch (e) {
      store.addMessage({ role: 'error', content: `Failed to grab selection: ${(e as Error).message}` });
    }
  }, [store]);

  const clearSelection = useCallback(() => {
    store.setSelectedText(null);
  }, [store]);

  // Listen for text selection from content script
  useEffect(() => {
    const listener = (message: { type: string; data?: SelectedText }) => {
      if (message.type === 'SELECTION_UPDATED' || message.type === 'CONTEXT_MENU_SELECTION') {
        if (message.data) {
          store.setSelectedText(message.data);
        }
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [store]);

  return {
    pageContext: store.pageContext,
    selectedText: store.selectedText,
    attachPageContext,
    clearPageContext,
    grabSelection,
    clearSelection,
  };
}
