/**
 * Omnibox Handler - Handles Chrome address bar quick search (keyword: "bk")
 * @module background/handlers/omnibox
 */

import { getAllConversationMetadata } from '../../utils/conversationDB';

// Max conversation suggestions shown below the "Ask AI" item
const MAX_CONV_SUGGESTIONS = 4;

/**
 * Escape special XML characters in omnibox description strings.
 * Chrome's omnibox description is XML-like and will throw on unescaped &, <, >.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send the omnibox command to the sidebar after it has had time to mount.
 */
function sendCommand(query: string): void {
  if (query.startsWith('switch:')) {
    chrome.runtime.sendMessage({
      type: 'OMNIBOX_SWITCH_CONVERSATION',
      conversationId: query.slice('switch:'.length),
    });
  } else {
    // Either "ask:<query>" prefix (from suggestion) or raw text (Enter pressed)
    const chatQuery = query.startsWith('ask:') ? query.slice('ask:'.length) : query;
    chrome.runtime.sendMessage({ type: 'OMNIBOX_NEW_CHAT', query: chatQuery });
  }
}

/**
 * @param getLastTabId - Returns the most recently active tab ID. The ID is
 *   cached by the background service worker so that sidePanel.open() can be
 *   called synchronously (without an async tabs.query() first), which is
 *   required to preserve the user gesture context.
 * @param setLastTabId - Updates the cached tab ID. Used to pre-populate the
 *   cache during onInputChanged so that onInputEntered always has a valid ID
 *   even after a service worker restart (where onActivated hasn't fired yet).
 */
export function initOmniboxHandler(
  getLastTabId: () => number | undefined,
  setLastTabId: (id: number) => void,
): void {
  // Default suggestion shown when user first activates the keyword
  chrome.omnibox.setDefaultSuggestion({
    description: 'Ask BraceKit AI or search your conversation history',
  });

  // Provide suggestions as the user types.
  // IMPORTANT: Chrome omnibox onInputChanged does NOT support async callbacks —
  // suggest() must be called, but an async function returns a Promise which Chrome
  // ignores. Use .then() to call suggest() after the async work resolves.
  chrome.omnibox.onInputChanged.addListener(
    (text: string, suggest: (results: chrome.omnibox.SuggestResult[]) => void) => {
      // Pre-populate the tab ID cache here (async is fine — this runs before
      // the user finishes typing) so that onInputEntered can call
      // sidePanel.open() synchronously even after a service worker restart.
      if (!getLastTabId()) {
        chrome.tabs.query({ active: true, currentWindow: true })
          .then(([tab]) => { if (tab?.id) setLastTabId(tab.id); })
          .catch(() => { /* best-effort */ });
      }

      const query = text.trim();

      if (!query) {
        suggest([]);
        return;
      }

      const queryLower = query.toLowerCase();

      // "Ask AI" item is always the first suggestion
      const baseSuggestions: chrome.omnibox.SuggestResult[] = [
        {
          content: `ask:${query}`,
          description: `Ask AI: <match>${escapeXml(query)}</match>`,
        },
      ];

      getAllConversationMetadata()
        .then((conversations) => {
          const matched = conversations
            .filter((c) => c.title.toLowerCase().includes(queryLower))
            .slice(0, MAX_CONV_SUGGESTIONS);

          const convSuggestions: chrome.omnibox.SuggestResult[] = matched.map((conv) => ({
            content: `switch:${conv.id}`,
            description: `<dim>Chat:</dim> ${escapeXml(conv.title)}`,
          }));

          suggest([...baseSuggestions, ...convSuggestions]);
        })
        .catch((e) => {
          console.warn('[Omnibox] Failed to load conversations for suggestions:', e);
          suggest(baseSuggestions);
        });
    }
  );

  // Handle Enter or suggestion selection.
  //
  // chrome.sidePanel.open() requires a user gesture and must be called
  // synchronously within the event handler — calling it inside a Promise
  // .then() (e.g. after tabs.query) loses the gesture context and silently
  // fails to open the panel.
  //
  // The getLastTabId() callback returns a tab ID that was cached by
  // tabs.onActivated, so we can call sidePanel.open() as the very first
  // synchronous operation in this handler.
  chrome.omnibox.onInputEntered.addListener(
    (text: string, _disposition: 'currentTab' | 'newForegroundTab' | 'newBackgroundTab') => {
      const tabId = getLastTabId();
      const query = text.trim();

      if (tabId) {
        // Synchronous call — user gesture context is intact
        chrome.sidePanel.open({ tabId })
          .then(() => {
            setTimeout(() => sendCommand(query), 500);
          })
          .catch((e) => {
            console.warn('[Omnibox] Failed to open side panel:', e);
          });
        return;
      }

      // Fallback: service worker just restarted and has no cached tab ID yet.
      // tabs.query() is async, so gesture context may be lost — but this is the
      // best we can do without a cached ID.
      chrome.tabs.query({ active: true, currentWindow: true })
        .then(([tab]) => {
          if (!tab?.id) return;
          chrome.sidePanel.open({ tabId: tab.id })
            .then(() => {
              setTimeout(() => sendCommand(query), 500);
            })
            .catch((e) => {
              console.warn('[Omnibox] Failed to open side panel (fallback):', e);
            });
        })
        .catch((e) => {
          console.warn('[Omnibox] Failed to get active tab:', e);
        });
    }
  );
}
