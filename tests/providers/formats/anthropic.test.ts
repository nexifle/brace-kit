/**
 * Tests for Anthropic Format Module
 */

import { describe, expect, it } from 'bun:test';
import { formatAnthropic, parseAnthropicStream } from '../../../src/providers/formats/anthropic.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';
import { createMockStreamResponse } from '../../helpers/stream-mock';

describe('Anthropic Format', () => {
  describe('formatAnthropic', () => {
    const provider = {
      apiUrl: 'https://api.anthropic.com/v1',
      apiKey: 'test-api-key',
      model: 'claude-3-5-sonnet-20241022',
      defaultModel: 'claude-3-5-sonnet-20241022',
    };

    it('should format simple messages', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(config.url).toBe('https://api.anthropic.com/v1/v1/messages');
      expect(body.model).toBe('claude-3-5-sonnet-20241022');
      expect(body.max_tokens).toBe(8192);
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
    });

    it('should include Anthropic headers', () => {
      const config = formatAnthropic(provider, [], [], {});

      expect(config.options.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-api-key': 'test-api-key',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      });
    });

    it('should extract system prompt from system messages', () => {
      const messages: Message[] = [{ role: 'system', content: 'You are helpful.' }];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.system).toBe('You are helpful.');
      expect(body.messages).toHaveLength(0);
    });

    it('should concatenate multiple system messages', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Be helpful.' },
        { role: 'system', content: 'Be concise.' },
      ];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.system).toBe('Be helpful.\nBe concise.');
    });

    it('should handle assistant messages with tool calls', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'Let me search for that.',
          toolCalls: [
            {
              id: 'toolu_123',
              name: 'search',
              arguments: '{"query": "test"}',
            },
          ],
        },
      ];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].role).toBe('assistant');
      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'Let me search for that.' });
      expect(body.messages[0].content[1].type).toBe('tool_use');
      expect(body.messages[0].content[1].name).toBe('search');
    });

    it('should batch consecutive tool results', () => {
      const messages: Message[] = [
        { role: 'tool', content: 'Result 1', toolCallId: 'call_1' },
        { role: 'tool', content: 'Result 2', toolCallId: 'call_2' },
      ];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[0].content).toHaveLength(2);
    });

    it('should mark error tool results', () => {
      const messages: Message[] = [
        { role: 'tool', content: 'Error: Something went wrong', toolCallId: 'call_1' },
      ];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].content[0].is_error).toBe(true);
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

      const config = formatAnthropic(provider, [], tools, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].name).toBe('search');
      expect(body.tools[0].input_schema).toBeDefined();
    });

    it('should enable reasoning when requested and model supports it', () => {
      const config = formatAnthropic(
        provider,
        [],
        [],
        { enableReasoning: true }
      );
      const body = JSON.parse(config.options.body as string);

      expect(body.thinking).toBeDefined();
      expect(body.thinking.type).toBe('enabled');
      expect(body.thinking.budget_tokens).toBe(4096);
    });

    it('should not enable reasoning when not requested', () => {
      const config = formatAnthropic(provider, [], [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.thinking).toBeUndefined();
    });

    it('should not enable reasoning when explicitly false', () => {
      const config = formatAnthropic(provider, [], [], { enableReasoning: false });
      const body = JSON.parse(config.options.body as string);

      expect(body.thinking).toBeUndefined();
    });

    it('should handle base64 image content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
            },
          ] as unknown as string,
        },
      ];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].content).toHaveLength(2);
      expect(body.messages[0].content[0]).toEqual({ type: 'text', text: 'What is this?' });
      expect(body.messages[0].content[1].type).toBe('image');
      expect(body.messages[0].content[1].source.type).toBe('base64');
      expect(body.messages[0].content[1].source.media_type).toBe('image/jpeg');
    });

    it('should handle URL image content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://example.com/image.jpg' },
            },
          ] as unknown as string,
        },
      ];

      const config = formatAnthropic(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.messages[0].content[0].source.type).toBe('url');
      expect(body.messages[0].content[0].source.url).toBe('https://example.com/image.jpg');
    });

    it('should handle streaming disabled', () => {
      const config = formatAnthropic(provider, [], [], { stream: false });
      const body = JSON.parse(config.options.body as string);

      expect(body.stream).toBe(false);
    });
  });

  describe('parseAnthropicStream', () => {
    it('should parse text content', async () => {
      const chunks = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('should parse thinking content', async () => {
      const chunks = [
        'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Let me think..."}}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'reasoning', content: 'Let me think...' });
    });

    it('should parse tool call start', async () => {
      const chunks = [
        'data: {"type":"content_block_start","content_block":{"type":"tool_use","id":"toolu_123","name":"search"}}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'tool_call_start',
        id: 'toolu_123',
        name: 'search',
      });
    });

    it('should parse tool call delta', async () => {
      const chunks = [
        'data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{\\"query\\"" }}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'tool_call_delta', content: '{"query"' });
    });

    it('should stop on message_stop', async () => {
      const chunks = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"After stop"}}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].content).toBe('Hi');
    });

    it('should skip lines without data: prefix', async () => {
      const chunks = [
        'event: content_block_delta\n',
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Test"}}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const chunks = [
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Test"}}\n\n',
      ];
      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseAnthropicStream(response, controller.signal)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });
  });
});
