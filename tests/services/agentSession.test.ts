import { describe, expect, it } from 'bun:test';
import {
  runAgentSession,
  resumeAgentSession,
  DEFAULT_SLIDE_MAX_ROUNDS,
  type AgentChatResponse,
  type AgentSessionParams,
  type AgentToolDispatch,
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
    payload: { question, options: ['16:9', '4:5'], field: 'canvas' },
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
    expect(result.rounds).toBe(2);
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
    expect(DEFAULT_SLIDE_MAX_ROUNDS).toBe(12);
  });
});
