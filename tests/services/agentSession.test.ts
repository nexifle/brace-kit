import { describe, expect, it } from 'bun:test';
import {
  runAgentSession,
  resumeAgentSession,
  createStreamingTransport,
  DEFAULT_SLIDE_MAX_ROUNDS,
  type AgentChatResponse,
  type AgentSessionParams,
  type AgentToolDispatch,
  type StreamDelta,
} from '../../src/services/agentSession.ts';
import type { APIMessage, MCPTool, ProviderConfig, ToolCall } from '../../src/types/index.ts';
import type { SlidePendingAsk } from '../../src/types/slides.ts';

const providerConfig: ProviderConfig = {
  providerId: 'custom',
  apiKey: '',
  apiUrl: 'http://localhost',
  model: 'test-model',
  format: 'openai',
  systemPrompt: '',
};

const readTool: MCPTool = { name: 'read_file', description: '', inputSchema: {} };

const userMsg: APIMessage = { role: 'user', content: 'build a deck' };

/** Transport that pops respondents from a queue and counts calls. */
type Responder = () => AgentChatResponse;
function makeTransport(respondents: Responder[]) {
  let callCount = 0;
  const transport: AgentSessionParams['transport'] = async () => {
    const respond = respondents[Math.min(callCount, respondents.length - 1)];
    callCount++;
    return respond();
  };
  return { transport, callCount: () => callCount };
}

function pendingAsk(question = 'Canvas?'): SlidePendingAsk {
  return {
    id: 'ask_1',
    toolCallId: 'tc_ask',
    sessionRef: 'plan',
    payload: {
      questions: [{ id: 'q1', text: question, options: ['16:9', '4:5'], field: 'canvas' }],
    },
    createdAt: Date.now(),
  };
}

