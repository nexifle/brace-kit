import { describe, expect, it } from 'bun:test';
import {
  runPlanPhase,
  resumePlanPhase,
  hasValidPlanFiles,
  type PlanPhaseResult,
  type PlanPhaseParams,
} from '../../src/services/slidePhases.ts';
import type { APIMessage, ProviderConfig, ToolCall } from '../../src/types/index.ts';
import type { SlideFile } from '../../src/types/slides.ts';
import type { AgentChatResponse } from '../../src/services/agentSession.ts';

const providerConfig: ProviderConfig = {
  providerId: 'custom',
  apiKey: '',
  apiUrl: 'http://localhost',
  model: 'test-model',
  format: 'openai',
  systemPrompt: '',
};

function makeFiles(list: SlideFile[]): SlideFile[] {
  return list.map((f) => ({ ...f }));
}

function toolCall(name: string, argumentsStr: string): ToolCall {
  return { id: `tc_${Math.random().toString(36).slice(2, 8)}`, name, arguments: argumentsStr };
}

type Responder = () => AgentChatResponse;
function makeTransport(respondents: Responder[]) {
  let callCount = 0;
  const transport: PlanPhaseParams['transport'] = async () => {
    const respond = respondents[Math.min(callCount, respondents.length - 1)];
    callCount++;
    return respond();
  };
  return { transport, callCount: () => callCount };
}

const userMsg: APIMessage = { role: 'user', content: 'a slide deck about coffee' };

describe('hasValidPlanFiles', () => {
  it('is true only when both brief and design exist and are non-empty', () => {
    expect(hasValidPlanFiles([])).toBe(false);
    expect(hasValidPlanFiles(makeFiles([{ path: '/brief.md', content: 'plan' }]))).toBe(false);
    expect(
      hasValidPlanFiles(
        makeFiles([
          { path: '/brief.md', content: 'brief' },
          { path: '/design.md', content: '  ' },
        ])
      )
    ).toBe(false);
    expect(
      hasValidPlanFiles(
        makeFiles([
          { path: '/brief.md', content: 'brief' },
          { path: '/design.md', content: 'design' },
        ])
      )
    ).toBe(true);
  });
});

describe('runPlanPhase', () => {
  it('returns plan_ready when the model calls submit_plan after writing both files', async () => {
    const { transport, callCount: calls } = makeTransport([
      () => ({
        content: 'drafting',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee for Teams\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+dark theme\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'Done.', canvas: '16:9' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
    });

    expect(calls()).toBe(3);
    expect(result.status).toBe('plan_ready');
    expect(result.content).toBe('Plan complete.');
    expect(result.canvasChoice).toBe('16:9');
    expect(result.files.find((f) => f.path === '/brief.md')?.content).toContain(
      'Coffee for Teams'
    );
    expect(result.files.find((f) => f.path === '/design.md')?.content).toContain('dark theme');
  });

  it('returns plan_ready when both plan files are valid even without submit_plan', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'here you go',
        toolCalls: [
          toolCall('create', '{}'), // unknown tool gets an error result, still continues
        ],
      }),
      () => ({ content: 'finished' }),
    ]);

    // Build files via a supplied initial VFS carrying both valid files.
    const files = makeFiles([
      { path: '/brief.md', content: 'brief' },
      { path: '/design.md', content: 'design' },
    ]);
    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files,
      transport,
    });
    expect(result.status).toBe('plan_ready');
  });

  it('suspends with waiting_user + pendingAsk when the model calls ask', async () => {
    const { transport, callCount: calls } = makeTransport([
      () => ({
        toolCalls: [toolCall('ask', JSON.stringify({ question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' }))],
      }),
      () => ({ content: 'SHOULD NOT RUN' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
    });

    expect(calls()).toBe(1);
    expect(result.status).toBe('waiting_user');
    expect(result.pendingAsk).toBeTruthy();
    expect(result.pendingAsk?.payload.field).toBe('canvas');
    expect(result.pendingAsk?.payload.question).toBe('Canvas?');
    expect(result.pendingAsk?.payload.options).toEqual(['16:9', '4:5']);
  });

  it('routes list_files and read_file without errors and completes as partial done', async () => {
    const files = makeFiles([
      { path: '/brief.md', content: 'brief' },
      { path: '/slides/01.html', content: '<section>hi</section>' },
    ]);
    const { transport } = makeTransport([
      () => ({
        content: 'orienting',
        toolCalls: [
          toolCall('list_files', JSON.stringify({ path: '/' })),
          toolCall('read_file', JSON.stringify({ path: '/brief.md' })),
        ],
      }),
      () => ({ content: 'ok' }),
    ]);

    // No submit_plan and no valid pair ({/brief.md, /design.md} both present) —
    // reading/listing alone must not blow up and yields partial 'done'.
    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files,
      transport,
    });
    expect(result.status).toBe('done');
    expect(result.error).toBeUndefined();
  });

  it('returns error status when the transport reports an error', async () => {
    const { transport } = makeTransport([() => ({ error: 'API key is required.' })]);
    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
    });
    expect(result.status).toBe('error');
    expect(result.error).toBe('API key is required.');
  });
});

