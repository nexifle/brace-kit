import { describe, test, expect, beforeEach, mock } from 'bun:test';

// Must mock modules BEFORE importing store (which depends on them)
// Mock chrome storage and conversation DB
global.chrome = {
  storage: {
    local: {
      get: mock(() => Promise.resolve({})),
      set: mock(() => Promise.resolve()),
      remove: mock(() => Promise.resolve()),
    },
    session: {
      get: mock(() => Promise.resolve({})),
      set: mock(() => Promise.resolve()),
      remove: mock(() => Promise.resolve()),
    },
  },
} as any;

// Mock conversation DB functions
mock.module('../../src/utils/conversationDB', () => ({
  saveConversationMetadata: mock(() => Promise.resolve()),
  deleteConversationMetadata: mock(() => Promise.resolve()),
  getAllConversationMetadata: mock(() => Promise.resolve([])),
  saveConversationMessages: mock(() => Promise.resolve()),
  getConversationMessages: mock(() => Promise.resolve(null)),
  deleteConversationMessages: mock(() => Promise.resolve()),
  migrateOldConversations: mock(() => Promise.resolve()),
}));

// Mock image DB functions
mock.module('../../src/utils/imageDB', () => ({
  saveImagesForConversation: mock(() => Promise.resolve([])),
  hydrateMessages: mock((msgs: any) => Promise.resolve(msgs)),
  deleteImagesByConversation: mock(() => Promise.resolve()),
}));

// NOTE: We intentionally do NOT mock memorySampler here because:
// 1. These tests don't involve memory selection functionality
// 2. Mocking memorySampler causes test pollution - it affects other test files
//    that test the actual memorySampler implementation
// 3. The store will use the real memorySampler, which is fine for these tests
//    since we're only testing metadataTimestamp behavior

// Import store AFTER mocks are set up
const { useStore } = await import('../../src/store');

describe('Store - Static Metadata Timestamp', () => {
  beforeEach(() => {
    useStore.setState({
      conversations: [],
      activeConversationId: null,
      messages: [],
      memories: [],
      memoryEnabled: false,
    });
  });

  test('createConversation sets metadataTimestamp', () => {
    const store = useStore.getState();
    const conv = store.createConversation();

    expect(conv.metadataTimestamp).toBeDefined();
    expect(conv.metadataTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('createConversation metadataTimestamp is ISO string', () => {
    const store = useStore.getState();
    const conv = store.createConversation();

    const timestamp = conv.metadataTimestamp!;
    const date = new Date(timestamp);

    expect(date.toISOString()).toBe(timestamp);
    expect(isNaN(date.getTime())).toBe(false);
  });

  test('multiple conversations have different metadataTimestamp', async () => {
    const store = useStore.getState();

    const conv1 = store.createConversation({ title: 'Chat 1' });
    await new Promise(resolve => setTimeout(resolve, 10));
    const conv2 = store.createConversation({ title: 'Chat 2' });

    expect(conv1.metadataTimestamp).toBeDefined();
    expect(conv2.metadataTimestamp).toBeDefined();
    expect(conv1.metadataTimestamp).not.toBe(conv2.metadataTimestamp);
  });

  test('conversation metadataTimestamp persists in state', () => {
    const store = useStore.getState();
    const conv = store.createConversation({ title: 'Test' });

    const timestamp = conv.metadataTimestamp;
    const state = useStore.getState();
    const storedConv = state.conversations.find(c => c.id === conv.id);

    expect(storedConv?.metadataTimestamp).toBe(timestamp);
  });
});
