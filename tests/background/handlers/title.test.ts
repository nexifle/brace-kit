import { test, expect, describe, mock } from 'bun:test';

describe('Title Handler', () => {
  describe('handleTitleGenerate', () => {
    test('should return error when no API key provided', async () => {
      const { handleTitleGenerate } = await import('../../../src/background/handlers/title.handler.js');
      const mockSendResponse = mock(() => {});

      await handleTitleGenerate({
        messages: [],
        providerConfig: { providerId: 'openai', apiKey: null },
      }, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({ error: 'No API key' });
    });
  });

  describe('registerTitleHandlers', () => {
    test('should register handlers on message listener', async () => {
      const { registerTitleHandlers } = await import('../../../src/background/handlers/title.handler.js');
      const mockListener = { addListener: mock(() => {}) };

      registerTitleHandlers(mockListener as unknown as typeof chrome.runtime.onMessage);
      expect(mockListener.addListener).toHaveBeenCalled();
    });
  });
});
