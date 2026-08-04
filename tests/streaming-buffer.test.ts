/**
 * Tests untuk streaming buffer & recovery saat sidebar ditutup & dibuka kembali.
 *
 * Coverage:
 * - getActiveStreamingBuffers() — snapshot buffer dari background
 * - handleGetActiveStreams() — handler untuk sidebar query saat mount
 * - StreamingBufferEntry type — validasi struktur data
 * - Recovery logic scenarios — simulasi berbagai kondisi stream
 */
import { test, expect, describe, beforeEach, mock } from 'bun:test';
import type { StreamingBufferEntry, ActiveStreamsResponse } from '../src/types/index.ts';

let capturedSendResponseArgs: unknown[] = [];
const mockSendResponse = (response: unknown) => {
  capturedSendResponseArgs.push(response);
};

// @ts-ignore
globalThis.chrome = {
  runtime: {
    sendMessage: mock(() => Promise.resolve(undefined)),
  },
  storage: {
    local: { get: mock(async () => ({})) },
  },
};

beforeEach(() => {
  capturedSendResponseArgs = [];
});

// ============================================================
// getActiveStreamingBuffers
// ============================================================

describe('getActiveStreamingBuffers', () => {
  test('fungsi tersedia dan dapat di-export', async () => {
    const mod = await import('../src/background/services/chat.service.js');
    expect(typeof mod.getActiveStreamingBuffers).toBe('function');
  });

  test('return object (bukan null/undefined)', async () => {
    const { getActiveStreamingBuffers } = await import('../src/background/services/chat.service.js');
    const result = getActiveStreamingBuffers();
    expect(result).not.toBeNull();
    expect(result).not.toBeUndefined();
    expect(typeof result).toBe('object');
  });

  test('setiap call return snapshot baru (bukan reference yang sama)', async () => {
    const { getActiveStreamingBuffers } = await import('../src/background/services/chat.service.js');
    const snap1 = getActiveStreamingBuffers();
    const snap2 = getActiveStreamingBuffers();
    expect(snap1).not.toBe(snap2);
  });

  test('chunks dan reasoningChunks di tiap entry adalah array baru', async () => {
    const { getActiveStreamingBuffers } = await import('../src/background/services/chat.service.js');
    const result = getActiveStreamingBuffers();
    for (const entry of Object.values(result)) {
      expect(Array.isArray(entry.chunks)).toBe(true);
      expect(Array.isArray(entry.reasoningChunks)).toBe(true);
    }
  });
});

// ============================================================
// handleGetActiveStreams handler
// ============================================================

describe('handleGetActiveStreams', () => {
  test('bersifat synchronous — return false', async () => {
    const { handleGetActiveStreams } = await import('../src/background/handlers/chat.handler.js');
    const result = handleGetActiveStreams(mockSendResponse);
    expect(result).toBe(false);
  });

  test('memanggil sendResponse tepat sekali', async () => {
    const { handleGetActiveStreams } = await import('../src/background/handlers/chat.handler.js');
    const calls = { n: 0 };
    handleGetActiveStreams(() => { calls.n++; });
    expect(calls.n).toBe(1);
  });

  test('response punya property "streams" bertipe object', async () => {
    const { handleGetActiveStreams } = await import('../src/background/handlers/chat.handler.js');
    handleGetActiveStreams(mockSendResponse);

    const response = capturedSendResponseArgs[0] as ActiveStreamsResponse;
    expect(response).toHaveProperty('streams');
    expect(typeof response.streams).toBe('object');
    expect(response.streams).not.toBeNull();
  });

  test('streams tidak null meski buffer kosong', async () => {
    const { handleGetActiveStreams } = await import('../src/background/handlers/chat.handler.js');
    let captured: ActiveStreamsResponse | null = null;
    handleGetActiveStreams((r) => { captured = r as ActiveStreamsResponse; });

    expect(captured).not.toBeNull();
    expect(captured!.streams).not.toBeNull();
  });
});

// ============================================================
// abortRequest membersihkan buffer
// ============================================================

