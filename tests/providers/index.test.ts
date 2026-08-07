/**
 * Tests for Providers Index Module (Unified Interfaces)
 */

import { describe, expect, it, mock } from 'bun:test';
import {
  formatRequest,
  parseStream,
  fetchModels,
  PROVIDER_PRESETS,
  XAI_IMAGE_MODELS,
} from '../../src/providers';
import type { Message, MCPTool } from '../../src/types/index.ts';

describe('Providers Index - Unified Interfaces', () => {
  describe('formatRequest', () => {
    describe('OpenAI format', () => {
      it('should format OpenAI provider request', () => {
        const provider = {
          ...PROVIDER_PRESETS.openai,
          apiKey: 'test-key',
          model: 'gpt-4o',
        };
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toContain('chat/completions');
        expect(body.model).toBe('gpt-4o');
      });

      it('should format DeepSeek provider request (OpenAI-compatible)', () => {
        const provider = {
          ...PROVIDER_PRESETS.deepseek,
          apiKey: 'test-key',
          model: 'deepseek-chat',
        };
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(body.model).toBe('deepseek-chat');
      });
    });

    describe('Anthropic format', () => {
      it('should format Anthropic provider request', () => {
        const provider = {
          ...PROVIDER_PRESETS.anthropic,
          apiKey: 'test-key',
          model: 'claude-3-5-sonnet-20241022',
        };
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toContain('/v1/messages');
        expect(body.model).toBe('claude-3-5-sonnet-20241022');
      });

      it('should enable reasoning when requested', () => {
        const provider = {
          ...PROVIDER_PRESETS.anthropic,
          apiKey: 'test-key',
          model: 'claude-3-5-sonnet-20241022',
        };

        const config = formatRequest(provider, [], [], { enableReasoning: true });
        const body = JSON.parse(config.options.body as string);

        expect(body.thinking).toBeDefined();
        expect(body.thinking.type).toBe('enabled');
      });
    });

    describe('Gemini format', () => {
      it('should format Gemini provider request', () => {
        const provider = {
          ...PROVIDER_PRESETS.gemini,
          apiKey: 'test-key',
          model: 'gemini-2.0-flash',
        };
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toContain('gemini-2.0-flash:streamGenerateContent');
        expect(body.contents).toBeDefined();
      });

      it('should enable Google Search when requested', () => {
        const provider = {
          ...PROVIDER_PRESETS.gemini,
          apiKey: 'test-key',
          model: 'gemini-2.0-flash',
        };

        const config = formatRequest(provider, [], [], { enableGoogleSearch: true });
        const body = JSON.parse(config.options.body as string);

        expect(body.tools).toBeDefined();
        expect(body.tools[0].google_search).toBeDefined();
      });
    });

    describe('xAI format', () => {
      it('should format xAI chat request with OpenAI format', () => {
        const provider = {
          ...PROVIDER_PRESETS.xai,
          apiKey: 'test-key',
          model: 'grok-beta',
        };
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toContain('chat/completions');
      });

      it('should format xAI image request for image models', () => {
        const provider = {
          ...PROVIDER_PRESETS.xai,
          apiKey: 'test-key',
          model: 'grok-imagine-image',
        };
        const messages: Message[] = [{ role: 'user', content: 'A sunset' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toContain('/images/generations');
        expect(body.prompt).toBe('A sunset');
      });
    });

    describe('Responses format (Grok OAuth)', () => {
      it('should post to /responses', () => {
        const provider = {
          ...PROVIDER_PRESETS.grok,
          apiKey: 'test-token',
          model: 'grok-4.5',
        };
        const messages: Message[] = [{ role: 'user', content: 'Hello' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toBe('https://cli-chat-proxy.grok.com/v1/responses');
        expect(body.model).toBe('grok-4.5');
        expect(body.input).toBeDefined();
      });
    });

    describe('Tools', () => {
      it('should include tools in OpenAI format', () => {
        const provider = {
          ...PROVIDER_PRESETS.openai,
          apiKey: 'test-key',
        };
        const tools: MCPTool[] = [
          { name: 'search', description: 'Search', inputSchema: { type: 'object' } },
        ];

        const config = formatRequest(provider, [], tools);
        const body = JSON.parse(config.options.body as string);

        expect(body.tools).toBeDefined();
        expect(body.tools).toHaveLength(1);
      });

      it('should include tools in Anthropic format', () => {
        const provider = {
          ...PROVIDER_PRESETS.anthropic,
          apiKey: 'test-key',
        };
        const tools: MCPTool[] = [
          { name: 'search', description: 'Search', inputSchema: { type: 'object' } },
        ];

        const config = formatRequest(provider, [], tools);
        const body = JSON.parse(config.options.body as string);

        expect(body.tools).toBeDefined();
        expect(body.tools).toHaveLength(1);
      });
    });

    describe('Default fallback', () => {
      it('should use OpenAI format for unknown format', () => {
        const provider = {
          id: 'custom',
          name: 'Custom',
          apiUrl: 'https://custom.api.com/v1',
          defaultModel: 'custom-model',
          format: 'unknown' as 'openai',
          models: [],
          apiKey: 'test-key',
        };

        const config = formatRequest(provider, []);

        expect(config.url).toContain('chat/completions');
      });
    });
  });

  describe('parseStream', () => {
    function createMockResponse(chunks: string[]): Response {
      const encoder = new TextEncoder();
      const encodedChunks = chunks.map((c) => encoder.encode(c));

      let index = 0;
      const reader = {
        read: async () => {
          if (index < encodedChunks.length) {
            return { done: false, value: encodedChunks[index++] };
          }
          return { done: true, value: undefined };
        },
        cancel: () => {},
        releaseLock: () => {},
      };

      return {
        body: {
          getReader: () => reader,
        },
      } as unknown as Response;
    }

    it('should parse OpenAI stream', async () => {
      const provider = PROVIDER_PRESETS.openai;
      const chunks = ['data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n', 'data: [DONE]\n\n'];

      const response = createMockResponse(chunks);
      const results = [];

      for await (const chunk of parseStream(provider, response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('should parse Anthropic stream', async () => {
      const provider = PROVIDER_PRESETS.anthropic;
      const chunks = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
      ];

      const response = createMockResponse(chunks);
      const results = [];

      for await (const chunk of parseStream(provider, response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hi' });
    });

    it('should parse Gemini stream', async () => {
      const provider = PROVIDER_PRESETS.gemini;
      const chunks = ['data: {"candidates":[{"content":{"parts":[{"text":"Hey"}]}}]}\n\n'];

      const response = createMockResponse(chunks);
      const results = [];

      for await (const chunk of parseStream(provider, response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hey' });
    });

    it('should parse Responses stream (Grok OAuth)', async () => {
      const provider = PROVIDER_PRESETS.grok;
      const chunks = [
        'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
        'data: [DONE]\n\n',
      ];

      const response = createMockResponse(chunks);
      const results = [];

      for await (const chunk of parseStream(provider, response)) {
        results.push(chunk);
      }

      expect(results).toEqual([{ type: 'text', content: 'Hello' }]);
    });

    it('should use OpenAI parser for unknown format', async () => {
      const provider = {
        ...PROVIDER_PRESETS.openai,
        format: 'unknown' as 'openai',
      };
      const chunks = ['data: {"choices":[{"delta":{"content":"Test"}}]}\n\n', 'data: [DONE]\n\n'];

      const response = createMockResponse(chunks);
      const results = [];

      for await (const chunk of parseStream(provider, response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
    });
  });

  describe('fetchModels', () => {
    // Note: These tests would require mocking fetch, which is complex
    // For now, we test the error cases that don't require network

    it('should return error when API key is missing', async () => {
      const provider = {
        ...PROVIDER_PRESETS.openai,
        apiKey: undefined,
      };

      const result = await fetchModels(provider);

      expect(result.error).toBe('API key required');
      expect(result.models).toBeUndefined();
    });

    it('should return empty models for Grok OAuth (static list, no /models)', async () => {
      const provider = {
        ...PROVIDER_PRESETS.grok,
        apiKey: undefined,
      };

      const result = await fetchModels(provider);

      expect(result.models).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('should fetch live models for Anthropic /v1/models', async () => {
      const apiModels = {
        data: [
          { type: 'model', id: 'claude-opus-5', display_name: 'Claude Opus 5' },
          { type: 'model', id: 'claude-sonnet-5', display_name: 'Claude Sonnet 5' },
          { type: 'model', id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
        ],
      };
      globalThis.fetch = mock(async () => new Response(JSON.stringify(apiModels), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

      const provider = {
        ...PROVIDER_PRESETS.anthropic,
        apiKey: 'test-key',
      };

      const result = await fetchModels(provider);

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0]?.[0];
      expect(calledUrl).toContain('/models');
      // fetchAnthropicModels sorts the ids alphabetically
      expect(result.models).toEqual(['claude-haiku-4-5', 'claude-opus-5', 'claude-sonnet-5']);
    });

    // ── Regression tests ──────────────────────────────────────────────────
    // Bug: fetchModels for 'anthropic' format always returned Anthropic's
    // built-in staticModels even for custom providers using that format.
    // This contaminated fetchedModels cache with Anthropic's model names,
    // overriding the user's custom model list.

    it('[REGRESSION] should NOT return Anthropic static models for a custom provider with anthropic format', async () => {
      const customProvider = {
        id: 'custom_12345',
        name: 'My Anthropic-Compatible LLM',
        apiUrl: 'https://my-llm.example.com/v1',
        apiKey: 'sk-custom-key',
        format: 'anthropic' as const,
        models: ['my-model-1', 'my-model-2'],
        defaultModel: 'my-model-1',
      };

      const result = await fetchModels(customProvider);

      // Must NOT leak Anthropic's built-in model names into a custom provider cache.
      expect(result.models).toEqual([]);
      expect(result.models).not.toContain('claude-sonnet-4-6');
      expect(result.models).not.toContain('claude-3-5-sonnet-20241022');
    });

    it('[REGRESSION] official Anthropic preset fetches its models from the live API', async () => {
      // Ensure the fix did not break the built-in Anthropic provider.
      globalThis.fetch = mock(async () => new Response(JSON.stringify({
        data: [{ type: 'model', id: 'claude-opus-5' }, { type: 'model', id: 'claude-sonnet-5' }],
      }), { status: 200 }));

      const provider = { ...PROVIDER_PRESETS.anthropic, apiKey: 'sk-real-key' };
      const result = await fetchModels(provider);

      expect(result.models).toBeDefined();
      expect(result.models?.length).toBeGreaterThan(0);
      expect(result.models).toContain('claude-opus-5');
      expect(result.models).toContain('claude-sonnet-5');
    });
  });
});