describe('plan ask pause/resume state machine (US-016)', () => {
  // Shared transport that refills respondents across the run + resume phases so
  // the resume continues the plan loop instead of restarting from round 1.
  const askId = 'tc_ask_pause';
  type Responder = () => AgentChatResponse;

  it('pauses with pendingAsk + paused transcript, then answerAsk resumes with the answer as an ask tool result', async () => {
    const respondents: Responder[] = [
      // round 1: write /brief.md via apply_patch, then ask (suspends)
      () => ({
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee for Teams\n' } })),
          { id: askId, name: 'ask', arguments: JSON.stringify({ question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' }) },
        ],
      }),
      // resume round 2: model submits the plan
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '4:5' }))] }),
      // resume round 3: final narration
      () => ({ content: 'Plan complete.' }),
    ];

    const captured: APIMessage[][] = [];
    const transport: PlanPhaseParams['transport'] = async ({ messages }) => {
      // Snapshot a copy — the loop mutates the passed array in place.
      captured.push(messages.slice());
      const respond = respondents[Math.min(captured.length - 1, respondents.length - 1)];
      return respond();
    };

    // ---- pause ----
    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
    });

    expect(captured.length).toBe(1); // no further model call after the ask
    expect(result.status).toBe('waiting_user');
    expect(result.pendingAsk).toBeTruthy();
    expect(result.pendingAsk?.toolCallId).toBe(askId);
    expect(result.pendingAsk?.payload.field).toBe('canvas');
    expect(result.paused).toBeTruthy();
    // the /brief.md patch applied before the suspend is on the result VFS
    expect(result.files.some((f) => f.path === '/brief.md')).toBe(true);
    // the paused transcript still contains the assistant ask turn (with the read_file? apply_patch tool)
    expect(result.paused?.messages.some((m) => m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0)).toBe(true);

    // ---- resume ----
    const resumed = await resumePlanPhase(
      {
        systemPrompt: 'p',
        messages: [userMsg],
        providerConfig,
        files: result.files, // carry the pre-ask VFS into the resumed session
        transport,
      },
      result.paused!,
      '16:9'
    );

    expect(resumed.status).toBe('plan_ready');
    expect(resumed.canvasChoice).toBe('4:5');
    // the resume request (2nd CHAT_REQUEST) appended the answer as the ask tool
    // result tied to askId
    const resumeReq = captured[1];
    const last = resumeReq[resumeReq.length - 1];
    expect(last).toEqual({ role: 'tool', toolCallId: askId, name: 'ask', content: '16:9' });
    // phase-1 VFS content carried through into the resumed session's result
    expect(
      resumed.files.some(
        (f) => f.path === '/brief.md' && f.content.includes('Coffee for Teams')
      )
    ).toBe(true);
  });

  it('does not fire a model request between the pause and answerAsk', async () => {
    let calls = 0;
    const transport: PlanPhaseParams['transport'] = async () => {
      calls++;
      return {
        toolCalls: [{ id: askId, name: 'ask', arguments: JSON.stringify({ question: 'Canvas?' }) }],
      };
    };

    // Simulate a simple run that suspends on the very first call.
    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
    });

    expect(result.status).toBe('waiting_user');
    expect(calls).toBe(1); // only the first CHAT_REQUEST fired; nothing since
  });

  it('returns a clear error when resumed without a paused session', async () => {
    const result = await resumePlanPhase(
      {
        systemPrompt: 'p',
        messages: [userMsg],
        providerConfig,
        files: [],
      },
      undefined as unknown as PlanPhaseResult['paused'],
      '16:9'
    );
    expect(result.status).toBe('error');
    expect(result.error).toContain('paused plan session');
  });
});
