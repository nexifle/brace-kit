/**
 * Tests for the OpenAI Responses API Format Module
 */

import { describe, expect, it } from 'bun:test';
import {
  formatResponses,
  parseResponsesStream,
  extractResponsesText,
} from '../../../src/providers/formats/responses.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';

// Minimal streaming response with a mock reader (same pattern as index.test.ts)
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
    body: { getReader: () => reader },
  } as unknown as Response;
}

const provider = {
  apiUrl: 'https://cli-chat-proxy.grok.com/v1',
  apiKey: 'test-token',
  defaultModel: 'grok-4.5',
  id: 'grok',
};

describe('Grok Responses Format', () => {
  describe('formatResponses', () => {
    it('should post to /responses with a Bearer token', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const config = formatResponses(provider, messages, [], {});
      const headers = config.options.headers as Record<string, string>;

      expect(config.url).toBe('https://cli-chat-proxy.grok.com/v1/responses');
      expect(headers.Authorization).toBe('Bearer test-token');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should send the Grok CLI identity headers to the chat proxy (version gate)', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const config = formatResponses(provider, messages, [], {});
      const headers = config.options.headers as Record<string, string>;

      // The proxy rejects requests without a known CLI version (HTTP 426)
      expect(headers['x-grok-client-version']).toBe('0.2.120');
      expect(headers['X-XAI-Token-Auth']).toBe('xai-grok-cli');
      expect(headers['User-Agent']).toBe('xai-grok-workspace/0.2.120');
      expect(headers['x-grok-client-identifier']).toBe('grok-shell');
      expect(headers['x-authenticateresponse']).toBe('authenticate-response');
    });

    it('should NOT send Grok CLI identity headers to other Responses endpoints', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const config = formatResponses(
        { ...provider, apiUrl: 'https://api.example.com/v1' },
        messages,
        [],
        {}
      );
      const headers = config.options.headers as Record<string, string>;

      expect(headers['x-grok-client-version']).toBeUndefined();
      expect(headers['X-XAI-Token-Auth']).toBeUndefined();
      expect(config.url).toBe('https://api.example.com/v1/responses');
    });

    it('should map system messages to instructions and remove them from input', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Be concise' },
        { role: 'system', content: 'Use tools' },
        { role: 'user', content: 'Hi' },
      ];
      const config = formatResponses(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.instructions).toBe('Be concise\n\nUse tools');
      expect(body.input).toHaveLength(1);
      expect(body.input[0].role).toBe('user');
    });

    it('should omit instructions when there are no system messages', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const config = formatResponses(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.instructions).toBeUndefined();
    });

    it('should map user, assistant and tool messages to input items', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Question' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'c1', name: 'search', arguments: '{"q":"x"}' }],
        },
        { role: 'tool', toolCallId: 'c1', content: 'results' },
        { role: 'assistant', content: 'Done' },
      ];
      const config = formatResponses(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);
      const input = body.input as Array<Record<string, unknown>>;

      expect(input[0].role).toBe('user');
      expect((input[0].content as Array<Record<string, unknown>>)[0]).toEqual({
        type: 'input_text',
        text: 'Question',
      });

      const assistantCall = input[1] as Record<string, unknown>;
      const callParts = assistantCall.content as Array<Record<string, unknown>>;
      expect(callParts.find((p) => p.type === 'function_call')).toEqual({
        type: 'function_call',
        id: 'c1',
        call_id: 'c1',
        name: 'search',
        arguments: '{"q":"x"}',
        status: 'completed',
      });

      expect(input[2]).toEqual({
        type: 'function_call_output',
        call_id: 'c1',
        output: 'results',
      });

      expect((input[3].content as Array<Record<string, unknown>>)[0]).toEqual({
        type: 'output_text',
        text: 'Done',
      });
    });

    it('should use max_output_tokens (not max_tokens)', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const config = formatResponses(provider, messages, [], {
        modelParameters: { temperature: 0.7, maxTokens: 512, topP: 0.9 },
      });
      const body = JSON.parse(config.options.body as string);

      expect(body.max_output_tokens).toBe(512);
      expect(body.max_tokens).toBeUndefined();
      expect(body.temperature).toBe(0.7);
      expect(body.top_p).toBe(0.9);
    });

    it('should map reasoning level to xAI effort when enabled', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const config = formatResponses(provider, messages, [], {
        enableReasoning: true,
        reasoningLevel: 'minimal',
      });
      const body = JSON.parse(config.options.body as string);

      expect(body.reasoning).toEqual({ effort: 'low' });
    });

    it('should omit reasoning on omitThinkingParams', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const config = formatResponses(provider, messages, [], {
        enableReasoning: true,
        reasoningLevel: 'high',
        omitThinkingParams: true,
      });
      const body = JSON.parse(config.options.body as string);

      expect(body.reasoning).toBeUndefined();
    });

    it('should map tools to Responses function tools', () => {
      const tools: MCPTool[] = [
        { name: 'search', description: 'Search the web', inputSchema: { type: 'object' } },
      ];
      const messages: Message[] = [{ role: 'user', content: 'Hi' }];
      const config = formatResponses(provider, messages, tools, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toEqual([
        {
          type: 'function',
          name: 'search',
          description: 'Search the web',
          parameters: { type: 'object' },
        },
      ]);
    });
  });

  describe('parseResponsesStream', () => {
    it('should parse text deltas (string delta), tool calls, reasoning and usage', async () => {
      const chunks = [
        'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
        'data: {"type":"response.reasoning_summary_text.delta","delta":"The user said \\"Hey\\"."}\n\n',
        'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","name":"search","arguments":"{\\"q\\":\\"x\\"}"}}\n\n',
        'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,"delta":"{\\"q\\":\\"y\\"}"}\n\n',
        'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"reasoning","summary":[]}}\n\n',
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}\n\n',
        'data: [DONE]\n\n',
      ];

      const results = [];
      for await (const chunk of parseResponsesStream(createMockResponse(chunks))) {
        results.push(chunk);
      }

      expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
      expect(results[1]).toEqual({ type: 'reasoning', content: 'The user said "Hey".' });
      expect(results[2]).toEqual({ type: 'tool_call_start', id: 'fc_1', index: 0, name: 'search' });
      expect(results[3]).toEqual({
        type: 'tool_call_delta',
        id: 'fc_1',
        index: 0,
        content: '{"q":"x"}',
      });
      // reasoning item skipped — results[4] is the args delta
      expect(results[4]).toEqual({
        type: 'tool_call_delta',
        id: 'fc_1',
        index: 0,
        content: '{"q":"y"}',
      });
      expect(results[5]).toEqual({
        type: 'usage',
        usage: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      });
    });

    it('should surface an error event', async () => {
      const chunks = [
        'data: {"type":"error","error":{"message":"Server exploded"}}\n\n',
        'data: [DONE]\n\n',
      ];

      const results = [];
      for await (const chunk of parseResponsesStream(createMockResponse(chunks))) {
        results.push(chunk);
      }

      expect(results).toEqual([{ type: 'error', content: 'Server exploded' }]);
    });

    it('[REGRESSION] should render text from the real chat-proxy event sequence', async () => {
      // Mirrors the production SSE trace for a plain "Hey" reply: reasoning
      // summary first, then the assistant message lifecycle.
      const chunks = [
        'data: {"type":"response.created","response":{"id":"r1"}}\n\n',
        'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning","id":"rs_1","status":"in_progress"}}\n\n',
        'data: {"type":"response.reasoning_summary_text.delta","delta":"The user just said \\"Hey\\".","item_id":"rs_1","output_index":0}\n\n',
        'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"message","role":"assistant","id":"msg_1","status":"in_progress"}}\n\n',
        'data: {"type":"response.content_part.added","output_index":1,"part":{"type":"output_text","text":""}}\n\n',
        'data: {"type":"response.output_text.delta","delta":"Hey","item_id":"msg_1","output_index":1}\n\n',
        'data: {"type":"response.output_text.delta","delta":"!","item_id":"msg_1","output_index":1}\n\n',
        'data: {"type":"response.output_text.delta","delta":" How can I help you today?","item_id":"msg_1","output_index":1}\n\n',
        'data: {"type":"response.output_text.done","text":"Hey! How can I help you today?","item_id":"msg_1","output_index":1}\n\n',
        'data: {"type":"response.output_item.done","item":{"type":"message","id":"msg_1"},"output_index":1}\n\n',
        'data: {"type":"response.completed","response":{"usage":{"input_tokens":20,"output_tokens":6,"total_tokens":26}}}\n\n',
        'data: [DONE]\n\n',
      ];

      const text = [];
      const reasoning = [];
      let usage;
      for await (const chunk of parseResponsesStream(createMockResponse(chunks))) {
        if (chunk.type === 'text') text.push(chunk.content);
        else if (chunk.type === 'reasoning') reasoning.push(chunk.content);
        else if (chunk.type === 'usage') usage = chunk.usage;
      }

      expect(text.join('')).toBe('Hey! How can I help you today?');
      expect(reasoning.join('')).toBe('The user just said "Hey".');
      expect(usage.totalTokenCount).toBe(26);
    });
  });

  describe('extractResponsesText', () => {
    it('should return the top-level output_text string', () => {
      expect(extractResponsesText({ output_text: 'hello' })).toBe('hello');
    });

    it('should join output_text parts from output message items', () => {
      const data = {
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: 'a' },
              { type: 'output_text', text: 'b' },
            ],
          },
        ],
      };
      expect(extractResponsesText(data)).toBe('ab');
    });

    it('should return empty when no text present', () => {
      expect(extractResponsesText({ output: [{ type: 'function_call_output', output: '{}' }] })).toBe('');
      expect(extractResponsesText({})).toBe('');
    });
  });
});
