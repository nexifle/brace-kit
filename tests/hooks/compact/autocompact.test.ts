import { describe, expect, it, beforeEach } from 'bun:test';
import type { Message } from '../../../src/types/index.ts';
import {
  extractSummaryFromResponse,
  createCondenseId,
  tagMessagesWithCondenseParent,
  createSummaryMessage,
  getMessagesToCompact,
  shouldCompact,
} from '../../../src/hooks/compact/compactUtils.ts';

/**
 * Autocompact Logic Tests
 *
 * These tests verify the non-destructive condensation logic,
 * specifically the "fresh start" model and condenseParent filtering.
 */
describe('Autocompact Logic', () => {
  /**
   * Helper that mirrors buildAPIMessages filtering logic
   */
  function buildEffectiveHistory(messages: Message[]): Message[] {
    // Find the last summary message for the "fresh start" model
    const lastSummaryIndex = [...messages].reverse().findIndex(m => m.summary && m.condenseId);
    const startIndex = lastSummaryIndex !== -1 ? messages.length - 1 - lastSummaryIndex : 0;

    const effectiveHistory: Message[] = [];
    for (let i = startIndex; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.condenseParent) continue;
      effectiveHistory.push(msg);
    }
    return effectiveHistory;
  }

  /**
   * Helper that mirrors estimateTokenCount logic
   */
  function estimateTokens(messages: Message[]): number {
    const effectiveHistory = buildEffectiveHistory(messages);
    let totalChars = 0;
    for (const msg of effectiveHistory) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      }
    }
    return Math.ceil(totalChars / 4);
  }

  describe('Non-Destructive Filtering', () => {
    it('should include all messages when no summary exists', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Msg 2' },
      ];
      const effective = buildEffectiveHistory(messages);
      expect(effective).toHaveLength(2);
      expect(effective[0].content).toBe('Msg 1');
    });

    it('should skip messages with condenseParent', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Msg 1', condenseParent: 'c1' },
        { role: 'assistant', content: 'Msg 2' },
      ];
      const effective = buildEffectiveHistory(messages);
      expect(effective).toHaveLength(1);
      expect(effective[0].content).toBe('Msg 2');
    });

    it('should implement the "fresh start" model using the last summary', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Old 1', condenseParent: 'c1' },
        { role: 'assistant', content: 'Old 2', condenseParent: 'c1' },
        { role: 'user', content: 'Summary content', summary: 'Summary content', condenseId: 'c1' },
        { role: 'user', content: 'New 1' },
      ];
      // Effective history should start from Summary content (index 2)
      // and skip any old messages even if they didn't have condenseParent (though in practice they will)
      const effective = buildEffectiveHistory(messages);
      expect(effective).toHaveLength(2);
      expect(effective[0].content).toBe('Summary content');
      expect(effective[1].content).toBe('New 1');
    });

    it('should handle nested/multiple generations of summaries', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Gen 1', condenseParent: 'c1' },
        { role: 'user', content: 'Summary 1', summary: 'S1', condenseId: 'c1', condenseParent: 'c2' },
        { role: 'user', content: 'Gen 2', condenseParent: 'c2' },
        { role: 'user', content: 'Summary 2', summary: 'S2', condenseId: 'c2' },
        { role: 'user', content: 'Gen 3' },
      ];
      // Should start from Summary 2
      const effective = buildEffectiveHistory(messages);
      expect(effective).toHaveLength(2);
      expect(effective[0].summary).toBe('S2');
      expect(effective[1].content).toBe('Gen 3');
    });
  });

  describe('Token Estimation Coordination', () => {
    it('should estimate tokens ONLY for effective history', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Very long text that should be ignored because it is condensed', condenseParent: 'c1' },
        { role: 'user', content: 'Summary', summary: 'Summary', condenseId: 'c1' }, // 7 chars
        { role: 'user', content: 'Hello' }, // 5 chars
      ];
      // 7 + 5 = 12 chars. 12 / 4 = 3 tokens.
      expect(estimateTokens(messages)).toBe(3);
    });

    it('should show 0 tokens for fully condensed history before summary is added', () => {
      // This state shouldn't happen in production because summary is added in same tick,
      // but test the logic robustness.
      const messages: Message[] = [
        { role: 'user', content: 'Old', condenseParent: 'c1' },
      ];
      expect(estimateTokens(messages)).toBe(0);
    });
  });
});

/**
 * Compact Utility Functions Tests
 */
