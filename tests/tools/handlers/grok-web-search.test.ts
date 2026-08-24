import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { setupChromeMock, clearChromeMock } from '../../helpers/index.js';
import { handleGrokWebSearch } from '../../../src/background/tools/handlers/grok-web-search.handler.js';

// Capture the last fetch invocation so tests can assert request shape.
let lastFetchArgs: {
  url: string;
  options: RequestInit;
} | null = null;
let fetchCallCount = 0;

// Build a Responses-API payload with output_text + url_citation annotations.
function makeSearchPayload(
  text: string,
  citations: Array<{ url: string; title?: string }>
): Record<string, unknown> {
  const annotations = citations.map((c) => ({
    type: 'url_citation',
    url_citation: { url: c.url, title: c.title ?? '' },
  }));
  return {
    id: 'resp_test',
    output_text: text,
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text,
            annotations,
          },
        ],
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setFetchMock(fn: (callCount: number) => Response): void {
  fetchCallCount = 0;
  lastFetchArgs = null;
  globalThis.fetch = mock(async (_url: string, _options?: RequestInit) => {
    fetchCallCount++;
    lastFetchArgs = { url: _url, options: _options ?? {} };
    return fn(fetchCallCount);
  }) as unknown as typeof fetch;
}

const originalFetch = globalThis.fetch;

