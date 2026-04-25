/**
 * Tests for Gemini Format Module
 */

import { describe, expect, it } from 'bun:test';
import { formatGemini, parseGeminiStream } from '../../../src/providers/formats/gemini.ts';
import type { Message, MCPTool } from '../../../src/types/index.ts';
import { createMockStreamResponse, createGeminiUsageChunks } from '../../helpers/stream-mock';

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
      expect(body.contents[0].parts[0].functionResponse.response).toEqual({ content: 'Search result' });
    });

    it('should group parallel tool results into a single user turn', () => {
      // When Gemini calls multiple tools in one model turn (parallel function calling),
      // all tool results must be in ONE user turn, not separate user turns.
      const messages: Message[] = [
        { role: 'user', content: 'Search for solar panels and wind energy' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [
            { id: 'tc1', name: 'search', arguments: '{"query":"solar panels"}' },
            { id: 'tc2', name: 'search', arguments: '{"query":"wind energy"}' },
          ],
        },
        { role: 'tool', content: 'Solar panel result', toolCallId: 'tc1', name: 'search' },
        { role: 'tool', content: 'Wind energy result', toolCallId: 'tc2', name: 'search' },
      ];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      // Should be: user → model → user (with both functionResponses in ONE turn)
      expect(body.contents).toHaveLength(3);
      expect(body.contents[0].role).toBe('user');
      expect(body.contents[1].role).toBe('model');
      expect(body.contents[2].role).toBe('user');

      // Both function responses must be in the SAME user turn
      expect(body.contents[2].parts).toHaveLength(2);
      expect(body.contents[2].parts[0].functionResponse.name).toBe('search');
      expect(body.contents[2].parts[0].functionResponse.response).toEqual({ content: 'Solar panel result' });
      expect(body.contents[2].parts[1].functionResponse.name).toBe('search');
      expect(body.contents[2].parts[1].functionResponse.response).toEqual({ content: 'Wind energy result' });
    });

    it('should keep sequential tool results in separate user turns', () => {
      // For sequential/chained tool calls (model calls one tool at a time),
      // each tool result should be in its own user turn (alternating with model turns).
      const messages: Message[] = [
        { role: 'user', content: 'Search step by step' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tc1', name: 'search', arguments: '{"query":"first"}' }],
        },
        { role: 'tool', content: 'First result', toolCallId: 'tc1', name: 'search' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'tc2', name: 'search', arguments: '{"query":"second"}' }],
        },
        { role: 'tool', content: 'Second result', toolCallId: 'tc2', name: 'search' },
      ];

      const config = formatGemini(provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      // Should alternate: user → model → user → model → user
      expect(body.contents).toHaveLength(5);
      expect(body.contents[0].role).toBe('user');   // Original user message
      expect(body.contents[1].role).toBe('model');  // First tool call
      expect(body.contents[2].role).toBe('user');   // First tool result
      expect(body.contents[3].role).toBe('model');  // Second tool call
      expect(body.contents[4].role).toBe('user');   // Second tool result

      // Each user turn has exactly one functionResponse
      expect(body.contents[2].parts).toHaveLength(1);
      expect(body.contents[4].parts).toHaveLength(1);
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

    it('should detect Gemini 3.1 image models by pattern', () => {
      const imageProvider = {
        ...provider,
        model: 'gemini-3.1-flash-image-preview',
      };

      const config = formatGemini(imageProvider, [], [], { aspectRatio: '1:1' });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.responseModalities).toContain('IMAGE');
    });

    it('should include imageSize for image models', () => {
      const imageProvider = {
        ...provider,
        model: 'gemini-3.1-flash-image-preview',
      };

      const config = formatGemini(imageProvider, [], [], { aspectRatio: '16:9', imageSize: '2K' });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.responseModalities).toContain('IMAGE');
      expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
      expect(body.generationConfig.imageConfig.imageSize).toBe('2K');
    });

    it('should set responseModalities for image models without aspect ratio', () => {
      const imageProvider = {
        ...provider,
        model: 'gemini-3-flash-image',
      };

      const config = formatGemini(imageProvider, [], [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.responseModalities).toContain('IMAGE');
      expect(body.generationConfig.imageConfig).toBeUndefined();
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

    it('should use thinkingLevel for Gemini 3 models', () => {
      const gemini3Provider = {
        ...provider,
        model: 'gemini-3-flash-preview',
      };

      const config = formatGemini(gemini3Provider, [], [], { enableReasoning: true });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.thinkingConfig).toBeDefined();
      expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('high');
      expect(body.generationConfig.thinkingConfig.thinkingBudget).toBeUndefined();
    });

    it('should use thinkingLevel with custom level for Gemini 3 models', () => {
      const gemini3Provider = {
        ...provider,
        model: 'gemini-3-flash-preview',
      };

      const config = formatGemini(gemini3Provider, [], [], {
        enableReasoning: true,
        modelParameters: { thinkingLevel: 'low' },
      });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('low');
    });

    it('should use thinkingBudget for Gemini 2.5 models', () => {
      const gemini25Provider = {
        ...provider,
        model: 'gemini-2.5-flash',
      };

      const config = formatGemini(gemini25Provider, [], [], { enableReasoning: true });
      const body = JSON.parse(config.options.body as string);

      expect(body.generationConfig.thinkingConfig).toBeDefined();
      expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(24576);
      expect(body.generationConfig.thinkingConfig.thinkingLevel).toBeUndefined();
    });

    it('should handle custom URL with /models/ path', () => {
      const customProvider = {
        ...provider,
        apiUrl: 'https://custom.googleapis.com/v1beta/models/gemini-custom',
      };

      const config = formatGemini(customProvider, [], [], {});

      expect(config.url).toContain('https://custom.googleapis.com/v1beta/models/gemini-custom?');
    });

    it('should include reasoning content as thought parts for Gemini 3 models', () => {
      const gemini3Provider = {
        ...provider,
        model: 'gemini-3-flash-preview',
      };

      const messages: Message[] = [
        { role: 'user', content: 'Solve this puzzle' },
        {
          role: 'assistant',
          content: 'The answer is 42',
          reasoningContent: 'Let me work through this step by step...',
          reasoningSignature: 'sig_prev_turn',
        },
        { role: 'user', content: 'Why?' },
      ];

      const config = formatGemini(gemini3Provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      // Model turn should have thought part + text part
      const modelTurn = body.contents[1];
      expect(modelTurn.role).toBe('model');
      expect(modelTurn.parts).toHaveLength(2);
      expect(modelTurn.parts[0].thought).toBe(true);
      expect(modelTurn.parts[0].text).toBe('Let me work through this step by step...');
      expect(modelTurn.parts[0].thoughtSignature).toBe('sig_prev_turn');
      expect(modelTurn.parts[1].text).toBe('The answer is 42');
    });

    it('should not include reasoning content for non-Gemini-3 models', () => {
      const gemini25Provider = {
        ...provider,
        model: 'gemini-2.5-flash',
      };

      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: 'Hi!',
          reasoningContent: 'Thinking...',
          reasoningSignature: 'sig_123',
        },
        { role: 'user', content: 'How are you?' },
      ];

      const config = formatGemini(gemini25Provider, messages, [], {});
      const body = JSON.parse(config.options.body as string);

      // Model turn should only have text part (no thought part for Gemini 2.5)
      const modelTurn = body.contents[1];
      expect(modelTurn.role).toBe('model');
      expect(modelTurn.parts).toHaveLength(1);
      expect(modelTurn.parts[0].text).toBe('Hi!');
      expect(modelTurn.parts[0].thought).toBeUndefined();
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

    it('should parse thought signatures from thought parts', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Reasoning...","thought":true,"thoughtSignature":"sig_abc123"}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ type: 'reasoning', content: 'Reasoning...' });
      expect(results[1]).toEqual({ type: 'reasoning_signature', content: 'sig_abc123' });
    });

    it('should parse thought signatures from non-thought parts (Gemini 3+)', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Response text","thoughtSignature":"sig_xyz789"}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      // thoughtSignature is yielded before text content
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ type: 'reasoning_signature', content: 'sig_xyz789' });
      expect(results[1]).toEqual({ type: 'text', content: 'Response text' });
    });

    it('should not yield thought parts as regular text', async () => {
      const chunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Thinking...","thought":true},{"text":"Answer"}]}}]}\n\n',
      ];

      const response = createMockStreamResponse(chunks);
      const results = [];

      for await (const chunk of parseGeminiStream(response)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('reasoning');
      expect(results[0].content).toBe('Thinking...');
      expect(results[1].type).toBe('text');
      expect(results[1].content).toBe('Answer');
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

    // Token Usage Tests
    describe('token usage parsing', () => {
      it('should parse basic usage metadata', async () => {
        const chunks = createGeminiUsageChunks({
          content: 'Hello',
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseGeminiStream(response)) {
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

      it('should parse usage with thoughts token count for thinking models', async () => {
        const chunks = createGeminiUsageChunks({
          promptTokenCount: 3540,
          candidatesTokenCount: 30,
          totalTokenCount: 3746,
          thoughtsTokenCount: 176,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseGeminiStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(1);
        expect(results[0].type).toBe('usage');
        expect(results[0].usage).toEqual({
          promptTokenCount: 3540,
          candidatesTokenCount: 30,
          totalTokenCount: 3746,
          thoughtsTokenCount: 176,
        });
      });

      it('should parse usage with cached content token count', async () => {
        const chunks = createGeminiUsageChunks({
          promptTokenCount: 2000,
          candidatesTokenCount: 100,
          totalTokenCount: 2100,
          cachedContentTokenCount: 1500,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseGeminiStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(1);
        expect(results[0].type).toBe('usage');
        expect(results[0].usage).toEqual({
          promptTokenCount: 2000,
          candidatesTokenCount: 100,
          totalTokenCount: 2100,
          cachedContentTokenCount: 1500,
        });
      });

      it('should parse complete usage metadata with all fields', async () => {
        const chunks = createGeminiUsageChunks({
          content: 'Complete response',
          promptTokenCount: 5000,
          candidatesTokenCount: 200,
          totalTokenCount: 5376,
          thoughtsTokenCount: 176,
          cachedContentTokenCount: 3000,
        });

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseGeminiStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual({ type: 'text', content: 'Complete response' });
        expect(results[1].type).toBe('usage');
        expect(results[1].usage).toEqual({
          promptTokenCount: 5000,
          candidatesTokenCount: 200,
          totalTokenCount: 5376,
          thoughtsTokenCount: 176,
          cachedContentTokenCount: 3000,
        });
      });

      it('should handle cumulative usage across multiple chunks', async () => {
        // Gemini returns cumulative usage in each chunk
        const chunks = [
          'data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":10,"totalTokenCount":110}}\n\n',
          'data: {"candidates":[{"content":{"parts":[{"text":" world"}]}}],"usageMetadata":{"promptTokenCount":100,"candidatesTokenCount":20,"totalTokenCount":120}}\n\n',
        ];

        const response = createMockStreamResponse(chunks);
        const results = [];

        for await (const chunk of parseGeminiStream(response)) {
          results.push(chunk);
        }

        expect(results).toHaveLength(4);
        expect(results[0]).toEqual({ type: 'text', content: 'Hello' });
        expect(results[1].type).toBe('usage');
        expect(results[1].usage.candidatesTokenCount).toBe(10);
        expect(results[2]).toEqual({ type: 'text', content: ' world' });
        expect(results[3].type).toBe('usage');
        expect(results[3].usage.candidatesTokenCount).toBe(20);
      });
    });
  });
});
