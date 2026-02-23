/**
 * Chrome API Mocking Utilities
 *
 * Provides reusable mock implementations for Chrome extension APIs
 * to be used across test files.
 */

import { mock } from 'bun:test';

export interface MockChromeOptions {
  googleSearchApiKey?: string;
  storageData?: Record<string, unknown>;
}

/**
 * Creates a mock Chrome API object with configurable initial state
 */
export function createMockChrome(options: MockChromeOptions = {}) {
  const storageData = { ...options.storageData };
  if (options.googleSearchApiKey) {
    storageData.googleSearchApiKey = options.googleSearchApiKey;
  }

  const messageListeners: Array<(message: unknown, sender: unknown, sendResponse: unknown) => void> = [];

  return {
    runtime: {
      sendMessage: mock(() => Promise.resolve({})),
      onMessage: {
        addListener: mock((fn: (message: unknown, sender: unknown, sendResponse: unknown) => void) => {
          messageListeners.push(fn);
        }),
        removeListener: mock((fn: (message: unknown, sender: unknown, sendResponse: unknown) => void) => {
          const idx = messageListeners.indexOf(fn);
          if (idx > -1) messageListeners.splice(idx, 1);
        }),
        // Helper to simulate message for testing
        _emit: (message: unknown, sender?: unknown, sendResponse?: unknown) => {
          messageListeners.forEach((fn) => fn(message, sender, sendResponse));
        },
      },
      getManifest: mock(() => ({ version: '1.0.0' })),
    },
    storage: {
      local: {
        get: mock(async (keys?: string | string[]) => {
          if (!keys) return { ...storageData };
          if (typeof keys === 'string') return { [keys]: storageData[keys] };
          const result: Record<string, unknown> = {};
          keys.forEach((key) => {
            if (storageData[key] !== undefined) result[key] = storageData[key];
          });
          return result;
        }),
        set: mock(async (data: Record<string, unknown>) => {
          Object.assign(storageData, data);
        }),
        remove: mock(async (keys: string | string[]) => {
          if (typeof keys === 'string') delete storageData[keys];
          else keys.forEach((key) => delete storageData[key]);
        }),
        clear: mock(async () => {
          Object.keys(storageData).forEach((key) => delete storageData[key]);
        }),
        // Helper to get current storage state
        _getStore: () => ({ ...storageData }),
      },
      session: {
        get: mock(async () => ({})),
        set: mock(async () => {}),
        remove: mock(async () => {}),
        clear: mock(async () => {}),
      },
    },
    tabs: {
      query: mock(async () => []),
      sendMessage: mock(async () => {}),
      create: mock(async (options: chrome.tabs.CreateProperties) => ({
        id: 1,
        windowId: 1,
        index: 0,
        active: true,
        ...options,
      } as chrome.tabs.Tab)),
    },
    contextMenus: {
      create: mock(() => {}),
      remove: mock(() => {}),
      onClicked: {
        addListener: mock(() => {}),
        removeListener: mock(() => {}),
      },
    },
    action: {
      onClicked: {
        addListener: mock(() => {}),
        removeListener: mock(() => {}),
      },
      setIcon: mock(() => {}),
      setBadgeText: mock(() => {}),
      setBadgeBackgroundColor: mock(() => {}),
    },
    sidePanel: {
      open: mock(() => Promise.resolve()),
      setPanelBehavior: mock(() => Promise.resolve()),
    },
  } as unknown as typeof chrome;
}

/**
 * Sets up Chrome API mock on globalThis and returns the mock instance
 *
 * @example
 * ```ts
 * beforeEach(() => {
 *   setupChromeMock({ googleSearchApiKey: 'test-key' });
 * });
 * ```
 */
export function setupChromeMock(options: MockChromeOptions = {}) {
  const mockChrome = createMockChrome(options);
  globalThis.chrome = mockChrome;
  return mockChrome;
}

/**
 * Clears the Chrome mock from globalThis
 */
export function clearChromeMock() {
  // @ts-expect-error - Clearing mock
  delete globalThis.chrome;
}

/**
 * Creates a mock Chrome runtime with sendMessage that returns specific responses
 */
export function createMockRuntimeWithResponses(
  responses: Record<string, unknown>
) {
  const listeners: Array<(message: unknown) => void> = [];

  return {
    sendMessage: mock((message: { type: string }) => {
      const response = responses[message.type];
      return Promise.resolve(response ?? {});
    }),
    onMessage: {
      addListener: mock((fn: (message: unknown) => void) => {
        listeners.push(fn);
      }),
      removeListener: mock((fn: (message: unknown) => void) => {
        const idx = listeners.indexOf(fn);
        if (idx > -1) listeners.splice(idx, 1);
      }),
      _emit: (message: unknown) => {
        listeners.forEach((fn) => fn(message));
      },
    },
    getManifest: mock(() => ({ version: '1.0.0' })),
  } as unknown as typeof chrome.runtime;
}