describe('runAgentSession', () => {
  it('runs a single turn and completes cleanly', async () => {
    const { transport, callCount: calls } = makeTransport([() => ({ content: 'Hello' })]);
    const result = await runAgentSession({
      systemPrompt: 'You are a slide planner.',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      dispatchTool: async () => ({}) as AgentToolDispatch,
      transport,
    });

    expect(result.status).toBe('done');
    expect(calls()).toBe(1);
    expect(result.content).toBe('Hello');
    expect(result.rounds).toBe(1);
    expect(result.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(result.messages[0]).toEqual({ role: 'system', content: 'You are a slide planner.' });
  });

  it('injects a leading system message with the phase skill', async () => {
    const { transport } = makeTransport([() => ({ content: 'ok' })]);
    const result = await runAgentSession({
      systemPrompt: '   \nBuild skill.\n  ',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      dispatchTool: async () => ({}),
      transport,
    });
    expect(result.messages[0].role).toBe('system');
  });

  it('loops through client-side tool dispatch until the model stops calling tools', async () => {
    const dispatched: ToolCall[] = [];
    const { transport, callCount: calls } = makeTransport([
      () => ({
        content: 'reading',
        toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: '{"path":"/brief.md"}' }],
      }),
      () => ({ content: 'plan done' }),
    ]);

    const result = await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      maxRounds: 5,
      dispatchTool: async (toolCall) => {
        dispatched.push(toolCall);
        return { content: '"draft"' };
      },
      transport,
    });

    expect(calls()).toBe(2);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].name).toBe('read_file');
    expect(result.status).toBe('done');
    expect(result.content).toBe('plan done');
    expect(result.rounds).toBe(2);
    // system, user, assistant(1), tool, assistant(2)
    expect(result.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('halts with waiting_user + pendingAsk when a dispatch suspends (ask)', async () => {
    const ask: SlidePendingAsk = pendingAsk();
    const { transport, callCount: calls } = makeTransport([
      () => ({
        toolCalls: [{ id: 'tc_ask', name: 'ask', arguments: '{"question":"Canvas?"}' }],
      }),
      () => ({ content: 'SHOULD NOT RUN' }),
    ]);

    const result = await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      maxRounds: 5,
      dispatchTool: async () => ({ suspended: true, pendingAsk: ask }),
      transport,
    });

    expect(calls()).toBe(1); // loop stopped — never sent the follow-up
    expect(result.status).toBe('waiting_user');
    expect(result.pendingAsk).toEqual(ask);
    expect(result.rounds).toBe(1);
    // the assistant ask turn is preserved so resume can append the answer
    expect(result.messages.some((m) => m.role === 'assistant' && m.toolCalls?.length === 1)).toBe(true);
  });

  it('surfaces a transport error as status=error', async () => {
    const { transport } = makeTransport([() => ({ error: 'API key is required.' })]);
    const result = await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      dispatchTool: async () => ({}),
      transport,
    });
    expect(result.status).toBe('error');
    expect(result.error).toBe('API key is required.');
  });

  it('stops between turns when the AbortSignal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { transport } = makeTransport([() => ({ content: 'never' })]);
    const result = await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      dispatchTool: async () => ({}),
      transport,
      signal: controller.signal,
    });
    expect(result.status).toBe('cancelled');
  });

  it('cancels when the signal aborts mid-loop and aborts the in-flight request', async () => {
    const controller = new AbortController();
    const abortedRequests: string[] = [];
    const { transport } = makeTransport([
      () => ({ toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: '{}' }] }),
    ]);
    const abortRequest = (requestId: string) => abortedRequests.push(requestId);

    const result = await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      dispatchTool: async () => {
        controller.abort(); // abort while the in-flight request is still active
        return { content: 'x' };
      },
      transport,
      abortRequest,
      signal: controller.signal,
    });

    expect(result.status).toBe('cancelled');
    expect(abortedRequests).toHaveLength(1);
  });

  it('caps at maxRounds and returns the partial transcript as done', async () => {
    let dispatchCount = 0;
    const { transport, callCount: calls } = makeTransport([
      () => ({ toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: '{}' }] }),
      () => ({ toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: '{}' }] }),
      () => ({ content: 'unreachable' }),
    ]);

    const result = await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      maxRounds: 2,
      dispatchTool: async () => {
        dispatchCount++;
        return { content: 'x' };
      },
      transport,
    });

    expect(calls()).toBe(2);
    expect(dispatchCount).toBe(2);
    expect(result.status).toBe('done');
    expect(result.truncated).toBe(true);
    expect(result.rounds).toBe(2);
    expect(result.content).toMatch(/model-round limit \(2 rounds\)/);
  });

  it('calls onUpdate with terminal and intermediate states', async () => {
    const states: string[] = [];
    const { transport } = makeTransport([() => ({ content: 'done' })]);
    await runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      dispatchTool: async () => ({}),
      transport,
      onUpdate: (state) => states.push(state.status),
    });
    expect(states).toEqual(['done']);
  });
});

describe('resumeAgentSession', () => {
  it('continues from paused messages with the user answer appended', async () => {
    const { transport, callCount: calls } = makeTransport([() => ({ content: 'plan complete' })]);

    const prior: APIMessage[] = [
      { role: 'system', content: 's' },
      userMsg,
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 'tc_ask', name: 'ask', arguments: '{"question":"Canvas?"}' }],
      },
      { role: 'tool', toolCallId: 'tc_ask', name: 'ask', content: '16:9' },
    ];

    const result = await resumeAgentSession(
      {
        systemPrompt: 's',
        messages: [userMsg],
        tools: [readTool],
        providerConfig,
        chatOptions: {},
        dispatchTool: async () => ({}),
        transport,
      },
      { messages: prior, round: 2 }
    );

    expect(calls()).toBe(1);
    expect(result.status).toBe('done');
    expect(result.content).toBe('plan complete');
    expect(result.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });
});

describe('DEFAULT_SLIDE_MAX_ROUNDS', () => {
  it('is a sane default cap', () => {
    expect(DEFAULT_SLIDE_MAX_ROUNDS).toBe(24);
  });
});

// ==================== Streaming transport (US-035) ====================