describe('Grok Web Search Handler', () => {
  beforeEach(() => {
    lastFetchArgs = null;
    fetchCallCount = 0;
    setupChromeMock();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    clearChromeMock();
  });

  describe('Input validation', () => {
    test('returns error when query is missing', async () => {
      const result = await handleGrokWebSearch(
        {},
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );
      expect(result.content[0].text).toContain('query parameter is required');
      expect(lastFetchArgs).toBeNull();
    });

    test('returns error when query is empty string', async () => {
      const result = await handleGrokWebSearch(
        { query: '' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );
      expect(result.content[0].text).toContain('query parameter is required');
      expect(lastFetchArgs).toBeNull();
    });

    test('returns sign-in message when not connected (no token, no stored OAuth tokens)', async () => {
      // No grokOAuthTokens in storage → getGrokAccessToken throws "not connected"
      setFetchMock(() => jsonResponse(makeSearchPayload('Should not reach', [])));
      const result = await handleGrokWebSearch({ query: 'test' }, undefined);
      expect(result.content[0].text).toContain('sign-in required');
      expect(fetchCallCount).toBe(0);
    });
  });

  describe('Request body shape (port of build_request_json)', () => {
    beforeEach(() => {
      setFetchMock(() => jsonResponse(makeSearchPayload('Synthesized answer', [])));
    });

    test('sends correct body with model, input, tools, store, and generation params', async () => {
      await handleGrokWebSearch(
        { query: 'latest TypeScript version' },
        { grokAccessToken: 'my-token', grokModel: 'grok-4.5' }
      );

      expect(lastFetchArgs).not.toBeNull();
      const body = JSON.parse(lastFetchArgs!.options.body as string);

      expect(body.model).toBe('grok-4.5');
      expect(body.input).toBe('latest TypeScript version');
      expect(body.store).toBe(false);
      expect(body.temperature).toBe(0.1);
      expect(body.top_p).toBe(0.95);
      expect(body.max_output_tokens).toBe(8192);
      expect(Array.isArray(body.tools)).toBe(true);
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe('web_search');
    });

    test('places allowed_domains into tools[0].filters', async () => {
      await handleGrokWebSearch(
        {
          query: 'test',
          allowed_domains: ['docs.x.ai', 'example.com'],
        },
        { grokAccessToken: 'my-token', grokModel: 'grok-4.5' }
      );

      const body = JSON.parse(lastFetchArgs!.options.body as string);
      expect(body.tools[0].filters.allowed_domains).toEqual([
        'docs.x.ai',
        'example.com',
      ]);
    });

    test('omits filters when no allowed_domains given', async () => {
      await handleGrokWebSearch(
        { query: 'test' },
        { grokAccessToken: 'my-token', grokModel: 'grok-4.5' }
      );

      const body = JSON.parse(lastFetchArgs!.options.body as string);
      expect(body.tools[0].filters).toBeUndefined();
    });

    test('includes CLI identity headers for the chat proxy', async () => {
      await handleGrokWebSearch(
        { query: 'test' },
        { grokAccessToken: 'my-token', grokModel: 'grok-4.5' }
      );

      const headers = lastFetchArgs!.options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
      expect(headers['X-XAI-Token-Auth']).toBe('xai-grok-cli');
      expect(headers['x-grok-client-version']).toBeDefined();
      expect(headers['User-Agent']).toContain('xai-grok-workspace');
      expect(headers['x-grok-client-identifier']).toBe('grok-shell');
      expect(headers['x-authenticateresponse']).toBe('authenticate-response');
    });

    test('targets the {apiUrl}/responses endpoint', async () => {
      await handleGrokWebSearch(
        { query: 'test' },
        {
          grokAccessToken: 'my-token',
          grokModel: 'grok-4.5',
          grokApiUrl: 'https://cli-chat-proxy.grok.com/v1',
        }
      );

      expect(lastFetchArgs!.url).toBe('https://cli-chat-proxy.grok.com/v1/responses');
    });
  });

  describe('Citation extraction (port of extract_citation_pairs)', () => {
    test('extracts citations and appends Sources list', async () => {
      setFetchMock(() =>
        jsonResponse(
          makeSearchPayload('The answer is 42.', [
            { url: 'https://example.com/a', title: 'Example A' },
            { url: 'https://example.com/b', title: 'Example B' },
          ])
        )
      );

      const result = await handleGrokWebSearch(
        { query: 'answer' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );

      const text = result.content[0].text;
      expect(text).toContain('The answer is 42.');
      expect(text).toContain('Sources:');
      expect(text).toContain('[1] Example A - https://example.com/a');
      expect(text).toContain('[2] Example B - https://example.com/b');
    });

    test('deduplicates citations by URL preserving first-seen order', async () => {
      setFetchMock(() =>
        jsonResponse(
          makeSearchPayload('Answer', [
            { url: 'https://dup.com', title: 'First' },
            { url: 'https://unique.com', title: 'Unique' },
            { url: 'https://dup.com', title: 'Duplicate' },
          ])
        )
      );

      const result = await handleGrokWebSearch(
        { query: 'answer' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );

      const text = result.content[0].text;
      expect(text).toContain('[1] First - https://dup.com');
      expect(text).toContain('[2] Unique - https://unique.com');
      // The third (duplicate) URL should not appear as [3].
      expect(text).not.toContain('[3]');
    });

    test('handles citations with missing titles', async () => {
      setFetchMock(() =>
        jsonResponse(
          makeSearchPayload('Answer', [{ url: 'https://example.com/no-title' }])
        )
      );

      const result = await handleGrokWebSearch(
        { query: 'answer' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );

      const text = result.content[0].text;
      expect(text).toContain('[1] https://example.com/no-title');
      // No " - " separator when title is empty.
      expect(text).not.toContain(' - https://example.com/no-title');
    });

    test('returns synthesized text without Sources when no citations', async () => {
      setFetchMock(() => jsonResponse(makeSearchPayload('Just text, no sources.', [])));

      const result = await handleGrokWebSearch(
        { query: 'answer' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );

      expect(result.content[0].text).toBe('Just text, no sources.');
      expect(result.content[0].text).not.toContain('Sources:');
    });

    test('falls back to output content parts when output_text is absent', async () => {
      setFetchMock(() =>
        jsonResponse({
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Extracted from content.' }],
            },
          ],
        })
      );

      const result = await handleGrokWebSearch(
        { query: 'answer' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );

      expect(result.content[0].text).toContain('Extracted from content.');
    });
  });

  describe('Error handling', () => {
    test('does not retry on non-401 errors', async () => {
      setFetchMock(() =>
        new Response('{"error":"rate limited"}', {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const result = await handleGrokWebSearch(
        { query: 'test' },
        { grokAccessToken: 'token', grokModel: 'grok-4.5' }
      );

      expect(fetchCallCount).toBe(1);
      expect(result.content[0].text).toContain('Rate Limit Exceeded');
    });

    test('retries once after a 401 using a refreshed token', async () => {
      // Mock getGrokAccessToken to return a "refreshed" token.
      mock.module('../../../src/utils/grokOAuth.ts', () => ({
        getGrokAccessToken: mock(async () => 'refreshed-token'),
        resolveGrokBearer: mock(async () => 'refreshed-token'),
        GrokAuthError: class GrokAuthError extends Error {},
      }));

      // Re-import the handler AFTER the mock is set so it picks up the mocked
      // getGrokAccessToken binding.
      const { handleGrokWebSearch: handleMocked } = await import(
        '../../../src/background/tools/handlers/grok-web-search.handler.js'
      );

      setFetchMock((count) => {
        if (count === 1) {
          return new Response('{"error":"unauthorized"}', {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return jsonResponse(makeSearchPayload('Success after retry', []));
      });

      const result = await handleMocked(
        { query: 'test' },
        { grokAccessToken: 'stale-token', grokModel: 'grok-4.5' }
      );

      expect(fetchCallCount).toBe(2); // initial + retry
      expect(result.content[0].text).toContain('Success after retry');

      // The retry call should use the refreshed token.
      const retryHeaders = lastFetchArgs!.options.headers as Record<string, string>;
      expect(retryHeaders['Authorization']).toBe('Bearer refreshed-token');
    });
  });
});
