/**
 * Tests for OpenAI Format Module
 */

import { describe, expect, it } from 'bun:test';
import { formatOpenAI, parseOpenAIStream } from '../../../src/providers/formats/openai.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';
import { createMockStreamResponse, createOpenAIUsageChunks } from '../../helpers/stream-mock';

describe('OpenAI Format', () => {
  describe('formatOpenAI', () => {
    const provider = {
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'test-api-key',
      model: 'gpt-4o',
      defaultModel: 'gpt-4o',
    };

    it('should format simple messages', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      const config = formatOpenAI(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(config.url).toBe('https://api.openai.com/v1/chat/completions');
      expect(body.model).toBe('gpt-4o');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('Hello');
      expect(body.stream).toBe(true);
    });

    it('should use default model if model not specified', () => {
      const providerNoModel = {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-api-key',
        defaultModel: 'gpt-4-turbo',
      };

      const config = formatOpenAI(providerNoModel, [], [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.model).toBe('gpt-4-turbo');
    });

    it('should include Authorization header', () => {
      const config = formatOpenAI(provider, [], [], {});

      expect(config.options.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      });
    });

    it('should handle streaming disabled', () => {
      const config = formatOpenAI(provider, [], [], { stream: false });
      const body = JSON.parse(config.options.body as string);

      expect(body.stream).toBe(false);
    });

    it('should append /chat/completions to URL if not present', () => {
      const providerNoSuffix = {
        apiUrl: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        defaultModel: 'gpt-4o',
      };

      const config = formatOpenAI(providerNoSuffix, [], [], {});

      expect(config.url).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('should not duplicate /chat/completions in URL', () => {
      const providerWithSuffix = {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: 'test-key',
        defaultModel: 'gpt-4o',
      };

      const config = formatOpenAI(providerWithSuffix, [], [], {});

      expect(config.url).toBe('https://api.openai.com/v1/chat/completions');
    });

    it('should handle assistant messages with tool calls', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Let me help you with that.',
          toolCalls: [
            {
              id: 'call_123',
              name: 'search',
              arguments: '{"query": "test"}',
            },
          ],
        },
      ];

      const config = formatOpenAI(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].role).toBe('assistant');
      expect(body.messages[0].content).toBe('Let me help you with that.');
      expect(body.messages[0].tool_calls).toBeDefined();
      expect(body.messages[0].tool_calls).toHaveLength(1);
      expect(body.messages[0].tool_calls[0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"query": "test"}',
        },
      });
    });

    it('should handle tool result messages', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: 'Search result here',
          toolCallId: 'call_123',
        },
      ];

      const config = formatOpenAI(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_123',
        content: 'Search result here',
      });
    });

    it('should stringify object content in tool messages', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: { results: ['a', 'b'] } as unknown as string,
          toolCallId: 'call_123',
        },
      ];

      const config = formatOpenAI(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].content).toBe('{"results":["a","b"]}');
    });

    it('should include tools in request body', () => {
      const tools: MCPTool[] = [
        {
          name: 'search',
          description: 'Search the web',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ];

      const config = formatOpenAI(provider, [], tools, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('search');
      expect(body.tools[0].function.description).toBe('Search the web');
    });

    it('should clean schema in tool definitions', () => {
      const tools: MCPTool[] = [
        {
          name: 'test',
          inputSchema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            additionalProperties: false,
          },
        },
      ];

      const config = formatOpenAI(provider, [], tools, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.tools[0].function.parameters.additionalProperties).toBeUndefined();
    });
  });

  describe('parseOpenAIStream', () => {
    it('should parse text content', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n', 'data: [DONE]\n\n'];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('should parse tool calls', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_123","index":0,"function":{"name":"search","arguments":"{\\"query\\":\\"hello\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      // First delta with a name → tool_call_start (with its arguments)
      expect(results[0]).toEqual({
        type: 'tool_call_start',
        id: 'call_123',
        index: 0,
        name: 'search',
      });
      expect(results[1]).toEqual({
        type: 'tool_call_delta',
        id: 'call_123',
        index: 0,
        content: '{"query":"hello"}',
      });
    });

    it('[REGRESSION] streams multi-part tool-call arguments without dropping them', async () => {
      // Real OpenAI/Groq/xAI streams split arguments across deltas: the first
      // delta carries the name, later deltas carry only JSON fragments. These
      // fragments must surface as tool_call_delta so the caller can merge them.
      const chunks = [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","index":0,"function":{"name":"tavily_search","arguments":""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","index":0,"function":{"arguments":"{\\"query\\":\\"bracekit\\""}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_1","index":0,"function":{"arguments":"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ type: 'tool_call_start', id: 'call_1', index: 0, name: 'tavily_search' });
      expect(results[1]).toEqual({ type: 'tool_call_delta', id: 'call_1', index: 0, content: '{"query":"bracekit"' });
      expect(results[2]).toEqual({ type: 'tool_call_delta', id: 'call_1', index: 0, content: '}' });

      // Simulate the caller's merge: start + deltas concatenated → valid JSON
      const merged = (results[1].content as string) + (results[2].content as string);
      expect(JSON.parse(merged)).toEqual({ query: 'bracekit' });
    });

    it('should handle [DONE] message', async () => {
      const chunks = ['data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n', 'data: [DONE]\n\n'];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
    });

    it('should skip malformed JSON', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Valid"}}]}\n\n',
        'data: invalid json\n\n',
        'data: {"choices":[{"delta":{"content":" Also valid"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
    });

    it('should skip lines without data: prefix', async () => {
      const chunks = [
        ': comment\n\n',
        'data: {"choices":[{"delta":{"content":"Test"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const chunks = ['data: {"choices":[{"delta":{"content":"Test"}}]}\n\n'];
      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response, controller.signal)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });

    // Token Usage Tests
    describe('token usage parsing', () => {
      it('should parse basic usage metadata', async () => {
        const chunks = createOpenAIUsageChunks({
          content: 'Hello',
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseOpenAIStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
        expect(results[1].type).toBe('usage');
        expect(results[1].usage).toEqual({
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        });
      });

      it('should parse usage with cached tokens (GLM/Zhipu format)', async () => {
        const chunks = createOpenAIUsageChunks({
          content: 'Response',
          promptTokens: 25471,
          completionTokens: 3479,
          totalTokens: 28950,
          cachedTokens: 17344,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseOpenAIStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ type: 'text', content: 'Response' });
        expect(results[1].type).toBe('usage');
        expect(results[1].usage).toEqual({
          promptTokenCount: 25471,
          candidatesTokenCount: 3479,
          totalTokenCount: 28950,
          cachedContentTokenCount: 17344,
        });
      });

      it('should parse usage without content (final chunk only)', async () => {
        const chunks = createOpenAIUsageChunks({
          promptTokens: 500,
          completionTokens: 100,
          totalTokens: 600,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseOpenAIStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(1);
        expect(results[0].type).toBe('usage');
        expect(results[0].usage).toEqual({
          promptTokenCount: 500,
          candidatesTokenCount: 100,
          totalTokenCount: 600,
        });
      });

      it('should parse usage with tool_use finish_reason', async () => {
        const chunks = createOpenAIUsageChunks({
          promptTokens: 5235,
          completionTokens: 367,
          totalTokens: 5602,
          cachedTokens: 11776,
          finishReason: 'tool_use',
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseOpenAIStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(1);
        expect(results[0].type).toBe('usage');
        expect(results[0].usage.promptTokenCount).toBe(5235);
        expect(results[0].usage.cachedContentTokenCount).toBe(11776);
      });

      it('should handle usage with zero values', async () => {
        const chunks = createOpenAIUsageChunks({
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseOpenAIStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(1);
        expect(results[0].type).toBe('usage');
        expect(results[0].usage).toEqual({
          promptTokenCount: 0,
          candidatesTokenCount: 0,
          totalTokenCount: 0,
        });
      });
    });
  });

  describe('reasoning parameters', () => {
    const base = {
      apiUrl: 'https://api.openai.com/v1',
      apiKey: 'test-api-key',
      model: 'gpt-5.6-sol',
      defaultModel: 'gpt-5.6-sol',
    };

    it('sends reasoning_effort for OpenAI when reasoning enabled', () => {
      const config = formatOpenAI(base, [], [], { enableReasoning: true, reasoningLevel: 'high' });
      const body = JSON.parse(config.options.body as string);
      expect(body.reasoning_effort).toBe('high');
    });

    it('clamps max → high for OpenAI', () => {
      const config = formatOpenAI(base, [], [], { enableReasoning: true, reasoningLevel: 'max' });
      const body = JSON.parse(config.options.body as string);
      expect(body.reasoning_effort).toBe('high');
    });

    it('omits reasoning_effort when disabled', () => {
      const config = formatOpenAI(base, [], [], { enableReasoning: false, reasoningLevel: 'high' });
      const body = JSON.parse(config.options.body as string);
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('maps minimal → low for xAI', () => {
      const xaiProvider = { ...base, id: 'xai', model: 'grok-4.5', defaultModel: 'grok-4.5' };
      const config = formatOpenAI(xaiProvider, [], [], { enableReasoning: true, reasoningLevel: 'minimal' });
      const body = JSON.parse(config.options.body as string);
      expect(body.reasoning_effort).toBe('low');
    });

    it('enables thinking + reasoning_effort for DeepSeek', () => {
      const ds = { ...base, id: 'deepseek', model: 'deepseek-v4-pro', defaultModel: 'deepseek-v4-pro' };
      const config = formatOpenAI(ds, [], [], { enableReasoning: true, reasoningLevel: 'max' });
      const body = JSON.parse(config.options.body as string);
      expect(body.thinking).toEqual({ type: 'enabled' });
      expect(body.reasoning_effort).toBe('max');
    });

    it('disables DeepSeek thinking when reasoning is off (defaults to on server-side)', () => {
      const ds = { ...base, id: 'deepseek', model: 'deepseek-v4-pro', defaultModel: 'deepseek-v4-pro' };
      const config = formatOpenAI(ds, [], [], { enableReasoning: false });
      const body = JSON.parse(config.options.body as string);
      expect(body.thinking).toEqual({ type: 'disabled' });
    });

    it('omitThinkingParams leaves no thinking footprint for DeepSeek (graceful-fallback retry)', () => {
      const ds = { ...base, id: 'deepseek', model: 'deepseek-v4-pro', defaultModel: 'deepseek-v4-pro' };
      const config = formatOpenAI(ds, [], [], {
        enableReasoning: false,
        omitThinkingParams: true,
      });
      const body = JSON.parse(config.options.body as string);
      expect(body.thinking).toBeUndefined();
      expect(body.reasoning_effort).toBeUndefined();
    });

    it('sends reasoning_effort for Groq and custom endpoints', () => {
      const groq = { ...base, id: 'groq', model: 'groq/compound', defaultModel: 'groq/compound' };
      const config = formatOpenAI(groq, [], [], { enableReasoning: true, reasoningLevel: 'medium' });
      const body = JSON.parse(config.options.body as string);
      expect(body.reasoning_effort).toBe('medium');

      const custom = { ...base, id: 'custom', model: 'my-model', defaultModel: 'my-model' };
      const config2 = formatOpenAI(custom, [], [], { enableReasoning: true, reasoningLevel: 'low' });
      const body2 = JSON.parse(config2.options.body as string);
      expect(body2.reasoning_effort).toBe('low');
    });
  });
});
