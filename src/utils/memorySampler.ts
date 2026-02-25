/**
 * Memory Sampler Utility
 *
 * Provides weighted random sampling for memory selection per conversation.
 * Ensures consistent memory usage throughout a conversation lifecycle.
 */

import type { Memory, MemoryCategory } from '../types/index.ts';
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from '../types/index.ts';

/** Configuration for memory sampling */
export interface MemorySamplerConfig {
  /** Number of memories to sample (default: 15) */
  sampleSize: number;
  /** Weight for confidence score (0-1, default: 0.7) */
  confidenceWeight: number;
  /** Weight for recency score (0-1, default: 0.3) */
  recencyWeight: number;
  /** Recency decay half-life in days (default: 30) */
  recencyDecayDays: number;
}

export const DEFAULT_SAMPLER_CONFIG: MemorySamplerConfig = {
  sampleSize: 15,
  confidenceWeight: 0.7,
  recencyWeight: 0.3,
  recencyDecayDays: 30,
};


/**
 * Calculate recency score using exponential decay
 * @param updatedAt - Timestamp when memory was last updated
 * @param decayDays - Number of days for score to decay to ~0.37 (1/e)
 * @returns Recency score between 0 and 1
 */
function calculateRecencyScore(updatedAt: number, decayDays: number): number {
  const ageInDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
  return Math.exp(-ageInDays / decayDays);
}

/**
 * Calculate weight for a memory based on confidence and recency
 */
function calculateMemoryWeight(
  memory: Memory,
  config: MemorySamplerConfig
): number {
  const recencyScore = calculateRecencyScore(
    memory.updatedAt,
    config.recencyDecayDays
  );
  return (
    memory.confidence * config.confidenceWeight +
    recencyScore * config.recencyWeight
  );
}

/**
 * Efraimidis-Spirakis weighted random sampling
 * Each item gets key = random()^(1/weight). Items with higher weight
 * tend to produce larger keys, so selecting top-k by key gives
 * provably correct weighted sampling without replacement.
 *
 * Time complexity: O(n log n), Space complexity: O(n)
 * Reference: Efraimidis & Spirakis, "Weighted random sampling with a reservoir" (2006)
 *
 * @param memories - All available memories
 * @param sampleSize - Number of memories to select
 * @param config - Sampling configuration
 * @returns Array of selected memory IDs
 */
function weightedReservoirSample(
  memories: Memory[],
  sampleSize: number,
  config: MemorySamplerConfig
): string[] {
  if (memories.length <= sampleSize) {
    return memories.map((m) => m.id);
  }

  // Assign key = random^(1/weight) for each item.
  // Clamp weight to avoid division-by-zero or degenerate keys.
  const keyed = memories.map((m) => ({
    id: m.id,
    key: Math.random() ** (1 / Math.max(calculateMemoryWeight(m, config), 1e-9)),
  }));

  // Select top-k by key descending
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, sampleSize).map((k) => k.id);
}

/**
 * Category-balanced weighted sampling
 * Ensures at least one memory from each non-empty category, then fills remaining slots
 */
function categoryBalancedSample(
  memories: Memory[],
  sampleSize: number,
  config: MemorySamplerConfig
): string[] {
  if (memories.length <= sampleSize) {
    return memories.map((m) => m.id);
  }

  // Group by category
  const byCategory = new Map<MemoryCategory, Memory[]>();
  for (const m of memories) {
    if (!byCategory.has(m.category)) {
      byCategory.set(m.category, []);
    }
    byCategory.get(m.category)!.push(m);
  }

  const selectedIds = new Set<string>();
  const selectedMemories: Memory[] = [];

  // Phase 1: Pick one from each category to ensure diversity
  for (const [, items] of byCategory) {
    if (items.length > 0 && selectedMemories.length < sampleSize) {
      // Weighted random from this category
      const weights = items.map((m) => calculateMemoryWeight(m, config));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;
      let index = 0;
      while (random > 0 && index < items.length) {
        random -= weights[index];
        index++;
      }
      const selected = items[Math.max(0, index - 1)];
      if (!selectedIds.has(selected.id)) {
        selectedMemories.push(selected);
        selectedIds.add(selected.id);
      }
    }
  }

  // Phase 2: Fill remaining slots with weighted random from remaining memories
  const remaining = memories.filter((m) => !selectedIds.has(m.id));
  const slotsLeft = sampleSize - selectedMemories.length;

  if (slotsLeft > 0 && remaining.length > 0) {
    const remainingIds = weightedReservoirSample(
      remaining,
      Math.min(slotsLeft, remaining.length),
      config
    );
    for (const id of remainingIds) {
      selectedIds.add(id);
    }
  }

  return Array.from(selectedIds);
}

