import { test, expect, describe, mock } from 'bun:test';

// Mock chrome API
const mockChrome = {
  runtime: {
    sendMessage: mock(() => {}),
  },
  storage: {
    local: {
      get: mock(async () => ({ googleSearchApiKey: 'test-key' })),
    },
  },
};

// @ts-ignore
globalThis.chrome = mockChrome;

describe('Chat Handler', () => {
  describe('handleChatRequest', () => {
    test('should return true for async response', async () => {
      const { handleChatRequest } = await import('../../../src/background/handlers/chat.handler.js');
      const mockSendResponse = mock(() => {});

      const result = handleChatRequest({}, mockSendResponse);
      expect(result).toBe(true);
    });
  });

  describe('handleStopStream', () => {
    test('should return false for sync response', async () => {
      const { handleStopStream } = await import('../../../src/background/handlers/chat.handler.js');
      const mockSendResponse = mock(() => {});

      const result = handleStopStream({ requestId: 'test' }, mockSendResponse);
      expect(result).toBe(false);
      expect(mockSendResponse).toHaveBeenCalled();
    });
  });

  describe('chatService export', () => {
    test('should export chatService for testing', async () => {
      const { chatService } = await import('../../../src/background/handlers/chat.handler.js');

      expect(chatService).toBeDefined();
      expect(chatService.executeRequest).toBeFunction();
      expect(chatService.abortRequest).toBeFunction();
    });
  });
});