/** Controllable fake chrome.runtime for exercising the streaming transport. */
function makeRuntime() {
  const listeners: Array<(message: unknown) => void> = [];
  let resolveSend: ((message: unknown) => void) | null = null;
  const sent: Array<Record<string, unknown>> = [];
  const runtime = {
    sent,
    emit: (message: unknown) => {
      for (const l of [...listeners]) l(message);
    },
    resolveSend: (message: unknown) => {
      resolveSend?.(message);
      resolveSend = null;
    },
    listenersCount: () => listeners.length,
    sendMessage: (_message: unknown) => {
      sent.push(_message as Record<string, unknown>);
      return new Promise<unknown>((resolve) => {
        resolveSend = resolve;
      });
    },
    onMessage: {
      addListener: (fn: (message: unknown) => void) => {
        listeners.push(fn);
      },
      removeListener: (fn: (message: unknown) => void) => {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      },
    },
  };
  return runtime;
}

type TestRuntime = ReturnType<typeof makeRuntime>;

/** Wait (yielding to the loop's microtasks) until the next CHAT_REQUEST is sent. */
async function waitForSend(runtime: TestRuntime, expectedCount: number) {
  for (let i = 0; i < 50; i++) {
    if (runtime.sent.length >= expectedCount) return runtime.sent[expectedCount - 1] as { requestId: string };
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('no CHAT_REQUEST observed');
}

describe('createStreamingTransport (US-035)', () => {
  it('feeds text + reasoning deltas to onDelta and resolves on CHAT_STREAM_DONE', async () => {
    const runtime = makeRuntime();
    const deltas: StreamDelta[] = [];
    const transport = createStreamingTransport(runtime, (d) => deltas.push(d));
    const requestId = 'agent_1_abc';
    const p = transport({
      type: 'CHAT_REQUEST',
      messages: [userMsg],
      providerConfig,
      tools: [readTool],
      options: { stream: true },
      requestId,
    });

    runtime.emit({ type: 'CHAT_STREAM_CHUNK', content: 'Hello', requestId });
    runtime.emit({ type: 'CHAT_STREAM_CHUNK', content: ' world', requestId });
    runtime.emit({ type: 'CHAT_STREAM_CHUNK', chunkType: 'reasoning', content: 'thinking', requestId });
    // The sendResponse for a stream is just {started:true} — it must NOT settle.
    runtime.resolveSend({ started: true });
    runtime.emit({
      type: 'CHAT_STREAM_DONE',
      fullContent: 'Hello world',
      reasoningContent: 'thinking',
      toolCalls: undefined,
      requestId,
    });

    const res = await p;
    expect(deltas).toEqual([{ text: 'Hello' }, { text: ' world' }, { reasoning: 'thinking' }]);
    expect(res.content).toBe('Hello world');
    expect(res.reasoning_content).toBe('thinking');
    expect(res.toolCalls).toBeUndefined();
    // Listener removed after settle — the transport must not leak handlers.
    expect(runtime.listenersCount()).toBe(0);
  });

  it('resolves with toolCalls from CHAT_STREAM_DONE when the turn ends in tool calls', async () => {
    const runtime = makeRuntime();
    const transport = createStreamingTransport(runtime);
    const requestId = 'agent_2_abc';
    const p = transport({
      type: 'CHAT_REQUEST',
      messages: [userMsg],
      providerConfig,
      tools: [readTool],
      options: { stream: true },
      requestId,
    });

    runtime.emit({
      type: 'CHAT_STREAM_DONE',
      fullContent: 'call tool',
      reasoningSignature: 'sig_abc',
      toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: '{}' }],
      requestId,
    });

    const res = await p;
    expect(res.toolCalls).toHaveLength(1);
    expect(res.toolCalls![0].name).toBe('read_file');
    expect(res.content).toBe('call tool');
    expect(res.reasoning_signature).toBe('sig_abc');
  });

  it('resolves with an error on CHAT_STREAM_ERROR', async () => {
    const runtime = makeRuntime();
    const transport = createStreamingTransport(runtime);
    const requestId = 'agent_3_abc';
    const p = transport({
      type: 'CHAT_REQUEST',
      messages: [userMsg],
      providerConfig,
      tools: [readTool],
      options: { stream: true },
      requestId,
    });

    runtime.emit({ type: 'CHAT_STREAM_ERROR', error: 'Model exploded', requestId });

    const res = await p;
    expect(res.error).toBe('Model exploded');
  });

  it('resolves terminal data from a non-streaming sendResponse (pre-stream error path)', async () => {
    const runtime = makeRuntime();
    const transport = createStreamingTransport(runtime);
    const requestId = 'agent_4_abc';
    const p = transport({
      type: 'CHAT_REQUEST',
      messages: [userMsg],
      providerConfig,
      tools: [readTool],
      options: { stream: true },
      requestId,
    });

    runtime.resolveSend({ error: 'API key is required.' });

    const res = await p;
    expect(res.error).toBe('API key is required.');
  });
});

