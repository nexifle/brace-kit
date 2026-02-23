/**
 * Tests for Gemini Format Module
 */

import { describe, expect, it } from 'bun:test';
import { formatGemini, parseGeminiStream } from '../../../src/providers/formats/gemini.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';
import { createMockStreamResponse } from '../../helpers/stream-mock';

describe('Gemini Format', () => {
  describe('formatGemini', () => {
    const provider = {
      apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
      apiKey: 'test-api-key',
      model: 'gemini-2.0-flash',
      defaultModel: 'gemini-2.0-flash',
    };

    it('should format simple messages', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(config.url).toContain('gemini-2.0-flash:streamGenerateContent');
      expect(config.url).toContain('key=test-api-key');
      expect(body.contents).toHaveLength(1);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].text).toBe('Hello');
    });

    it('should use non-streaming endpoint when stream is false', () => {
      const config = formatGemini(provider, [], [], { stream: false });

      expect(config.url).toContain(':generateContent');
      expect(config.url).not.toContain(':streamGenerateContent');
    });

    it('should extract system instructions', () => {
      const messages: Message[] = [{ role: 'system', content: 'You are helpful.' }];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.systemInstruction).toBeDefined();
      expect(body.systemInstruction.parts[0].text).toBe('You are helpful.');
    });

    it('should convert assistant role to model', () => {
      const messages: Message[] = [{ role: 'assistant', content: 'Hello back!' }];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.contents[0].role).toBe('model');
      expect(body.contents[0].parts[0].text).toBe('Hello back!');
    });

    it('should handle assistant messages with tool calls', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            {
              id: 'call_123',
              name: 'search',
              arguments: '{"query": "test"}',
            },
          ],
        },
      ];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.contents[0].role).toBe('model');
      expect(body.contents[0].parts[0].functionCall).toBeDefined();
      expect(body.contents[0].parts[0].functionCall.name).toBe('search');
      expect(body.contents[0].parts[0].functionCall.args).toEqual({ query: 'test' });
    });

    it('should handle tool result messages', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: 'Search result',
          toolCallId: 'call_123',
          name: 'search',
        },
      ];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.contents[0].role).toBe('user');
      expect(body.contents[0].parts[0].functionResponse).toBeDefined();
      expect(body.contents[0].parts[0].functionResponse.name).toBe('search');
    });

    it('should handle multimodal content', () => {
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

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.contents[0].parts).toHaveLength(2);
      expect(body.contents[0].parts[0].text).toBe('What is this?');
      expect(body.contents[0].parts[1].inlineData).toBeDefined();
      expect(body.contents[0].parts[1].inlineData.mimeType).toBe('image/jpeg');
    });

    it('should include function declarations for tools', () => {
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

      const config = formatGemini(provider, [], tools, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0].function_declarations).toBeDefined();
      expect(body.tools[0].function_declarations[0].name).toBe('search');
    });

    it('should include google_search when enabled', () => {
      const config = formatGemini(provider, [], [], { enableGoogleSearch: true });
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toBeDefined();
      expect(body.tools[0].google_search).toBeDefined();
    });

    it('should not include tools for no-tools models', () => {
      const noToolsProvider = {
        ...provider,
        model: 'gemini-2.5-flash-image',
      };

      const config = formatGemini(noToolsProvider, [], [], { enableGoogleSearch: true });
      const body = JSON.parse(config.options.body as string);

      expect(body.tools).toBeUndefined();
    });

    it('should include aspect ratio for image models', () => {
      const imageProvider = {
        ...provider,
        model: 'gemini-2.5-flash-image',
      };

      const config = formatGemini(imageProvider, [], [], { aspectRatio: '16:9' });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig).toBeDefined();
      expect(body.generationConfig.responseModalities).toContain('IMAGE');
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    });

    it('should enable reasoning for thinking models', () => {
      const thinkingProvider = {
        ...provider,
        model: 'gemini-2.0-flash-thinking-exp',
      };

      const config = formatGemini(thinkingProvider, [], [], { enableReasoning: true });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.thinkingConfig).toBeDefined();
      expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(24576);
    });

    it('should handle custom URL with /models/ path', () => {
      const customProvider = {
        ...provider,
        apiUrl: 'https://custom.googleapis.com/v1beta/models/gemini-custom',
      };

      const config = formatGemini(customProvider, [], [], {});

      expect(config.url).toContain('https://custom.googleapis.com/v1beta/models/gemini-custom?');
    });
  });

  describe('parseGeminiStream', () => {
    it('should parse text content', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
    });

    it('should parse thinking content', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Let me think...","thought":true}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ type: 'reasoning', content: 'Let me think...' });
    });

    it('should parse tool calls', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"search","args":{"query":"test"}}}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('tool_call');
      expect(results[0].name).toBe('search');
      expect(results[0].arguments).toBe('{"query":"test"}');
    });

    it('should parse inline image data', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"base64data"}}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'image',
        mimeType: 'image/png',
        imageData: 'base64data',
      });
    });

    it('should parse grounding metadata', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Search result"}]},"groundingMetadata":{"webSearchQueries":["test query"]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
      expect(results[1].type).toBe('grounding_metadata');
      expect(results[1].groundingMetadata).toBeDefined();
    });

    it('should parse IMAGE_SAFETY error', async () => {
      const chunks = [
        'data: {"candidates":[{"finishReason":"IMAGE_SAFETY","finishMessage":"Image filtered"}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('error');
      expect(results[0].content).toBe('Image filtered');
    });

    it('should parse IMAGE_OTHER error', async () => {
      const chunks = ['data: {"candidates":[{"finishReason":"IMAGE_OTHER"}]}\n\n'];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('error');
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const chunks = ['data: {"candidates":[{"content":{"parts":[{"text":"Test"}]}}]}\n\n'];
      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response, controller.signal)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });

    it('should skip lines without data: prefix', async () => {
      const chunks = [
        ': comment\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"Test"}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
    });
  });
});
