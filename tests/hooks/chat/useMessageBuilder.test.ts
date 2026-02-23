/**
 * Tests for useMessageBuilder Hook
 *
 * Note: These tests focus on the pure logic that can be tested independently.
 * Full hook tests would require React Testing Library with store mocking.
 */

import { describe, expect, it } from 'bun:test';
import type { Message, APIMessage } from '../../../src/types/index.ts';
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from '../../../src/types/index.ts';

/**
 * Pure function tests for message formatting logic
 * These mirror the logic in useMessageBuilder for testing purposes
 */
describe('useMessageBuilder Logic', () => {
  describe('Message Formatting', () => {
    /**
     * Helper function that mirrors formatMessageForAPI logic
     */
    function formatMessageForAPI(msg: Message): APIMessage | null {
      if (msg.role === 'error') return null;

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: 'assistant',
          content: msg.content || '',
          toolCalls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments || '{}',
          })),
        };
      }

      if (msg.role === 'tool') {
        return {
          role: 'tool',
          toolCallId: msg.toolCallId,
          name: msg.name,
          content: msg.content,
        };
      }

      if (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) {
        const content: { type: string; text?: string; image_url?: { url: string } }[] = [];
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const att of msg.attachments) {
          if (att.type === 'image') {
            content.push({
              type: 'image_url',
              image_url: { url: att.data },
            });
          }
        }
        return { role: msg.role, content };
      }

      return { role: msg.role, content: msg.content };
    }

    it('should return null for error messages', () => {
      const msg: Message = { role: 'error', content: 'Something went wrong' };
      expect(formatMessageForAPI(msg)).toBeNull();
    });

    it('should format simple user message', () => {
      const msg: Message = { role: 'user', content: 'Hello' };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({ role: 'user', content: 'Hello' });
    });

    it('should format simple assistant message', () => {
      const msg: Message = { role: 'assistant', content: 'Hi there!' };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({ role: 'assistant', content: 'Hi there!' });
    });

    it('should format simple system message', () => {
      const msg: Message = { role: 'system', content: 'System prompt' };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({ role: 'system', content: 'System prompt' });
    });

    it('should format assistant message with tool calls', () => {
      const msg: Message = {
        role: 'assistant',
        content: 'Let me help you with that.',
        toolCalls: [
          { id: 'call_1', name: 'get_weather', arguments: '{"location": "Jakarta"}' },
        ],
      };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({
        role: 'assistant',
        content: 'Let me help you with that.',
        toolCalls: [
          { id: 'call_1', name: 'get_weather', arguments: '{"location": "Jakarta"}' },
        ],
      });
    });

    it('should format assistant message with empty tool calls array', () => {
      const msg: Message = {
        role: 'assistant',
        content: 'Response',
        toolCalls: [],
      };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({ role: 'assistant', content: 'Response' });
    });

    it('should format tool result message', () => {
      const msg: Message = {
        role: 'tool',
        toolCallId: 'call_1',
        name: 'get_weather',
        content: '{"temp": 30, "condition": "sunny"}',
      };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({
        role: 'tool',
        toolCallId: 'call_1',
        name: 'get_weather',
        content: '{"temp": 30, "condition": "sunny"}',
      });
    });

    it('should format user message with image attachment', () => {
      const msg: Message = {
        role: 'user',
        content: 'What is in this image?',
        attachments: [
          { type: 'image', name: 'photo.jpg', data: 'data:image/jpeg;base64,abc123' },
        ],
      };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this image?' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } },
        ],
      });
    });

    it('should format user message with multiple attachments', () => {
      const msg: Message = {
        role: 'user',
        content: 'Compare these images',
        attachments: [
          { type: 'image', name: 'photo1.jpg', data: 'data:image/jpeg;base64,abc' },
          { type: 'image', name: 'photo2.jpg', data: 'data:image/jpeg;base64,def' },
        ],
      };
      const result = formatMessageForAPI(msg);
      expect(result?.content).toHaveLength(3);
      expect((result?.content as Array<unknown>)[0]).toEqual({ type: 'text', text: 'Compare these images' });
    });

    it('should format user message with only image attachment (no text)', () => {
      const msg: Message = {
        role: 'user',
        content: '',
        attachments: [
          { type: 'image', name: 'photo.jpg', data: 'data:image/jpeg;base64,abc123' },
        ],
      };
      const result = formatMessageForAPI(msg);
      expect(result).toEqual({
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc123' } },
        ],
      });
    });

    it('should ignore non-image attachments in content', () => {
      const msg: Message = {
        role: 'user',
        content: 'Here is a file',
        attachments: [
          { type: 'text', name: 'file.txt', data: 'content' },
        ],
      };
      const result = formatMessageForAPI(msg);
      // Text attachments are not added to content, only image attachments
      expect(result).toEqual({
        role: 'user',
        content: [{ type: 'text', text: 'Here is a file' }],
      });
    });
  });

  describe('Token Estimation', () => {
    /**
     * Helper function that mirrors estimateTokenCount logic
     */
    function estimateTokenCount(messages: Message[]): number {
      let totalChars = 0;
      for (const msg of messages) {
        if (msg.isCompacted && !msg.summary) continue;

        if (typeof msg.content === 'string') {
          totalChars += msg.content.length;
        }
        if (msg.attachments) {
          for (const att of msg.attachments) {
            totalChars += att.name.length + (att.data?.length || 0);
          }
        }
      }
      return Math.ceil(totalChars / 4);
    }

    it('should estimate tokens for simple messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' }, // 5 chars
        { role: 'assistant', content: 'Hi there!' }, // 9 chars
      ];
      // Total: 14 chars / 4 = 3.5 → 4 tokens
      expect(estimateTokenCount(messages)).toBe(4);
    });

    it('should skip compacted messages without summary', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello', isCompacted: true },
        { role: 'assistant', content: 'Hi there!' },
      ];
      // Only "Hi there!" = 9 chars / 4 = 2.25 → 3 tokens
      expect(estimateTokenCount(messages)).toBe(3);
    });

    it('should include compacted messages with summary', () => {
      const messages: Message[] = [
        { role: 'system', content: 'Summary text', isCompacted: true, summary: 'Summary text' },
      ];
      // "Summary text" = 12 chars / 4 = 3 tokens
      expect(estimateTokenCount(messages)).toBe(3);
    });

    it('should count attachments', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: 'Look',
          attachments: [
            { type: 'image', name: 'photo.jpg', data: 'imagedata' },
          ],
        },
      ];
      // "Look" (4) + "photo.jpg" (9) + "imagedata" (9) = 22 chars / 4 = 5.5 → 6 tokens
      expect(estimateTokenCount(messages)).toBe(6);
    });

    it('should return 0 for empty messages', () => {
      expect(estimateTokenCount([])).toBe(0);
    });
  });

  describe('Memory Block Building', () => {
    it('should have correct memory categories', () => {
      expect(MEMORY_CATEGORIES).toContain('personal');
      expect(MEMORY_CATEGORIES).toContain('goals');
      expect(MEMORY_CATEGORIES).toContain('interests');
      expect(MEMORY_CATEGORIES).toContain('expertise');
      expect(MEMORY_CATEGORIES).toContain('preferences');
      expect(MEMORY_CATEGORIES).toContain('style');
      expect(MEMORY_CATEGORIES).toContain('habits');
      expect(MEMORY_CATEGORIES).toContain('context');
      expect(MEMORY_CATEGORIES).toContain('dislikes');
    });

    it('should have labels for all categories', () => {
      for (const cat of MEMORY_CATEGORIES) {
        expect(MEMORY_CATEGORY_LABELS[cat]).toBeDefined();
        expect(typeof MEMORY_CATEGORY_LABELS[cat]).toBe('string');
      }
    });
  });
});
