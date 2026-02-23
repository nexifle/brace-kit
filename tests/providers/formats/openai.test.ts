/**
 * Tests for OpenAI Format Module
 */

import { describe, expect, it } from 'bun:test';
import { formatOpenAI, parseOpenAIStream } from '../../../src/providers/formats/openai.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';
import { createMockStreamResponse } from '../../helpers/stream-mock';

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
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call_123","index":0,"function":{"name":"search","arguments":"{\\"query\\""}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseOpenAIStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('tool_call');
      expect(results[0].id).toBe('call_123');
      expect(results[0].name).toBe('search');
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
  });
});