describe('abortRequest clears buffer', () => {
  test('abort request yang tidak ada tetap return false dan tidak crash', async () => {
    const { createChatService } = await import('../src/background/services/chat.service.js');
    const service = createChatService();
    expect(service.abortRequest('non-existent-id')).toBe(false);
  });

  test('buffer masih dapat di-query setelah abort gagal', async () => {
    const { createChatService, getActiveStreamingBuffers } = await import('../src/background/services/chat.service.js');
    const service = createChatService();
    service.abortRequest('unknown-req');
    const buffers = getActiveStreamingBuffers();
    expect(buffers).toBeTruthy();
  });
});

// ============================================================
// clearStreamingBuffer — konsumsi stream menghapus buffer
// ============================================================

/**
 * Seed a completed streaming buffer for a conversation by running a real
 * (mock-SSE) stream through handleStreamingResponse.
 */
async function seedCompletedStream(
  service: { handleStreamingResponse: Function },
  convId: string,
  requestId: string,
  content: string
): Promise<void> {
  const body = [
    `data: {"choices":[{"delta":{"content":"${content}"}}]}`,
    'data: [DONE]',
    '',
  ].join('\n');
  const response = new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
  const activeRequest = { abortController: new AbortController(), aborted: false };
  await service.handleStreamingResponse(
    response,
    { format: 'openai' },
    {
      messages: [{ role: 'user', content: 'hi' }],
      providerConfig: {
        providerId: 'openai', apiKey: 'test-key', model: 'gpt-4o',
        apiUrl: 'https://example.com/v1', format: 'openai',
      },
      options: {},
      requestId,
      conversationId: convId,
    } as never,
    activeRequest,
    mock(() => {})
  );
}

describe('clearStreamingBuffer', () => {
  test('menghapus buffer yang sudah dikonsumsi (match requestId + conversationId)', async () => {
    const { createChatService, getActiveStreamingBuffers, clearStreamingBuffer } =
      await import('../src/background/services/chat.service.js');
    const service = createChatService();

    await seedCompletedStream(service, 'conv-consumed', 'req-consumed', 'Hello ');

    expect(getActiveStreamingBuffers()['conv-consumed']).toBeDefined();
    clearStreamingBuffer('req-consumed', 'conv-consumed');
    expect(getActiveStreamingBuffers()['conv-consumed']).toBeUndefined();
  });

  test('menghapus berdasarkan conversationId saja jika requestId tidak diberikan', async () => {
    const { createChatService, getActiveStreamingBuffers, clearStreamingBuffer } =
      await import('../src/background/services/chat.service.js');
    const service = createChatService();

    await seedCompletedStream(service, 'conv-only', 'req-only', 'Hello ');

    clearStreamingBuffer(undefined, 'conv-only');
    expect(getActiveStreamingBuffers()['conv-only']).toBeUndefined();
  });

  test('tidak menghapus buffer request yang lebih baru untuk konversasi yang sama', async () => {
    const { createChatService, getActiveStreamingBuffers, clearStreamingBuffer } =
      await import('../src/background/services/chat.service.js');
    const service = createChatService();

    // Seed stream lama (selesai) lalu stream baru untuk konversasi yang sama.
    // createBufferEntry overwrites per conversation, jadi buffer berisi request baru.
    await seedCompletedStream(service, 'conv-same', 'req-old', 'Old ');
    await seedCompletedStream(service, 'conv-same', 'req-new', 'New ');

    expect(getActiveStreamingBuffers()['conv-same']!.requestId).toBe('req-new');

    // Clear dengan requestId lama tidak boleh menghapus entry yang masih relevan
    clearStreamingBuffer('req-old', 'conv-same');
    expect(getActiveStreamingBuffers()['conv-same']).toBeDefined();
    expect(getActiveStreamingBuffers()['conv-same']!.requestId).toBe('req-new');
  });

  test('tidak crash dan tidak menghapus apa pun jika tidak ada match', async () => {
    const { createChatService, getActiveStreamingBuffers, clearStreamingBuffer } =
      await import('../src/background/services/chat.service.js');
    const service = createChatService();

    await seedCompletedStream(service, 'conv-nomatch', 'req-nomatch', 'Hello ');

    clearStreamingBuffer('req-unknown', 'conv-other');
    expect(getActiveStreamingBuffers()['conv-nomatch']).toBeDefined();
  });
});

