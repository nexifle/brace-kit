import { test, expect, describe, mock } from 'bun:test';

describe('Memory Handler', () => {
  describe('handleMemoryExtract', () => {
    test('should return error when no API key provided', async () => {
      const { handleMemoryExtract } = await import('../../../src/background/handlers/memory.handler.js');
      const mockSendResponse = mock(() => {});

      await handleMemoryExtract({
        messages: [],
        providerConfig: { providerId: 'openai', apiKey: null },
      }, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({ error: 'No API key' });
    });
  });

  describe('registerMemoryHandlers', () => {
    test('should register handlers on message listener', async () => {
      const { registerMemoryHandlers } = await import('../../../src/background/handlers/memory.handler.js');
      const mockListener = { addListener: mock(() => {}) };

      registerMemoryHandlers(mockListener as unknown as typeof chrome.runtime.onMessage);
      expect(mockListener.addListener).toHaveBeenCalled();
    });
  });
});
