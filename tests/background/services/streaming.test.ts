import { test, expect, describe } from 'bun:test';
import { createStreamingService } from '../../../src/background/services/streaming.service.js';

describe('Streaming Service', () => {
  const streamingService = createStreamingService();

  describe('mergeToolCalls', () => {
    test('should merge tool calls by index', () => {
      const toolCalls = [
        { index: 0, id: 'tc1', name: 'tool1', arguments: '{"a":' },
        { index: 0, arguments: '1}' },
        { index: 1, id: 'tc2', name: 'tool2', arguments: '{"b":2}' },
      ];

      const result = streamingService.mergeToolCalls(toolCalls);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('tc1');
      expect(result[0].name).toBe('tool1');
      expect(result[0].arguments).toBe('{"a":1}');
      expect(result[1].id).toBe('tc2');
      expect(result[1].arguments).toBe('{"b":2}');
    });

    test('should handle tool calls without index', () => {
      const toolCalls = [
        { id: 'tc1', name: 'tool1', arguments: '{"a":1}' },
        { id: 'tc2', name: 'tool2', arguments: '{"b":2}' },
      ];

      const result = streamingService.mergeToolCalls(toolCalls);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('tc1');
      expect(result[1].id).toBe('tc2');
    });

    test('should handle mixed tool calls', () => {
      const toolCalls = [
        { index: 0, id: 'tc1', name: 'tool1', arguments: '{}' },
        { id: 'tc2', name: 'tool2', arguments: '{}' },
      ];

      const result = streamingService.mergeToolCalls(toolCalls);

      expect(result).toHaveLength(2);
    });

    test('should return empty array for empty input', () => {
      const result = streamingService.mergeToolCalls([]);
      expect(result).toHaveLength(0);
    });

    test('should preserve thoughtSignature when merging without changing other fields', () => {
      const toolCalls = [
        { index: 0, id: 'tc1', name: 'tool1', arguments: '{"a":', thoughtSignature: 'sig' },
        { index: 0, arguments: '1}' },
      ];

      const result = streamingService.mergeToolCalls(toolCalls);

      expect(result).toHaveLength(1);
      expect(result[0].arguments).toBe('{"a":1}');
      expect(result[0].thoughtSignature).toBe('sig');
    });
  });

  describe('buildNonStreamingResponse', () => {
    test('should build OpenAI format response', () => {
      const data = {
        choices: [{
          message: {
            content: 'Hello world',
            reasoning_content: 'Thinking...',
          },
        }],
      };
      const provider = { format: 'openai' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Hello world');
      expect(result.reasoning_content).toBe('Thinking...');
    });

    test('should extract reasoning from message.reasoning (OpenRouter-style gateways)', () => {
      const data = {
        choices: [{
          message: {
            content: 'Halo!',
            reasoning: 'The user greeted me. Respond in Indonesian.',
          },
        }],
      };
      const provider = { format: 'openai' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Halo!');
      expect(result.reasoning_content).toBe('The user greeted me. Respond in Indonesian.');
    });

    test('should extract reasoning from reasoning_details array when reasoning is absent', () => {
      const data = {
        choices: [{
          message: {
            content: 'Halo!',
            reasoning_details: [
              { type: 'reasoning.text', index: 0, text: 'First thought.' },
              { type: 'reasoning.text', index: 1, text: 'Second thought.' },
            ],
          },
        }],
      };
      const provider = { format: 'openai' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.reasoning_content).toBe('First thought.Second thought.');
    });

    test('should build Anthropic format response', () => {
      const data = {
        content: [
          { text: 'Hello ' },
          { text: 'world' },
        ],
      };
      const provider = { format: 'anthropic' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Hello world');
      expect(result.reasoning_content).toBe('');
    });

    test('should extract Anthropic thinking blocks as reasoning with signature', () => {
      const data = {
        content: [
          { type: 'thinking', thinking: 'Let me reason about this.', signature: 'sig-abc' },
          { type: 'text', text: 'Final answer.' },
        ],
      };
      const provider = { format: 'anthropic' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Final answer.');
      expect(result.reasoning_content).toBe('Let me reason about this.');
      expect(result.reasoning_signature).toBe('sig-abc');
    });

    test('should fall back to top-level reasoning_content for k2.5/Kimi-style providers', () => {
      const data = {
        content: [{ type: 'text', text: 'Final.' }],
        reasoning_content: 'Top-level reasoning',
      };
      const provider = { format: 'anthropic' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.reasoning_content).toBe('Top-level reasoning');
    });

    test('should capture the signature from redacted_thinking blocks (budget exceeded)', () => {
      const data = {
        content: [
          { type: 'redacted_thinking', data: 'something', signature: 'sig-redacted' },
          { type: 'text', text: 'Final answer.' },
        ],
      };
      const provider = { format: 'anthropic' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      // redacted_thinking has no usable reasoning text, but its signature must
      // survive for history replay — matching the stream path's signature_delta.
      expect(result.reasoning_content).toBe('');
      expect(result.reasoning_signature).toBe('sig-redacted');
    });

    test('should build Gemini format response', () => {
      const data = {
        candidates: [{
          content: {
            parts: [
              { text: 'Hello ' },
              { text: 'world' },
            ],
          },
        }],
      };
      const provider = { format: 'gemini' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Hello world');
      expect(result.reasoning_content).toBe('');
    });

    test('should keep Gemini thought parts out of content and surface them as reasoning', () => {
      const data = {
        candidates: [{
          content: {
            parts: [
              { text: '**Defining My Identity** reasoning', thought: true },
              { text: 'Saya adalah model bahasa besar.' },
            ],
          },
        }],
      };
      const provider = { format: 'gemini' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Saya adalah model bahasa besar.');
      expect(result.reasoning_content).toBe('**Defining My Identity** reasoning');
    });

    test('should capture Gemini thought signature for multi-turn replay', () => {
      const data = {
        candidates: [{
          content: {
            parts: [
              { text: 'reasoning', thought: true, thoughtSignature: 'sig-xyz' },
              { text: 'Answer.' },
            ],
          },
        }],
      };
      const provider = { format: 'gemini' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('Answer.');
      expect(result.reasoning_content).toBe('reasoning');
      expect(result.reasoning_signature).toBe('sig-xyz');
    });

    test('should attach Gemini thoughtSignature to functionCall tool fragments', () => {
      const data = {
        candidates: [{
          content: {
            parts: [
              { functionCall: { name: 'tavily_search', args: { query: 'x' } }, thoughtSignature: 'fc_sig' },
            ],
          },
        }],
      };
      const provider = { format: 'gemini' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.reasoning_signature).toBeUndefined();
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0].name).toBe('tavily_search');
      expect(result.tool_calls?.[0].thoughtSignature).toBe('fc_sig');
    });

    test('should handle missing data gracefully', () => {
      const data = {};
      const provider = { format: 'openai' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('');
      expect(result.reasoning_content).toBe('');
    });
  });
});
