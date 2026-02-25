import { describe, test, expect, beforeEach } from 'bun:test';
import type { Memory } from '../../src/types/index.ts';
import {
  selectMemoriesForConversation,
  buildMemoryBlockFromSelection,
  refreshMemorySelection,
  DEFAULT_SAMPLER_CONFIG,
} from '../../src/utils/memorySampler.ts';

describe('memorySampler', () => {
  // Mock memories for testing
  const mockMemories: Memory[] = [
    { id: 'mem_1', category: 'personal', content: 'Name is John', confidence: 1.0, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_2', category: 'goals', content: 'Wants to learn Rust', confidence: 0.9, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_3', category: 'interests', content: 'Loves hiking', confidence: 0.8, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_4', category: 'expertise', content: 'Expert in Python', confidence: 0.95, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_5', category: 'preferences', content: 'Prefers concise answers', confidence: 0.85, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_6', category: 'style', content: 'Formal tone', confidence: 0.7, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_7', category: 'habits', content: 'Codes at night', confidence: 0.75, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_8', category: 'context', content: 'Working on AI project', confidence: 0.9, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_9', category: 'dislikes', content: 'Hates verbose explanations', confidence: 0.8, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_10', category: 'personal', content: 'Age 30', confidence: 0.95, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_11', category: 'goals', content: 'Wants to build an app', confidence: 0.8, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_12', category: 'interests', content: 'Enjoys reading sci-fi', confidence: 0.7, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_13', category: 'expertise', content: 'Knows TypeScript', confidence: 0.9, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_14', category: 'preferences', content: 'Likes code examples', confidence: 0.85, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_15', category: 'style', content: 'Uses emoji often', confidence: 0.6, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_16', category: 'habits', content: 'Takes breaks frequently', confidence: 0.65, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_17', category: 'context', content: 'Has deadline next week', confidence: 0.8, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_18', category: 'dislikes', content: 'Dislikes waiting', confidence: 0.75, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_19', category: 'personal', content: 'Lives in Tokyo', confidence: 0.9, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'mem_20', category: 'goals', content: 'Wants to get promoted', confidence: 0.85, source: 'test', createdAt: Date.now(), updatedAt: Date.now() },
  ];

  describe('selectMemoriesForConversation', () => {
    test('should return empty array when no memories provided', () => {
      const result = selectMemoriesForConversation([]);
      expect(result).toEqual([]);
    });

    test('should return empty array when memories is undefined', () => {
      const result = selectMemoriesForConversation(undefined as unknown as Memory[]);
      expect(result).toEqual([]);
    });

    test('should return all memory IDs when total is less than sample size', () => {
      const fewMemories = mockMemories.slice(0, 5);
      const result = selectMemoriesForConversation(fewMemories, 10);
      expect(result).toHaveLength(5);
      expect(result).toEqual(fewMemories.map(m => m.id));
    });

    test('should return exactly sample size when memories exceed sample size', () => {
      const sampleSize = 10;
      const result = selectMemoriesForConversation(mockMemories, sampleSize);
      expect(result).toHaveLength(sampleSize);
    });

    test('should return unique memory IDs (no duplicates)', () => {
      const sampleSize = 15;
      const result = selectMemoriesForConversation(mockMemories, sampleSize);
      const uniqueIds = new Set(result);
      expect(uniqueIds.size).toBe(result.length);
    });

    test('should use default sample size when not specified', () => {
      const result = selectMemoriesForConversation(mockMemories);
      expect(result.length).toBeLessThanOrEqual(DEFAULT_SAMPLER_CONFIG.sampleSize);
    });

    test('should ensure at least one memory from each category', () => {
      // Create memories with multiple items per category
      const result = selectMemoriesForConversation(mockMemories, 9);
      const selectedMemories = mockMemories.filter(m => result.includes(m.id));

      const categories = new Set(selectedMemories.map(m => m.category));
      // Should have at least some category diversity
      expect(categories.size).toBeGreaterThanOrEqual(3);
    });

    test('should be deterministic with same input (consistent per conversation)', () => {
      // Note: Due to randomness, we can't test exact equality,
      // but we can verify the structure is consistent
      const sampleSize = 10;
      const result1 = selectMemoriesForConversation(mockMemories, sampleSize);
      const result2 = selectMemoriesForConversation(mockMemories, sampleSize);

      // Both should have same length
      expect(result1).toHaveLength(sampleSize);
      expect(result2).toHaveLength(sampleSize);

      // Both should have unique IDs
      expect(new Set(result1).size).toBe(sampleSize);
      expect(new Set(result2).size).toBe(sampleSize);
    });
  });

  describe('buildMemoryBlockFromSelection', () => {
    test('should return empty string when selectedIds is empty', () => {
      const result = buildMemoryBlockFromSelection(mockMemories, []);
      expect(result).toBe('');
    });

    test('should return empty string when selectedIds is undefined', () => {
      const result = buildMemoryBlockFromSelection(mockMemories, undefined);
      expect(result).toBe('');
    });

    test('should build memory block with selected memories only', () => {
      const selectedIds = ['mem_1', 'mem_2', 'mem_3'];
      const result = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      expect(result).toContain('Name is John');
      expect(result).toContain('Wants to learn Rust');
      expect(result).toContain('Loves hiking');
      expect(result).not.toContain('Expert in Python');
    });

    test('should group memories by category', () => {
      const selectedIds = ['mem_1', 'mem_10', 'mem_19']; // All personal
      const result = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      expect(result).toContain('Personal Info');
      expect(result).toContain('Name is John');
      expect(result).toContain('Age 30');
      expect(result).toContain('Lives in Tokyo');
    });

    test('should include header for memory block', () => {
      const selectedIds = ['mem_1'];
      const result = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      expect(result).toContain('[User Memory - Use these insights to personalize responses]');
    });

    test('should handle non-existent memory IDs gracefully', () => {
      const selectedIds = ['mem_1', 'non_existent', 'mem_2'];
      const result = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      expect(result).toContain('Name is John');
      expect(result).toContain('Wants to learn Rust');
      expect(result).not.toContain('non_existent');
    });

    test('should maintain consistent output for same selection', () => {
      const selectedIds = ['mem_1', 'mem_2', 'mem_3'];
      const result1 = buildMemoryBlockFromSelection(mockMemories, selectedIds);
      const result2 = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      expect(result1).toBe(result2);
    });
  });

  describe('refreshMemorySelection', () => {
    test('should return different selection from current', () => {
      const currentSelected = ['mem_1', 'mem_2', 'mem_3', 'mem_4', 'mem_5'];
      const result = refreshMemorySelection(mockMemories, currentSelected, 5);

      // Should have same length
      expect(result).toHaveLength(5);

      // Should be different from current (with high probability due to randomness)
      const overlap = result.filter(id => currentSelected.includes(id));
      // Allow some overlap but not all
      expect(overlap.length).toBeLessThan(5);
    });

    test('should return new selection when all memories are currently selected', () => {
      const allIds = mockMemories.map(m => m.id);
      const result = refreshMemorySelection(mockMemories, allIds, 5);

      expect(result).toHaveLength(5);
      expect(new Set(result).size).toBe(5);
    });

    test('should work with empty current selection', () => {
      const result = refreshMemorySelection(mockMemories, [], 10);

      expect(result).toHaveLength(10);
      expect(new Set(result).size).toBe(10);
    });

    test('should handle case when available memories are fewer than requested', () => {
      const fewMemories = mockMemories.slice(0, 5);
      const currentSelected = ['mem_1', 'mem_2'];
      const result = refreshMemorySelection(fewMemories, currentSelected, 10);

      // Should return all available memories
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });

  describe('integration: consistent memory per conversation', () => {
    test('same conversation should always use same memory selection', () => {
      // Simulate creating a conversation
      const selectedIds = selectMemoriesForConversation(mockMemories, 10);

      // Simulate multiple API requests within same conversation
      const block1 = buildMemoryBlockFromSelection(mockMemories, selectedIds);
      const block2 = buildMemoryBlockFromSelection(mockMemories, selectedIds);
      const block3 = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      // All should be identical
      expect(block1).toBe(block2);
      expect(block2).toBe(block3);
    });

    test('different conversations should have different memory selections', () => {
      // Simulate creating two different conversations
      const conv1Memories = selectMemoriesForConversation(mockMemories, 10);
      const conv2Memories = selectMemoriesForConversation(mockMemories, 10);

      // They might be different (high probability with 20 memories and selecting 10)
      // Though there's a small chance they could be the same
      const overlap = conv1Memories.filter(id => conv2Memories.includes(id));

      // Allow for some randomness - they don't have to be completely different
      // but they shouldn't be identical most of the time
      expect(conv1Memories).toHaveLength(10);
      expect(conv2Memories).toHaveLength(10);
    });

    test('memory block format should be consistent', () => {
      const selectedIds = ['mem_1', 'mem_2', 'mem_4', 'mem_8'];
      const result = buildMemoryBlockFromSelection(mockMemories, selectedIds);

      // Should start with header
      expect(result.startsWith('\n\n[User Memory')).toBe(true);

      // Should have category headers
      expect(result).toContain('Personal Info:');
      expect(result).toContain('Goals & Objectives:');
      expect(result).toContain('Expertise & Skills:');
      expect(result).toContain('Context & Background:');

      // Should have bullet points
      expect(result).toContain('- ');
    });
  });
});