describe('runAgentSession with a streaming transport (US-035)', () => {
  it('streams a multi-round tool loop end-to-end and resolves done', async () => {
    const runtime = makeRuntime();
    const dispatched: ToolCall[] = [];
    const agentPromise = runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      maxRounds: 5,
      transport: createStreamingTransport(runtime),
      dispatchTool: async (tc) => {
        dispatched.push(tc);
        return { content: '"draft"' };
      },
    });

    // Round 1 streams text + a read_file tool call.
    let req = await waitForSend(runtime, 1);
    runtime.emit({ type: 'CHAT_STREAM_CHUNK', content: 'reading', requestId: req.requestId });
    runtime.resolveSend({ started: true });
    runtime.emit({
      type: 'CHAT_STREAM_DONE',
      fullContent: 'reading',
      toolCalls: [{ id: 'tc_1', name: 'read_file', arguments: '{"path":"/brief.md"}' }],
      requestId: req.requestId,
    });

    // Round 2 (after the tool dispatch) completes cleanly.
    req = await waitForSend(runtime, 2);
    runtime.emit({ type: 'CHAT_STREAM_CHUNK', content: 'plan done', requestId: req.requestId });
    runtime.resolveSend({ started: true });
    runtime.emit({
      type: 'CHAT_STREAM_DONE',
      fullContent: 'plan done',
      requestId: req.requestId,
    });

    const result = await agentPromise;
    expect(result.status).toBe('done');
    expect(result.content).toBe('plan done');
    expect(result.rounds).toBe(2);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].name).toBe('read_file');
    // system, user, assistant(1), tool, assistant(2)
    expect(result.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('surfaces a streaming CHAT_STREAM_ERROR as status=error', async () => {
    const runtime = makeRuntime();
    const agentPromise = runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      transport: createStreamingTransport(runtime),
      dispatchTool: async () => ({}),
    });

    const req = await waitForSend(runtime, 1);
    runtime.emit({ type: 'CHAT_STREAM_ERROR', error: 'rate limited', requestId: req.requestId });

    const result = await agentPromise;
    expect(result.status).toBe('error');
    expect(result.error).toBe('rate limited');
  });

  it('aborts an in-flight streaming turn via STOP_STREAM and cancels (US-035)', async () => {
    const runtime = makeRuntime();
    const controller = new AbortController();
    const aborted: string[] = [];
    const agentPromise = runAgentSession({
      systemPrompt: 's',
      messages: [userMsg],
      tools: [readTool],
      providerConfig,
      chatOptions: {},
      // Streaming keeps `activeRequestId` set across the transport await, so a
      // mid-stream abort must send STOP_STREAM for the in-flight request.
      transport: createStreamingTransport(runtime),
      abortRequest: (requestId) => aborted.push(requestId),
      signal: controller.signal,
      dispatchTool: async () => ({}),
    });

    const req = await waitForSend(runtime, 1);
    // The in-flight stream is parked; a user Stop fires the abort listener.
    controller.abort();
    // The background settles an aborted stream via sendResponse({error}),
    // never a broadcast — both settle paths must cancel the session.
    runtime.resolveSend({ error: 'Request cancelled' });

    const result = await agentPromise;
    expect(result.status).toBe('cancelled');
    expect(aborted).toEqual([req.requestId]);
  });
});

