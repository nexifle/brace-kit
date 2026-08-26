import { describe, test, expect, beforeEach } from 'bun:test';
import { useStore } from '../../src/store';
import { buildSystemPrompt, INTERNAL_SYSTEM_PROMPT } from '../../src/utils/systemPrompt.ts';
import type { Conversation } from '../../src/types';

// Helper to build metadata block (extracted logic from useMessageBuilder)
function buildMetadataBlock(conversations: Conversation[], activeConversationId: string | null): string {
  const activeConv = conversations.find((c) => c.id === activeConversationId);
  const timestamp = activeConv?.metadataTimestamp || new Date().toISOString();
  return `\n\n<metadata>{"currentTime": "${timestamp}"}</metadata>`;
}

describe('system prompt composition', () => {
  test('keeps internal instructions before the custom prompt and context', () => {
    const result = buildSystemPrompt('Use a friendly tone.', '\n\n<memory>saved preference</memory>', '<metadata>now</metadata>');
    expect(result).toBe(`${INTERNAL_SYSTEM_PROMPT}\n\nUse a friendly tone.\n\n<memory>saved preference</memory>\n\n<metadata>now</metadata>`);
  });

  test('does not include the MCP usage text', () => {
    expect(buildSystemPrompt('Custom prompt')).not.toContain('Context7');
    expect(buildSystemPrompt('Custom prompt')).not.toContain('webSearchPrime');
  });
});

describe('useMessageBuilder - Static Metadata Timestamp', () => {
  beforeEach(() => {
    useStore.setState({
      conversations: [],
      activeConversationId: null,
      messages: [],
      memories: [],
      memoryEnabled: false,
      providerConfig: {
        providerId: 'openai',
        apiKey: 'test-key',
        apiUrl: '',
        model: 'gpt-4',
        format: 'openai',
        systemPrompt: 'Test prompt',
      },
    });
  });

  test('buildMetadataBlock returns static timestamp from conversation', () => {
    const staticTimestamp = '2024-01-15T10:00:00.000Z';
    const conv: Conversation = {
      id: 'conv_123',
      title: 'Test Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadataTimestamp: staticTimestamp,
    };

    const metadataBlock = buildMetadataBlock([conv], conv.id);

    expect(metadataBlock).toContain(staticTimestamp);
    expect(metadataBlock).toBe(`\n\n<metadata>{"currentTime": "${staticTimestamp}"}</metadata>`);
  });

  test('buildMetadataBlock returns same timestamp across multiple calls', () => {
    const staticTimestamp = '2024-01-15T10:00:00.000Z';
    const conv: Conversation = {
      id: 'conv_123',
      title: 'Test Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadataTimestamp: staticTimestamp,
    };

    const firstCall = buildMetadataBlock([conv], conv.id);
    const secondCall = buildMetadataBlock([conv], conv.id);
    const thirdCall = buildMetadataBlock([conv], conv.id);

    expect(firstCall).toBe(secondCall);
    expect(secondCall).toBe(thirdCall);
    expect(firstCall).toContain(staticTimestamp);
  });

  test('buildMetadataBlock falls back to current time if no conversation', () => {
    const metadataBlock = buildMetadataBlock([], null);
    expect(metadataBlock).toMatch(/\n\n<metadata>{"currentTime": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"}<\/metadata>/);
  });

  test('buildMetadataBlock falls back to current time if conversation has no timestamp', () => {
    const conv: Conversation = {
      id: 'conv_123',
      title: 'Test Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const metadataBlock = buildMetadataBlock([conv], conv.id);
    expect(metadataBlock).toMatch(/\n\n<metadata>{"currentTime": "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"}<\/metadata>/);
  });

  test('metadata timestamp is included in system prompt', () => {
    const staticTimestamp = '2024-01-15T10:00:00.000Z';
    const conv: Conversation = {
      id: 'conv_123',
      title: 'Test Chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadataTimestamp: staticTimestamp,
    };

    const systemPrompt = 'You are a helpful assistant.';
    const metadataBlock = buildMetadataBlock([conv], conv.id);
    const fullSystemPrompt = systemPrompt + metadataBlock;

    expect(fullSystemPrompt).toContain(staticTimestamp);
    expect(fullSystemPrompt).toContain(`<metadata>{"currentTime": "${staticTimestamp}"}</metadata>`);
  });
});
