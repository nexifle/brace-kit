/**
 * Tests for useStreamProcessor Hook
 */

import { describe, expect, it, beforeEach } from 'bun:test';
import { addInlineCitations, type StreamChunk } from '../../../src/hooks/streaming/useStreamProcessor.ts';
import type { GroundingMetadata } from '../../../src/types/index.ts';

describe('useStreamProcessor', () => {
  describe('addInlineCitations', () => {
    it('should return text unchanged if no grounding metadata', () => {
      const text = 'Hello world';
      expect(addInlineCitations(text)).toBe(text);
      expect(addInlineCitations(text, null as unknown as undefined)).toBe(text);
      expect(addInlineCitations(text, {} as GroundingMetadata)).toBe(text);
    });

    it('should return text unchanged if no grounding supports', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingChunks: [{ web: { uri: 'https://example.com', title: 'Example' } }],
      };
      expect(addInlineCitations(text, metadata)).toBe(text);
    });

    it('should return text unchanged if no grounding chunks', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingSupports: [{ segment: { endIndex: 5 }, groundingChunkIndices: [0] }],
      };
      expect(addInlineCitations(text, metadata)).toBe(text);
    });

    it('should add citations at correct positions', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
          { web: { uri: 'https://example.com/2', title: 'Source 2' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 5 },
            groundingChunkIndices: [0],
          },
        ],
      };
      expect(addInlineCitations(text, metadata)).toBe('Hello[1] world');
    });

    it('should handle multiple citations', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
          { web: { uri: 'https://example.com/2', title: 'Source 2' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 5 },
            groundingChunkIndices: [0, 1],
          },
        ],
      };
      expect(addInlineCitations(text, metadata)).toBe('Hello[1][2] world');
    });

    it('should handle multiple grounding supports (sorted descending)', () => {
      const text = 'Hello beautiful world';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
          { web: { uri: 'https://example.com/2', title: 'Source 2' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 5 },
            groundingChunkIndices: [0],
          },
          {
            segment: { startIndex: 6, endIndex: 15 },
            groundingChunkIndices: [1],
          },
        ],
      };
      // Should process endIndex 15 first, then 5
      expect(addInlineCitations(text, metadata)).toBe('Hello[1] beautiful[2] world');
    });

    it('should skip invalid grounding chunk indices', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 5 },
            groundingChunkIndices: [0, 5, 10], // Only index 0 is valid
          },
        ],
      };
      expect(addInlineCitations(text, metadata)).toBe('Hello[1] world');
    });

    it('should handle empty grounding chunk indices', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 5 },
            groundingChunkIndices: [],
          },
        ],
      };
      expect(addInlineCitations(text, metadata)).toBe(text);
    });

    it('should handle missing segment endIndex', () => {
      const text = 'Hello world';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0 },
            groundingChunkIndices: [0],
          },
        ],
      };
      expect(addInlineCitations(text, metadata)).toBe(text);
    });

    it('should handle citation at the end of text', () => {
      const text = 'Hello';
      const metadata: GroundingMetadata = {
        groundingChunks: [
          { web: { uri: 'https://example.com/1', title: 'Source 1' } },
        ],
        groundingSupports: [
          {
            segment: { startIndex: 0, endIndex: 5 },
            groundingChunkIndices: [0],
          },
        ],
      };
      expect(addInlineCitations(text, metadata)).toBe('Hello[1]');
    });
  });
});