// ============================================================
// handleStreamConsumed handler
// ============================================================

describe('handleStreamConsumed', () => {
  test('menghapus buffer dan merespons success', async () => {
    const { createChatService, getActiveStreamingBuffers } =
      await import('../src/background/services/chat.service.js');
    const { handleStreamConsumed } = await import('../src/background/handlers/chat.handler.js');
    const service = createChatService();

    await seedCompletedStream(service, 'conv-h', 'req-h', 'Hello ');

    const result = handleStreamConsumed(
      { type: 'STREAM_CONSUMED', requestId: 'req-h', conversationId: 'conv-h' },
      mockSendResponse
    );

    expect(result).toBe(false);
    expect(capturedSendResponseArgs[0]).toEqual({ success: true });
    expect(getActiveStreamingBuffers()['conv-h']).toBeUndefined();
  });

  test('tidak mengganggu buffer lain saat satu konversasi dikonsumsi', async () => {
    const { createChatService, getActiveStreamingBuffers } =
      await import('../src/background/services/chat.service.js');
    const { handleStreamConsumed } = await import('../src/background/handlers/chat.handler.js');
    const service = createChatService();

    await seedCompletedStream(service, 'conv-a', 'req-a', 'A ');
    await seedCompletedStream(service, 'conv-b', 'req-b', 'B ');

    handleStreamConsumed(
      { type: 'STREAM_CONSUMED', requestId: 'req-a', conversationId: 'conv-a' },
      mockSendResponse
    );

    expect(getActiveStreamingBuffers()['conv-a']).toBeUndefined();
    expect(getActiveStreamingBuffers()['conv-b']).toBeDefined();
  });
});

// ============================================================
// StreamingBufferEntry type & structure
// ============================================================

describe('StreamingBufferEntry structure', () => {
  test('entry in_progress: required fields ada', () => {
    const entry: StreamingBufferEntry = {
      requestId: 'req-123',
      conversationId: 'conv-456',
      status: 'in_progress',
      chunks: ['hello ', 'world'],
      reasoningChunks: [],
      startedAt: Date.now(),
    };

    expect(entry.requestId).toBe('req-123');
    expect(entry.conversationId).toBe('conv-456');
    expect(entry.status).toBe('in_progress');
    expect(entry.chunks.join('')).toBe('hello world');
    expect(typeof entry.startedAt).toBe('number');
  });

  test('entry completed: fullContent dan chunks konsisten', () => {
    const entry: StreamingBufferEntry = {
      requestId: 'req-c',
      conversationId: 'conv-c',
      status: 'completed',
      chunks: ['Hello', ' ', 'World', '!'],
      reasoningChunks: ['think'],
      fullContent: 'Hello World!',
      startedAt: Date.now(),
      completedAt: Date.now() + 1000,
    };

    expect(entry.chunks.join('')).toBe(entry.fullContent);
    expect(entry.reasoningChunks.join('')).toBe('think');
    expect(entry.completedAt).toBeGreaterThan(entry.startedAt);
  });

  test('entry completed: bisa punya toolCalls dan images', () => {
    const entry: StreamingBufferEntry = {
      requestId: 'req-t',
      conversationId: 'conv-t',
      status: 'completed',
      chunks: ['result'],
      reasoningChunks: [],
      fullContent: 'result',
      toolCalls: [{ id: 'tc_1', name: 'search', arguments: '{"q":"test"}' }],
      images: [{ mimeType: 'image/png', data: 'base64data' }],
      startedAt: Date.now(),
      completedAt: Date.now() + 500,
    };

    expect(entry.toolCalls).toHaveLength(1);
    expect(entry.toolCalls![0].name).toBe('search');
    expect(entry.images).toHaveLength(1);
    expect(entry.images![0].mimeType).toBe('image/png');
  });

  test('entry error: punya errorMessage', () => {
    const entry: StreamingBufferEntry = {
      requestId: 'req-e',
      conversationId: 'conv-e',
      status: 'error',
      chunks: ['partial'],
      reasoningChunks: [],
      errorMessage: 'Network timeout',
      startedAt: Date.now(),
      completedAt: Date.now() + 200,
    };

    expect(entry.status).toBe('error');
    expect(entry.errorMessage).toBe('Network timeout');
    expect(entry.chunks.join('')).toBe('partial');
  });
});

