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

    test('should handle missing data gracefully', () => {
      const data = {};
      const provider = { format: 'openai' };

      const result = streamingService.buildNonStreamingResponse(data, provider);

      expect(result.content).toBe('');
      expect(result.reasoning_content).toBe('');
    });
  });
});
