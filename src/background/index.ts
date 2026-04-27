/**
 * Background Service Worker Entry Point
 * Main entry for Chrome extension background script
 * @module background
 */

import {
  handleChatRequest,
  handleStopStream,
  handleGoogleSearchToolDirect,
  handleGetActiveStreams,
} from './handlers/chat.handler';
import type { ChatRequestMessage } from './services/chat.service';
import {
  restoreMCPServers,
  registerMCPHandlers,
  setRestorePromise,
} from './handlers/mcp.handler';
import { registerMemoryHandlers } from './handlers/memory.handler';
import { registerTitleHandlers } from './handlers/title.handler';
import { registerModelsHandlers } from './handlers/models.handler';
import { registerContentHandlers } from './handlers/content.handler';
import { migrateOldConversations } from '../utils/conversationDB';
import { initOmniboxHandler } from './handlers/omnibox.handler';

const CONTENT_SCRIPT_FILES = ['content.js'];
const GOOGLE_DOCS_BRIDGE_FILES = ['google-docs-bridge.js'];
const CLOUDFLARE_EXCLUDE_PATTERNS = [
  '://challenges.cloudflare.com/',
  '://cf-assets.cloudflare.com/',
];

function isInjectableTabUrl(url?: string): boolean {
  if (!url) return false;
  if (!(url.startsWith('http://') || url.startsWith('https://'))) return false;
  return !CLOUDFLARE_EXCLUDE_PATTERNS.some((pattern) => url.includes(pattern));
}

async function injectContentScriptsIntoTab(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !isInjectableTabUrl(tab.url)) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: CONTENT_SCRIPT_FILES,
    });

    if (tab.url?.startsWith('https://docs.google.com/')) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: GOOGLE_DOCS_BRIDGE_FILES,
        world: 'MAIN',
      });
    }
  } catch {
    // Ignore tabs where injection is not allowed or the page is gone.
  }
}

async function reinjectContentScriptsIntoOpenTabs(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(tabs.map((tab) => injectContentScriptsIntoTab(tab)));
  } catch {
    // Ignore transient startup/query failures.
  }
}

// Initialize MCP servers on startup.
// Register the promise with setRestorePromise so that handleMCPListTools can
// wait for restore to finish before returning tools — preventing the race
// condition where MCP_LIST_TOOLS arrives before restoreMCPServers() completes.
setRestorePromise(restoreMCPServers());

// Track the active tab ID so the omnibox handler can call chrome.sidePanel.open()
// synchronously (without an async tabs.query() first, which would break the user
// gesture context that sidePanel.open() requires).
let lastActiveTabId: number | undefined;

chrome.tabs.onActivated.addListener(({ tabId }) => {
  lastActiveTabId = tabId;

  void chrome.tabs.get(tabId)
    .then((tab) => injectContentScriptsIntoTab(tab))
    .catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  void injectContentScriptsIntoTab({ ...tab, id: tabId });
});

// Initialize omnibox quick search (keyword: "bk")
initOmniboxHandler(
  () => lastActiveTabId,
  (id) => { lastActiveTabId = id; },
);

chrome.runtime.onStartup.addListener(() => {
  void reinjectContentScriptsIntoOpenTabs();
});

void reinjectContentScriptsIntoOpenTabs();

// Modify User-Agent only for LLM API requests made by this extension.
// IMPORTANT: Do NOT use urlFilter:'*' here — that would rewrite the UA on
// ALL XHR requests (including Cloudflare challenge verification), causing
// bot-detection to flag the browser as a non-human client.
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
      requestHeaders: [{
        header: 'user-agent',
        operation: chrome.declarativeNetRequest.HeaderOperation.SET,
        value: 'claude-cli/2.1.56'
      }]
    },
    condition: {
      requestDomains: [
        'api.kimi.com',
      ],
      resourceTypes: [
        chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
        chrome.declarativeNetRequest.ResourceType.OTHER,
      ]
    }
  }]
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab: chrome.tabs.Tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id });
  }
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Handle extension install/update
chrome.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }

  // Handle data migrations
  if (details.reason === 'install' || details.reason === 'update') {
    migrateOldConversations().catch((e: Error) =>
      console.error('[Background] Migration error:', e)
    );
  }

  // Create context menu
  chrome.contextMenus.create({
    id: 'send-to-brace-kit',
    title: 'Send to BraceKit',
    contexts: ['selection'],
  });
});

// Context menu handler
chrome.contextMenus.onClicked.addListener(
  (info: chrome.contextMenus.OnClickData, tab: chrome.tabs.Tab | undefined) => {
    if (info.menuItemId === 'send-to-brace-kit' && tab?.id) {
      // Open sidebar and send selection
      chrome.sidePanel.open({ tabId: tab.id });

      // Small delay to let sidebar load
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'CONTEXT_MENU_SELECTION',
          data: {
            selectedText: info.selectionText,
            pageTitle: tab.title,
            pageUrl: tab.url,
          },
        });
      }, 500);
    }
  }
);

interface StopStreamMessage {
  type: 'STOP_STREAM';
  requestId: string;
}

interface GoogleSearchToolMessage {
  type: 'GOOGLE_SEARCH_TOOL';
  arguments: Record<string, unknown>;
}

interface TextSelectedMessage {
  type: 'TEXT_SELECTED';
  data: unknown;
}

type SendResponse = (response?: unknown) => void;

// Main message handler
chrome.runtime.onMessage.addListener(
  (message: { type: string;[key: string]: unknown }, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
    switch (message.type) {
      case 'CHAT_REQUEST':
        handleChatRequest(message as unknown as ChatRequestMessage, sendResponse);
        return true; // async

      case 'STOP_STREAM':
        handleStopStream(message as unknown as StopStreamMessage, sendResponse);
        return false;

      case 'GET_ACTIVE_STREAMS':
        handleGetActiveStreams(sendResponse);
        return false;

      case 'GOOGLE_SEARCH_TOOL':
        handleGoogleSearchToolDirect(message as unknown as GoogleSearchToolMessage, sendResponse);
        return true;

      case 'TEXT_SELECTED':
        // Relay text selection from content script to sidebar
        chrome.runtime.sendMessage({
          type: 'SELECTION_UPDATED',
          data: (message as unknown as TextSelectedMessage).data,
        });
        return false;

      default:
        // Let other handlers process
        return false;
    }
  }
);

// Register domain-specific handlers
registerMCPHandlers(chrome.runtime.onMessage);
registerMemoryHandlers(chrome.runtime.onMessage);
registerTitleHandlers(chrome.runtime.onMessage);
registerModelsHandlers(chrome.runtime.onMessage);
registerContentHandlers(chrome.runtime.onMessage);
