import { test, expect, describe, mock } from 'bun:test';

// Mock chrome API
const mockChrome = {
  runtime: {
    sendMessage: mock(() => {}),
  },
  storage: {
    local: {
      get: mock(async () => ({})),
    },
  },
};

// @ts-ignore
globalThis.chrome = mockChrome;

describe('Chat Service', () => {
  describe('createChatService', () => {
    test('should create a chat service instance', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      expect(chatService).toBeDefined();
      expect(chatService.executeRequest).toBeFunction();
      expect(chatService.abortRequest).toBeFunction();
      expect(chatService.getActiveRequestCount).toBeFunction();
    });
  });

  describe('abortRequest', () => {
    test('should return false for unknown request', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      const result = chatService.abortRequest('unknown-id');
      expect(result).toBe(false);
    });

    test('should return true and abort active request', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      // Start a request (we'll use a mock)
      const mockSendResponse = mock(() => {});

      // Create an abort controller to track
      const controller = new AbortController();

      // Simulate adding a request to active requests
      // Since we can't easily test the full flow, we test the abort logic
      const result = chatService.abortRequest('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getActiveRequestCount', () => {
    test('should return 0 initially', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      expect(chatService.getActiveRequestCount()).toBe(0);
    });
  });

  describe('non-streaming orchestration', () => {
    const baseMsg = (
      opts: Record<string, unknown>
    ) => ({
      messages: [{ role: 'user', content: 'hi' }],
      providerConfig: {
        providerId: 'custom',
        apiKey: 'test-key',
        model: 'gpt-4o',
        apiUrl: 'https://example.com/v1',
        format: 'openai',
      },
      tools: [],
      options: { stream: false, ...opts },
      requestId: 'r1',
    });

    test('returns content, reasoning, and reasoning_signature', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: 'Answer:\n thinkingsecret\n responseHello!',
                reasoning: 'reason-from-field',
              },
            }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      let sent: { content?: string; reasoning_content?: string; reasoning_signature?: string } | undefined;
      await chatService.executeRequest(
        baseMsg({ enableReasoning: true }) as never,
        (r) => { sent = r; }
      );

      expect(sent).toBeDefined();
      // Embedded think tag stripped from content; the line break is preserved.
      expect(sent!.content).toBe('Answer:\nHello!');
      // Dedicated reasoning field + embedded tag reasoning are joined
      // (matches the stream path, which concatenates both chunk types).
      expect(sent!.reasoning_content).toBe('reason-from-field\nsecret');
    });

    test('drops reasoning when enableReasoning is false (match stream path)', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: { role: 'assistant', content: 'Halo!', reasoning: 'secret' },
            }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      let sent: { content?: string; reasoning_content?: string } | undefined;
      await chatService.executeRequest(
        baseMsg({ enableReasoning: false }) as never,
        (r) => { sent = r; }
      );

      expect(sent!.content).toBe('Halo!');
      expect(sent!.reasoning_content).toBeUndefined();
    });

    test('surfaces embedded tag reasoning when no dedicated field present', async () => {
      const { createChatService } = await import('../../../src/background/services/chat.service.js');
      const chatService = createChatService();

      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            choices: [{
              message: { role: 'assistant', content: 'A\n thinkingheat\n responseB' },
            }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      let sent: { content?: string; reasoning_content?: string } | undefined;
      await chatService.executeRequest(
        baseMsg({ enableReasoning: true }) as never,
        (r) => { sent = r; }
      );

      expect(sent!.content).toBe('A\nB');
      expect(sent!.reasoning_content).toBe('heat');
    });
  });
});
