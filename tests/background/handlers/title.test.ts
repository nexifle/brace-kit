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

    test('[REGRESSION] extracts title from wrapped gateway responses ({"data": {…}, "success": true})', async () => {
      const { handleTitleGenerate } = await import('../../../src/background/handlers/title.handler.js');
      const mockSendResponse = mock(() => {});

      const wrappedBody = JSON.stringify({
        data: {
          choices: [{ message: { content: 'Hey' } }],
        },
        success: true,
      });

      const origFetch = globalThis.fetch;
      globalThis.fetch = mock(async () =>
        new Response(wrappedBody, { status: 200, headers: { 'Content-Type': 'application/json' } })
      );
      try {
        await handleTitleGenerate({
          messages: [
            { role: 'system', content: 'Generate a short title' },
            { role: 'user', content: 'User: hey' },
          ],
          providerConfig: {
            providerId: 'custom',
            format: 'openai',
            apiKey: 'k',
            apiUrl: 'https://gateway.example/v1',
            model: 'deepseek/deepseek-v4-flash',
            systemPrompt: '',
          },
        }, mockSendResponse);
      } finally {
        globalThis.fetch = origFetch;
      }

      expect(mockSendResponse).toHaveBeenCalledWith({ title: 'Hey' });
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