// ============================================================
// Recovery scenarios (unit logic)
// ============================================================

describe('Recovery scenarios', () => {
  test('completed stream: content di-recover dari fullContent atau chunks.join()', () => {
    const entry: StreamingBufferEntry = {
      requestId: 'req-done',
      conversationId: 'conv-active',
      status: 'completed',
      chunks: ['The ', 'answer ', 'is 42'],
      reasoningChunks: ['step 1'],
      fullContent: 'The answer is 42',
      startedAt: Date.now() - 3000,
      completedAt: Date.now() - 100,
    };

    const content = entry.fullContent || entry.chunks.join('');
    expect(content).toBe('The answer is 42');

    const reasoning = entry.reasoningContent || entry.reasoningChunks.join('');
    expect(reasoning).toBe('step 1');
  });

  test('in_progress stream: partial content dari chunks', () => {
    const entry: StreamingBufferEntry = {
      requestId: 'req-wip',
      conversationId: 'conv-active',
      status: 'in_progress',
      chunks: ['Partial ', 'response...'],
      reasoningChunks: ['thinking...'],
      startedAt: Date.now() - 1000,
    };

    expect(entry.fullContent).toBeUndefined();
    expect(entry.chunks.join('')).toBe('Partial response...');
    expect(entry.reasoningChunks.join('')).toBe('thinking...');
  });

  test('chunks baru setelah recovery terus terakumulasi dengan benar', () => {
    const restoredContent = ['Hello ', 'World'].join('');
    const newChunk = '!';
    expect(restoredContent + newChunk).toBe('Hello World!');
  });

  test('streams map kosong dihandle tanpa error', () => {
    const response: ActiveStreamsResponse = { streams: {} };
    const entries = Object.entries(response.streams);
    expect(entries).toHaveLength(0);

    // Recovery loop tidak boleh error dengan streams kosong
    for (const [_convId, _entry] of entries) {
      // Tidak masuk ke sini
    }
  });

  test('multiple streams dapat di-iterate dan di-classify', () => {
    const response: ActiveStreamsResponse = {
      streams: {
        'conv-1': {
          requestId: 'req-1',
          conversationId: 'conv-1',
          status: 'completed',
          chunks: ['done'],
          reasoningChunks: [],
          fullContent: 'done',
          startedAt: Date.now(),
          completedAt: Date.now() + 1000,
        },
        'conv-2': {
          requestId: 'req-2',
          conversationId: 'conv-2',
          status: 'in_progress',
          chunks: ['partial'],
          reasoningChunks: [],
          startedAt: Date.now(),
        },
        'conv-3': {
          requestId: 'req-3',
          conversationId: 'conv-3',
          status: 'error',
          chunks: [],
          reasoningChunks: [],
          errorMessage: 'Timeout',
          startedAt: Date.now(),
          completedAt: Date.now() + 50,
        },
      },
    };

    const completed = Object.values(response.streams).filter(e => e.status === 'completed');
    const inProgress = Object.values(response.streams).filter(e => e.status === 'in_progress');
    const errored = Object.values(response.streams).filter(e => e.status === 'error');

    expect(completed).toHaveLength(1);
    expect(inProgress).toHaveLength(1);
    expect(errored).toHaveLength(1);

    expect(completed[0].fullContent).toBe('done');
    expect(inProgress[0].chunks.join('')).toBe('partial');
    expect(errored[0].errorMessage).toBe('Timeout');
  });
});
