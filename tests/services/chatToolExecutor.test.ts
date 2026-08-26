import { beforeEach, describe, expect, it } from 'bun:test';
import { finishRequestAsSuspended } from '../../src/services/chatToolExecutor.ts';
import { useStore } from '../../src/store/index.ts';

describe('finishRequestAsSuspended', () => {
  beforeEach(() => {
    useStore.setState({
      activeConversationId: 'c1',
      isStreaming: true,
      currentRequestId: 'req_1',
      streamingContent: 'partial',
      streamingReasoningContent: 'think',
      streamingConversations: { c1: { requestId: 'req_1' }, c2: { requestId: 'req_other' } },
    });
  });

  it('clears the active request and conversation streaming state without touching other conversations', () => {
    finishRequestAsSuspended();
    const state = useStore.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.currentRequestId).toBeNull();
    expect(state.streamingContent).toBe('');
    expect(state.streamingReasoningContent).toBe('');
    expect(state.streamingConversations.c1).toBeUndefined();
    expect(state.streamingConversations.c2).toEqual({ requestId: 'req_other' });
  });
});
