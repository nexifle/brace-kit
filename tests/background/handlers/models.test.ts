import { test, expect, describe, mock } from 'bun:test';

describe('Models Handler', () => {
  describe('registerModelsHandlers', () => {
    test('should register handlers on message listener', async () => {
      const { registerModelsHandlers } = await import('../../../src/background/handlers/models.handler.js');
      const mockListener = { addListener: mock(() => {}) };

      registerModelsHandlers(mockListener as unknown as typeof chrome.runtime.onMessage);
      expect(mockListener.addListener).toHaveBeenCalled();
    });
  });
});
