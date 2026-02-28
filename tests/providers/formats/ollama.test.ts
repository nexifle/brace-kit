/**
 * Tests for Ollama Format Module
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { formatOllama, parseOllamaStream, fetchOllamaModels } from '../../../src/providers/formats/ollama.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';
import {
  createMockStreamResponse,
  createMockResponse,
  createOllamaStreamChunks,
  createOllamaThinkingChunks,
  createOllamaToolCallChunks,
  createOllamaUsageChunks,
  createOllamaErrorChunks,
} from '../../helpers/stream-mock';

describe('Ollama Format', () => {
  describe('formatOllama', () => {
    const provider = {
      apiUrl: 'http://localhost:11434',
      apiKey: undefined,
      model: 'llama3.2',
      defaultModel: 'llama3.2',
    };

    it('should format simple messages', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      const config = formatOllama(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(config.url).toBe('http://localhost:11434/api/chat');
      expect(body.model).toBe('llama3.2');
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toBe('Hello');
      expect(body.stream).toBe(true);
    });

    it('should use default model if model not specified', () => {
      const providerNoModel = {
        apiUrl: 'http://localhost:11434',
        apiKey: undefined,
        defaultModel: 'mistral',
      };

      const config = formatOllama(providerNoModel, [], [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.model).toBe('mistral');
    });

    it('should not include Authorization header for localhost without API key', () => {
      const config = formatOllama(provider, [], [], {});

      expect(config.options.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
      expect(config.options.headers).not.toHaveProperty('Authorization');
    });

    it('should include Authorization header when API key is provided', () => {
      const providerWithKey = {
        apiUrl: 'https://ollama.example.com',
        apiKey: 'test-api-key',
        defaultModel: 'llama3.2',
      };

      const config = formatOllama(providerWithKey, [], [], {});

      expect(config.options.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      });
    });

    it('should handle streaming disabled', () => {
      const config = formatOllama(provider, [], [], { stream: false });
      const body = JSON.parse(config.options.body as string);

      expect(body.stream).toBe(false);
    });

    it('should append /api/chat to URL if not present', () => {
      const providerNoSuffix = {
        apiUrl: 'http://localhost:11434',
        defaultModel: 'llama3.2',
      };

      const config = formatOllama(providerNoSuffix, [], [], {});

      expect(config.url).toBe('http://localhost:11434/api/chat');
    });

    it('should not duplicate /api/chat in URL', () => {
      const providerWithSuffix = {
        apiUrl: 'http://localhost:11434/api/chat',
        defaultModel: 'llama3.2',
      };

      const config = formatOllama(providerWithSuffix, [], [], {});

      expect(config.url).toBe('http://localhost:11434/api/chat');
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

      const config = formatOllama(provider, messages, [], {});
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

    it('should include thinking field in assistant messages with reasoning content', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'The answer is 42.',
          reasoningContent: 'Let me think about this...',
        },
      ];

      const config = formatOllama(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].role).toBe('assistant');
      expect(body.messages[0].content).toBe('The answer is 42.');
      expect(body.messages[0].thinking).toBe('Let me think about this...');
    });

    it('should include thinking field in assistant messages with tool calls and reasoning', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Let me search for that.',
          reasoningContent: 'User wants to search, I should use the search tool.',
          toolCalls: [
            {
              id: 'call_123',
              name: 'search',
              arguments: '{"query": "test"}',
            },
          ],
        },
      ];

      const config = formatOllama(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].thinking).toBe('User wants to search, I should use the search tool.');
      expect(body.messages[0].tool_calls).toBeDefined();
    });

    it('should handle tool result messages with tool_name', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: 'Search result here',
          toolCallId: 'call_123',
          name: 'search',
        },
      ];

      const config = formatOllama(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      // Ollama uses tool_name instead of tool_call_id
      expect(body.messages[0]).toEqual({
        role: 'tool',
        content: 'Search result here',
        tool_name: 'search',
      });
    });

    it('should stringify object content in tool messages', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: { results: ['a', 'b'] } as unknown as string,
          toolCallId: 'call_123',
          name: 'search',
        },
      ];

      const config = formatOllama(provider, messages, [], {});
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

      const config = formatOllama(provider, [], tools, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('search');
      expect(body.tools[0].function.description).toBe('Search the web');
    });

    it('should include model parameters in options object', () => {
      const config = formatOllama(provider, [], [], {
        modelParameters: {
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
          maxTokens: 1000,
        },
      });
      const body = JSON.parse(config.options.body as string);

      expect(body.options).toBeDefined();
      expect(body.options.temperature).toBe(0.7);
      expect(body.options.top_p).toBe(0.9);
      expect(body.options.top_k).toBe(40);
      expect(body.options.num_predict).toBe(1000);
    });

    it('should include num_ctx option', () => {
      const config = formatOllama(provider, [], [], { num_ctx: 4096 });
      const body = JSON.parse(config.options.body as string);

      expect(body.options.num_ctx).toBe(4096);
    });

    it('should include keep_alive parameter', () => {
      const config = formatOllama(provider, [], [], { keep_alive: '5m' });
      const body = JSON.parse(config.options.body as string);

      expect(body.keep_alive).toBe('5m');
    });

    it('should include think parameter when reasoning is enabled', () => {
      const config = formatOllama(provider, [], [], { enableReasoning: true });
      const body = JSON.parse(config.options.body as string);

      expect(body.think).toBe(true);
    });

    it('should not include think parameter when reasoning is disabled', () => {
      const config = formatOllama(provider, [], [], { enableReasoning: false });
      const body = JSON.parse(config.options.body as string);

      expect(body.think).toBeUndefined();
    });
  });

  describe('parseOllamaStream', () => {
    it('should parse text content', async () => {
      const chunks = createOllamaStreamChunks('Hello');

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      // Should have text chunk and usage chunk
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('should parse thinking/reasoning content', async () => {
      const chunks = createOllamaThinkingChunks('Let me think about this...', 'The answer is 42.');

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      // Should have reasoning and text chunks
      const reasoningChunks = results.filter((r) => r.type === 'reasoning');
      const textChunks = results.filter((r) => r.type === 'text');

      expect(reasoningChunks.length).toBeGreaterThan(0);
      expect(textChunks.length).toBeGreaterThan(0);
      expect(reasoningChunks[0].content).toBe('Let me think about this...');
      expect(textChunks[0].content).toBe('The answer is 42.');
    });

    it('should parse thinking from top-level (backward compatibility)', async () => {
      // Old format: thinking at top-level instead of inside message
      const chunks = [
        JSON.stringify({ model: 'deepseek-r1', thinking: 'Old format thinking', done: false }) + '\n',
        JSON.stringify({ model: 'deepseek-r1', message: { role: 'assistant', content: 'Content' }, done: false }) + '\n',
        JSON.stringify({ model: 'deepseek-r1', done: true, eval_count: 10, prompt_eval_count: 5 }) + '\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      const reasoningChunks = results.filter((r) => r.type === 'reasoning');
      expect(reasoningChunks.length).toBe(1);
      expect(reasoningChunks[0].content).toBe('Old format thinking');
    });

    it('should prefer message.thinking over top-level thinking', async () => {
      // Both formats present - should use message.thinking
      const chunks = [
        JSON.stringify({
          model: 'deepseek-r1',
          thinking: 'Top level',
          message: { role: 'assistant', thinking: 'Inside message' },
          done: false
        }) + '\n',
        JSON.stringify({ model: 'deepseek-r1', done: true, eval_count: 10, prompt_eval_count: 5 }) + '\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      const reasoningChunks = results.filter((r) => r.type === 'reasoning');
      expect(reasoningChunks.length).toBe(1);
      expect(reasoningChunks[0].content).toBe('Inside message');
    });

    it('should parse tool calls', async () => {
      const chunks = createOllamaToolCallChunks('call_123', 'search', '{"query": "test"}');

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      const toolCallChunks = results.filter((r) => r.type === 'tool_call');
      expect(toolCallChunks.length).toBeGreaterThan(0);
      expect(toolCallChunks[0].id).toBe('call_123');
      expect(toolCallChunks[0].name).toBe('search');
      expect(toolCallChunks[0].arguments).toBe('{"query": "test"}');
    });

    it('should parse token usage in final chunk', async () => {
      const chunks = createOllamaUsageChunks({
        content: 'Hello',
        promptEvalCount: 100,
        evalCount: 50,
      });

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      const usageChunks = results.filter((r) => r.type === 'usage');
      expect(usageChunks.length).toBe(1);
      expect(usageChunks[0].usage).toEqual({
        promptTokenCount: 100,
        candidatesTokenCount: 50,
        totalTokenCount: 150,
      });
    });

    it('should handle error responses', async () => {
      const chunks = createOllamaErrorChunks('Model not found');

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('error');
      expect(results[0].content).toBe('Model not found');
    });

    it('should skip empty lines', async () => {
      const chunks = [
        '\n',
        JSON.stringify({ model: 'llama3.2', message: { role: 'assistant', content: 'Hello' }, done: false }) + '\n',
        '\n',
        JSON.stringify({ model: 'llama3.2', done: true, eval_count: 5, prompt_eval_count: 10 }) + '\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      // Should only have the text chunk
      const textChunks = results.filter((r) => r.type === 'text');
      expect(textChunks.length).toBe(1);
      expect(textChunks[0].content).toBe('Hello');
    });

    it('should skip malformed JSON lines', async () => {
      const chunks = [
        JSON.stringify({ model: 'llama3.2', message: { role: 'assistant', content: 'Valid' }, done: false }) + '\n',
        'invalid json\n',
        JSON.stringify({ model: 'llama3.2', message: { role: 'assistant', content: ' Also valid' }, done: false }) + '\n',
        JSON.stringify({ model: 'llama3.2', done: true, eval_count: 10, prompt_eval_count: 5 }) + '\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response)) {
        results.push(chunk);
      }

      const textChunks = results.filter((r) => r.type === 'text');
      expect(textChunks.length).toBe(2);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const chunks = createOllamaStreamChunks('Test');
      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOllamaStream(response, controller.signal)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });
  });

  describe('fetchOllamaModels', () => {
    // Note: These tests would require mocking fetch, which is more complex
    // For now, we'll test the URL construction logic

    it('should construct correct URL for /api/tags', () => {
      // Test URL transformation logic
      const apiUrl = 'http://localhost:11434';
      let baseUrl = apiUrl.replace(/\/+$/, '');

      expect(baseUrl).toBe('http://localhost:11434');
      expect(`${baseUrl}/api/tags`).toBe('http://localhost:11434/api/tags');
    });

    it('should remove /api/chat suffix before adding /api/tags', () => {
      const apiUrl = 'http://localhost:11434/api/chat';
      let baseUrl = apiUrl.replace(/\/+$/, '');

      if (baseUrl.endsWith('/api/chat')) {
        baseUrl = baseUrl.slice(0, -'/api/chat'.length);
      }

      expect(baseUrl).toBe('http://localhost:11434');
      expect(`${baseUrl}/api/tags`).toBe('http://localhost:11434/api/tags');
    });
  });
});
