import { test, expect, describe, mock } from 'bun:test';

// Mock chrome API
const mockChrome = {
  tabs: {
    query: mock(async () => [{ id: 123 }]),
    sendMessage: mock(async () => ({ content: 'test' })),
  },
};

// @ts-ignore
globalThis.chrome = mockChrome;

describe('Content Handler', () => {
  describe('registerContentHandlers', () => {
    test('should register handlers on message listener', async () => {
      const { registerContentHandlers } = await import('../../../src/background/handlers/content.handler.js');
      const mockListener = { addListener: mock(() => {}) };

      registerContentHandlers(mockListener as unknown as typeof chrome.runtime.onMessage);
      expect(mockListener.addListener).toHaveBeenCalled();
    });
  });

  describe('handleGetPageContent', () => {
    test('should forward message to content script', async () => {
      mockChrome.tabs.query.mockImplementation(async () => [{ id: 123 }]);
      mockChrome.tabs.sendMessage.mockImplementation(async () => ({ content: 'test' }));

      const { handleGetPageContent } = await import('../../../src/background/handlers/content.handler.js');
      const mockSendResponse = mock(() => {});

      await handleGetPageContent({ type: 'GET_PAGE_CONTENT' }, mockSendResponse);

      expect(mockChrome.tabs.query).toHaveBeenCalled();
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalled();
    });

    test('should return error when no active tab', async () => {
      mockChrome.tabs.query.mockImplementationOnce(async () => []);

      const { handleGetPageContent } = await import('../../../src/background/handlers/content.handler.js');
      const mockSendResponse = mock(() => {});

      await handleGetPageContent({ type: 'GET_PAGE_CONTENT' }, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({ error: 'No active tab' });
    });
  });

  describe('handleGetSelectedText', () => {
    test('should forward message to content script', async () => {
      mockChrome.tabs.query.mockImplementation(async () => [{ id: 123 }]);

      const { handleGetSelectedText } = await import('../../../src/background/handlers/content.handler.js');
      const mockSendResponse = mock(() => {});

      await handleGetSelectedText({ type: 'GET_SELECTED_TEXT' }, mockSendResponse);

      expect(mockChrome.tabs.query).toHaveBeenCalled();
      expect(mockChrome.tabs.sendMessage).toHaveBeenCalled();
    });
  });
});
