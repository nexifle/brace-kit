/**
 * Tests for Providers Index Module (Unified Interfaces)
 */

import { describe, expect, it } from 'bun:test';
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
          model: 'grok-2-image-1212',
        };
        const messages: Message[] = [{ role: 'user', content: 'A sunset' }];

        const config = formatRequest(provider, messages);
        const body = JSON.parse(config.options.body as string);

        expect(config.url).toContain('/images/generations');
        expect(body.prompt).toBe('A sunset');
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

    it('should use OpenAI parser for unknown format', async () => {
      const provider = {
        ...PROVIDER_PRESETS.custom,
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

    it('should return static models for Anthropic', async () => {
      const provider = {
        ...PROVIDER_PRESETS.anthropic,
        apiKey: 'test-key',
      };

      const result = await fetchModels(provider);

      expect(result.models).toBeDefined();
      expect(result.models?.length).toBeGreaterThan(0);
      expect(result.models).toContain('claude-3-5-sonnet-20241022');
    });
  });
});