describe('Compact Utilities', () => {
  describe('extractSummaryFromResponse', () => {
    it('should extract content between <summary> tags', () => {
      const response = `<analysis>Some analysis here</analysis>

<summary>
1. Primary Request: User wanted to fix a bug
2. Key Concepts: React hooks, state management
</summary>`;

      const summary = extractSummaryFromResponse(response);
      expect(summary).toContain('Primary Request: User wanted to fix a bug');
      expect(summary).toContain('Key Concepts: React hooks, state management');
      expect(summary).not.toContain('<analysis>');
    });

    it('should strip <analysis> tags if no <summary> tags present', () => {
      const response = `<analysis>Internal thinking process</analysis>

1. Primary Request: User wanted help
2. Key Concepts: Testing`;

      const summary = extractSummaryFromResponse(response);
      expect(summary).not.toContain('<analysis>');
      expect(summary).toContain('Primary Request: User wanted help');
    });

    it('should return original content if no tags present', () => {
      const response = 'Just plain summary text';
      const summary = extractSummaryFromResponse(response);
      expect(summary).toBe('Just plain summary text');
    });
  });

  describe('createCondenseId', () => {
    it('should create IDs with condense_ prefix and timestamp', () => {
      const id = createCondenseId();

      expect(id).toMatch(/^condense_\d+$/);
    });

    it('should create unique IDs when called with delay', async () => {
      const id1 = createCondenseId();
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      const id2 = createCondenseId();

      expect(id1).toMatch(/^condense_\d+$/);
      expect(id2).toMatch(/^condense_\d+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('tagMessagesWithCondenseParent', () => {
    it('should tag messages without condenseParent or summary', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Msg 2' },
      ];

      const tagged = tagMessagesWithCondenseParent(messages, 'condense_123');

      expect(tagged[0].condenseParent).toBe('condense_123');
      expect(tagged[0].isCompacted).toBe(true);
      expect(tagged[1].condenseParent).toBe('condense_123');
      expect(tagged[1].isCompacted).toBe(true);
    });

    it('should not tag messages that already have condenseParent', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Msg 1', condenseParent: 'old_id' },
        { role: 'assistant', content: 'Msg 2' },
      ];

      const tagged = tagMessagesWithCondenseParent(messages, 'condense_123');

      expect(tagged[0].condenseParent).toBe('old_id'); // Unchanged
      expect(tagged[1].condenseParent).toBe('condense_123'); // Tagged
    });

    it('should not tag summary messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Summary', summary: 'Summary', condenseId: 'old_id' },
        { role: 'assistant', content: 'Msg 2' },
      ];

      const tagged = tagMessagesWithCondenseParent(messages, 'condense_123');

      expect(tagged[0].condenseParent).toBeUndefined(); // Summary not tagged
      expect(tagged[1].condenseParent).toBe('condense_123'); // Regular message tagged
    });
  });

  describe('createSummaryMessage', () => {
    it('should create a properly formatted summary message', () => {
      const summary = 'User discussed React hooks and state management.';
      const condenseId = 'condense_123';

      const message = createSummaryMessage(summary, condenseId);

      expect(message.role).toBe('user');
      expect(message.content).toBe('[CONVERSATION SUMMARY]\nUser discussed React hooks and state management.');
      expect(message.summary).toBe(summary);
      expect(message.isCompacted).toBe(true);
      expect(message.condenseId).toBe(condenseId);
    });
  });

  describe('getMessagesToCompact', () => {
    it('should return messages without condenseParent or summary', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Msg 1' },
        { role: 'assistant', content: 'Msg 2' },
        { role: 'user', content: 'Old', condenseParent: 'old_id' },
        { role: 'user', content: 'Summary', summary: 'Summary', condenseId: 'old_id' },
      ];

      const toCompact = getMessagesToCompact(messages);

      expect(toCompact).toHaveLength(2);
      expect(toCompact[0].content).toBe('Msg 1');
      expect(toCompact[1].content).toBe('Msg 2');
    });

    it('should return empty array if all messages are compacted', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Old 1', condenseParent: 'c1' },
        { role: 'user', content: 'Summary', summary: 'Summary', condenseId: 'c1' },
      ];

      const toCompact = getMessagesToCompact(messages);

      expect(toCompact).toHaveLength(0);
    });
  });

  describe('shouldCompact', () => {
    it('should return true when tokens exceed threshold', () => {
      // 100 tokens, 1000 context window, 0.9 threshold = 900 tokens threshold
      expect(shouldCompact(950, 1000, 0.9)).toBe(true);
    });

    it('should return false when tokens are below threshold', () => {
      expect(shouldCompact(800, 1000, 0.9)).toBe(false);
    });

    it('should return false when tokens equal threshold', () => {
      expect(shouldCompact(900, 1000, 0.9)).toBe(false);
    });

    it('should handle different threshold values', () => {
      expect(shouldCompact(500, 1000, 0.5)).toBe(false); // 500 = threshold
      expect(shouldCompact(501, 1000, 0.5)).toBe(true);  // 501 > threshold
    });
  });
});