/**
 * Select memories for a new conversation
 * Uses category-balanced weighted sampling for diversity and relevance
 *
 * @param memories - All available memories
 * @param sampleSize - Number of memories to select (default: 15)
 * @returns Array of selected memory IDs
 */
export function selectMemoriesForConversation(
  memories: Memory[],
  sampleSize: number = DEFAULT_SAMPLER_CONFIG.sampleSize
): string[] {
  if (!memories || memories.length === 0) {
    return [];
  }

  // If we have fewer memories than sample size, return all
  if (memories.length <= sampleSize) {
    return memories.map((m) => m.id);
  }

  return categoryBalancedSample(memories, sampleSize, DEFAULT_SAMPLER_CONFIG);
}

/**
 * Build memory block text for system prompt from selected memory IDs
 *
 * @param allMemories - All available memories
 * @param selectedIds - IDs of memories selected for this conversation
 * @returns Formatted memory block string
 */
export function buildMemoryBlockFromSelection(
  allMemories: Memory[],
  selectedIds: string[] | undefined
): string {
  if (!selectedIds || selectedIds.length === 0) {
    return '';
  }

  // Create lookup map for O(1) access
  const memoryMap = new Map(allMemories.map((m) => [m.id, m]));

  // Get selected memories in original order (by category)
  const selectedMemories: Memory[] = [];
  for (const id of selectedIds) {
    const memory = memoryMap.get(id);
    if (memory) {
      selectedMemories.push(memory);
    }
  }

  if (selectedMemories.length === 0) {
    return '';
  }

  let block =
    '\n\n[User Memory - Use these insights to personalize responses]\n';

  for (const cat of MEMORY_CATEGORIES) {
    const items = selectedMemories.filter((m) => m.category === cat);
    if (items.length === 0) continue;

    const label = MEMORY_CATEGORY_LABELS[cat].replace(/^[^\s]+\s/, '');
    block += `\n${label}:\n`;
    for (const item of items) {
      block += `- ${item.content}\n`;
    }
  }

  return block;
}

/**
 * Refresh memory selection for an existing conversation
 * Call this when user explicitly requests fresh memories or after significant memory updates
 *
 * @param memories - Current all memories
 * @param currentSelectedIds - Currently selected IDs (to exclude for true refresh)
 * @param sampleSize - Number of memories to select
 * @returns New array of selected memory IDs
 */
export function refreshMemorySelection(
  memories: Memory[],
  currentSelectedIds: string[],
  sampleSize: number = DEFAULT_SAMPLER_CONFIG.sampleSize
): string[] {
  // Exclude currently selected to ensure variety
  const available = memories.filter((m) => !currentSelectedIds.includes(m.id));

  if (available.length === 0) {
    // If all memories are currently selected, just re-sample from all
    return selectMemoriesForConversation(memories, sampleSize);
  }

  // Fill with new selections first
  const newSelections = selectMemoriesForConversation(
    available,
    sampleSize
  );

  // If we didn't get enough new ones, supplement with random from current
  if (newSelections.length < sampleSize) {
    const needed = sampleSize - newSelections.length;
    const shuffledCurrent = [...currentSelectedIds].sort(
      () => Math.random() - 0.5
    );
    newSelections.push(...shuffledCurrent.slice(0, needed));
  }

  return newSelections;
}
