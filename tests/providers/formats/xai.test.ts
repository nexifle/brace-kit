/**
 * Tests for xAI Format Module
 */

import { describe, expect, it } from 'bun:test';
import { formatXAIImageRequest, parseXAIImageResponse } from '../../../src/providers/formats/xai.ts';
import type { Message } from '../../../src/types/index.ts';

describe('xAI Format', () => {
  describe('formatXAIImageRequest', () => {
    const provider = {
      apiUrl: 'https://api.x.ai/v1',
      apiKey: 'test-api-key',
      model: 'grok-imagine-image',
    };

    it('should format image generation request', () => {
      const messages: Message[] = [{ role: 'user', content: 'A sunset over mountains' }];

      const config = formatXAIImageRequest(provider, messages, {});
      const body = JSON.parse(config.options.body as string);

      expect(config.url).toBe('https://api.x.ai/v1/images/generations');
      expect(body.model).toBe('grok-imagine-image');
      expect(body.prompt).toBe('A sunset over mountains');
      expect(body.n).toBe(1);
      expect(body.response_format).toBe('b64_json');
    });

    it('should include Authorization header', () => {
      const config = formatXAIImageRequest(provider, [], {});

      expect(config.options.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-api-key',
      });
    });

    it('should use default model if not specified', () => {
      const providerNoModel = {
        apiUrl: 'https://api.x.ai/v1',
        apiKey: 'test-key',
      };

      const config = formatXAIImageRequest(providerNoModel, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.model).toBe('grok-imagine-image');
    });

    it('should extract prompt from last user message', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'First prompt' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Last prompt' },
      ];

      const config = formatXAIImageRequest(provider, messages, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.prompt).toBe('Last prompt');
    });

    it('should extract prompt from multimodal content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'A beautiful' },
            { type: 'text', text: 'landscape' },
          ] as unknown as string,
        },
      ];

      const config = formatXAIImageRequest(provider, messages, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.prompt).toBe('A beautiful landscape');
    });

    it('should include image URL for image-to-image', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Make it more colorful' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
          ] as unknown as string,
        },
      ];

      const config = formatXAIImageRequest(provider, messages, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.image).toEqual({
        url: 'https://example.com/image.jpg',
        type: 'image_url',
      });
    });

    it('should include aspect ratio when specified', () => {
      const config = formatXAIImageRequest(provider, [], { aspectRatio: '16:9' });
      const body = JSON.parse(config.options.body as string);

      expect(body.aspect_ratio).toBe('16:9');
    });

    it('should handle empty messages', () => {
      const config = formatXAIImageRequest(provider, [], {});
      const body = JSON.parse(config.options.body as string);

      expect(body.prompt).toBe('');
    });

    it('should handle messages without user message', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'assistant', content: 'Hello' },
      ];

      const config = formatXAIImageRequest(provider, messages, {});
      const body = JSON.parse(config.options.body as string);

      expect(body.prompt).toBe('');
    });
  });

  describe('parseXAIImageResponse', () => {
    it('should parse image response', async () => {
      const mockResponse = {
        json: async () => ({
          data: [{ b64_json: 'base64imagedata' }],
        }),
      } as Response;

      const results = [];

      for await (const chunk of parseXAIImageResponse(mockResponse)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        type: 'image',
        mimeType: 'image/jpeg',
        imageData: 'base64imagedata',
      });
    });

    it('should handle multiple images', async () => {
      const mockResponse = {
        json: async () => ({
          data: [{ b64_json: 'image1' }, { b64_json: 'image2' }],
        }),
      } as Response;

      const results = [];

      for await (const chunk of parseXAIImageResponse(mockResponse)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(2);
    });

    it('should handle empty data array', async () => {
      const mockResponse = {
        json: async () => ({ data: [] }),
      } as Response;

      const results = [];

      for await (const chunk of parseXAIImageResponse(mockResponse)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });

    it('should handle missing data field', async () => {
      const mockResponse = {
        json: async () => ({}),
      } as Response;

      const results = [];

      for await (const chunk of parseXAIImageResponse(mockResponse)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(0);
    });

    it('should skip items without b64_json', async () => {
      const mockResponse = {
        json: async () => ({
          data: [{ url: 'https://example.com/image.jpg' }, { b64_json: 'validimage' }],
        }),
      } as Response;

      const results = [];

      for await (const chunk of parseXAIImageResponse(mockResponse)) {
        results.push(chunk);
      }

      expect(results).toHaveLength(1);
      expect(results[0].imageData).toBe('validimage');
    });
  });
});
