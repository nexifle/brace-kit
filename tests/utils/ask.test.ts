import { describe, expect, it } from 'bun:test';
import { isChatSendBlocked } from '../../src/utils/ask.ts';
import { useStore } from '../../src/store/index.ts';
import type { Message } from '../../src/types/index.ts';

const idle = {
  pendingAsk: null,
  isStreaming: false,
  isCompacting: false,
  activeConversationId: 'c1',
  streamingConversations: {},
};

describe('isChatSendBlocked', () => {
  it('blocks send while a pending ask is waiting', () => {
    expect(isChatSendBlocked({
      ...idle,
      pendingAsk: { id: 'ask_1', toolCallId: 'tc1', payload: { questions: [] }, createdAt: 1 },
    })).toBe(true);
  });

  it('blocks send while streaming, compacting, or the active conversation is streaming', () => {
    expect(isChatSendBlocked({ ...idle, isStreaming: true })).toBe(true);
    expect(isChatSendBlocked({ ...idle, isCompacting: true })).toBe(true);
    expect(isChatSendBlocked({
      ...idle,
      streamingConversations: { c1: 'req' },
    })).toBe(true);
  });

  it('allows send when idle', () => {
    expect(isChatSendBlocked(idle)).toBe(false);
  });
});

describe('sendMessage pending-ask invariant', () => {
  it('does not create a new user message while a pending ask is set', () => {
    const existing: Message[] = [{ role: 'user', content: 'start' }];
    useStore.setState({
      messages: existing,
      pendingAsk: {
        id: 'ask_1',
        toolCallId: 'tc1',
        payload: { questions: [{ id: 'q1', text: 'Pick?' }] },
        createdAt: Date.now(),
      },
      isStreaming: false,
      isCompacting: false,
      activeConversationId: 'c1',
      streamingConversations: {},
    });

    const state = useStore.getState();
    if (!isChatSendBlocked(state)) {
      state.addMessage({ role: 'user', content: 'interleaved' });
    }

    expect(useStore.getState().messages).toEqual(existing);
    expect(useStore.getState().messages.some((m) => m.content === 'interleaved')).toBe(false);
  });
});
