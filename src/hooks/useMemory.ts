import { useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { Memory, MemoryCategory, Message } from '../types/index.ts';
import { MEMORY_CATEGORIES } from '../types/index.ts';

export function useMemory() {
  const store = useStore();

  const extractMemories = useCallback(async (explicitMessages?: Message[]) => {
    if (!store.memoryEnabled) return;

    // Use explicit messages if provided, otherwise read from store
    const messagesToAnalyze = explicitMessages || store.messages;

    if (messagesToAnalyze.length < 2) return;
    if (store.memories.length >= 100) return; // Stop if already at limit

    // Get last 8 messages for context
    const recentMessages = messagesToAnalyze.slice(-8);
    const existingMemories = store.memories.map((m) => `[${m.category}] ${m.content}`).join('\n');
    const remainingSlots = 100 - store.memories.length;

    const extractionPrompt = `You are a memory extraction AI. Analyze the conversation and extract NEW insights about the user.

RETURN ONLY A VALID JSON ARRAY. No markdown, no explanation, just the array.

Each insight must have:
- "category": one of: ${MEMORY_CATEGORIES.map(c => `"${c}"`).join(', ')}
- "content": concise insight (max 100 chars)
- "confidence": 0.0-1.0 (only include if >= 0.6)

Categories explained:
- personal: Name, age, location, occupation, family, identity
- goals: What they want to achieve, aspirations, projects
- interests: Hobbies, topics they care about, passions
- expertise: Technical skills, domain knowledge, experience level
- preferences: How they like responses (format, length, detail, tone)
- style: Communication style (formal/casual, verbose/concise)
- habits: Recurring patterns, workflows, routines
- context: Current situation, ongoing projects, background info
- dislikes: Things to avoid, pet peeves, negative preferences

EXISTING MEMORIES (${store.memories.length}/100 - avoid duplicates):
${existingMemories || '(none)'}

RULES:
1. Extract as many NEW insights as you can find (up to ${Math.min(remainingSlots, 10)} insights)
2. Be specific and actionable
3. Confidence >= 0.6 required
4. Return [] if nothing new found
5. Don't worry about category limits - add memories freely to any category

Return ONLY the JSON array:`;


    const messages = [
      { role: 'system' as const, content: extractionPrompt },
      ...recentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.displayContent || m.content,
        })),
    ];

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'MEMORY_EXTRACT',
        messages,
        providerConfig: store.providerConfig,
      });

      if (response?.memories && Array.isArray(response.memories)) {
        mergeMemories(response.memories);
      }
    } catch (e) {
      console.warn('Memory extraction failed:', e);
    }
  }, [store]);

  const mergeMemories = useCallback((newInsights: Partial<Memory>[]) => {
    let changed = false;

    for (const insight of newInsights) {
      if (!insight.category || !MEMORY_CATEGORIES.includes(insight.category as MemoryCategory)) continue;
      if (!insight.content || typeof insight.content !== 'string') continue;

      const confidence = Math.min(1, Math.max(0, Number(insight.confidence) || 0.6));
      if (confidence < 0.6) continue;

      // Check for similar existing memory
      const existing = store.memories.find((m) =>
        m.category === insight.category && insight.content && isSimilarMemory(m.content, insight.content)
      );

      if (existing) {
        // Update if higher confidence or newer info
        if (confidence > existing.confidence) {
          store.updateMemory(existing.id, {
            content: insight.content,
            confidence,
            updatedAt: Date.now(),
          });
          changed = true;
        }
      } else {
        store.addMemory({
          id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          category: insight.category as MemoryCategory,
          content: insight.content,
          confidence,
          source: store.activeConversationId ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        changed = true;
      }
    }

    if (changed) {
      // Cap at 100 memories, keep highest confidence + most recent
      if (store.memories.length > 100) {
        const sorted = [...store.memories].sort(
          (a, b) =>
            b.confidence * 0.7 +
            (b.updatedAt / Date.now()) * 0.3 -
            (a.confidence * 0.7 + (a.updatedAt / Date.now()) * 0.3)
        );
        const toKeep = new Set(sorted.slice(0, 100).map((m) => m.id));
        store.memories
          .filter((m) => !toKeep.has(m.id))
          .forEach((m) => store.removeMemory(m.id));
      }
      store.saveToStorage();
    }
  }, [store]);

  const addManualMemory = useCallback(
    (category: MemoryCategory, content: string) => {
      if (!content.trim()) return;
      
      store.addMemory({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        category,
        content: content.trim(),
        confidence: 1.0,
        source: 'manual',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      store.saveToStorage();
    },
    [store]
  );

  const deleteMemory = useCallback(
    (id: string) => {
      store.removeMemory(id);
      store.saveToStorage();
    },
    [store]
  );

  const updateMemory = useCallback(
    (id: string, updates: Partial<Memory>) => {
      store.updateMemory(id, {
        ...updates,
        updatedAt: Date.now(),
      });
      store.saveToStorage();
    },
    [store]
  );

  const clearAllMemories = useCallback(() => {
    store.clearMemories();
    store.saveToStorage();
  }, [store]);

  const setMemoryEnabled = useCallback(
    (enabled: boolean) => {
      store.setMemoryEnabled(enabled);
      store.saveToStorage();
    },
    [store]
  );

  return {
    memories: store.memories,
    memoryEnabled: store.memoryEnabled,
    extractMemories,
    addManualMemory,
    deleteMemory,
    updateMemory,
    clearAllMemories,
    setMemoryEnabled,
  };
}

function isSimilarMemory(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;

  // Simple word overlap check
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter((w) => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size > 0.65;
}
