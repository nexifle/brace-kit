import { describe, expect, it } from 'bun:test';
import {
  runPlanPhase,
  resumePlanPhase,
  hasValidPlanFiles,
  runBuildPhase,
  runEditPhase,
  imageReadBlockedMessage,
  type PlanPhaseResult,
  type PlanPhaseParams,
} from '../../src/services/slidePhases.ts';
import type { APIMessage, MCPTool, ProviderConfig, ToolCall } from '../../src/types/index.ts';
import type { SlideFile } from '../../src/types/slides.ts';
import type { AgentChatResponse } from '../../src/services/agentSession.ts';
import type { SlideActivityEvent } from '../../src/types/slides.ts';
import type { SlideActivitySink } from '../../src/services/slidePhases.ts';
import {
  askStartedLabel,
  connectingActivityLabel,
  listFilesLabel,
  modelRoundLabel,
  phaseCompletedLabel,
  phaseFailedLabel,
  phaseStartedLabel,
  phaseStoppedLabel,
  readFileLabel,
} from '../../src/utils/slideActivityLabels';

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

/**
 * A store-shaped activity sink that append/patch mirrors `pushActivity` /
 * `patchActivity` (in-place update by id). `events` holds the live rows (a
 * running tool_started becomes completed in place); `pushed` preserves an
 * immutable snapshot at push time so tests can assert the initial running state.
 */
function captureActivity() {
  const events: SlideActivityEvent[] = [];
  const pushed: SlideActivityEvent[] = [];
  const sink: SlideActivitySink = {
    push: (event) => {
      events.push(event);
      pushed.push({ ...event });
    },
    patch: (id, partial) => {
      const idx = events.findIndex((e) => e.id === id);
      if (idx >= 0) events[idx] = { ...events[idx], ...partial, id };
    },
  };
  return { sink, events, pushed };
}

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

  it('accepts flat apply_patch args (no nested operation) from the model', async () => {
    // Frontier models emit { type, path, diff } for function tools — not nested under operation.
    const { transport } = makeTransport([
      () => ({
        content: 'drafting',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({ type: 'create_file', path: '/brief.md', diff: '+title: Flat args work\n' }),
          ),
          toolCall(
            'apply_patch',
            JSON.stringify({ type: 'create_file', path: '/design.md', diff: '+dark theme\n' }),
          ),
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

    expect(result.status).toBe('plan_ready');
    expect(result.files.find((f) => f.path === '/brief.md')?.content).toContain('Flat args work');
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

  it('returns done when submit_plan fires without valid brief+design files', async () => {
    // Regression: submit_plan alone used to mark plan_ready while Build CTA
    // still required hasValidPlanFiles — split readiness / dead end UI.
    const { transport } = makeTransport([
      () => ({
        toolCalls: [
          toolCall('submit_plan', JSON.stringify({ summary: 'Looks good', canvas: '16:9' })),
        ],
      }),
      () => ({ content: 'Submitted without writing files.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
    });

    expect(result.status).toBe('done');
    expect(result.content).toBe('Submitted without writing files.');
    expect(hasValidPlanFiles(result.files)).toBe(false);
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
    expect(result.pendingAsk?.payload.questions[0].field).toBe('canvas');
    expect(result.pendingAsk?.payload.questions[0].text).toBe('Canvas?');
    expect(result.pendingAsk?.payload.questions[0].options).toEqual(['16:9', '4:5']);
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

  it('read_file on an image returns a blocked reason when the model is not multimodal', async () => {
    const files = makeFiles([
      { path: '/uploads/hero.jpg', content: 'data:image/jpeg;base64,qq' },
    ]);
    let toolResult = '';
    let round = 0;
    const transport: PlanPhaseParams['transport'] = async (req) => {
      const lastTool = [...(req.messages ?? [])].reverse().find((m) => m.role === 'tool');
      if (lastTool) toolResult = String(lastTool.content ?? '');
      round += 1;
      if (round === 1) {
        return {
          toolCalls: [toolCall('read_file', JSON.stringify({ path: '/uploads/hero.jpg' }))],
        };
      }
      return { content: 'ok' };
    };

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files,
      transport,
      toolOptions: { sendImageParts: false },
    });
    expect(result.status).toBe('done');
    expect(toolResult).toBe(imageReadBlockedMessage('/uploads/hero.jpg'));
    expect(toolResult).toContain('not multimodal');
    expect(toolResult).toContain('/uploads/hero.jpg');
    expect(toolResult).not.toContain('<img src=');
  });

  it('routes load_skill to packed skill resources, not the VFS', async () => {
    const files = makeFiles([{ path: '/brief.md', content: 'vfs brief' }]);
    const { transport } = makeTransport([
      () => ({
        toolCalls: [toolCall('load_skill', JSON.stringify({ name: 'SKILL.md' }))],
      }),
      () => ({ content: 'ok' }),
    ]);
    const fetcher = async (url: string) => {
      if (url.endsWith('plan/SKILL.md') || url.includes('plan/SKILL.md')) {
        return '---\nname: slide-creator-plan\ndescription: Plan.\n---\nfull plan skill body';
      }
      throw new Error(`not found: ${url}`);
    };

    let loaded = '';
    const wrapping = async (msg: Parameters<NonNullable<PlanPhaseParams['transport']>>[0]) => {
      const last = msg.messages?.[msg.messages.length - 1];
      if (last && last.role === 'tool') {
        loaded = typeof last.content === 'string' ? last.content : JSON.stringify(last.content ?? '');
      }
      return transport!(msg);
    };

    const result = await runPlanPhase({
      systemPrompt: 'stub',
      messages: [userMsg],
      providerConfig,
      files,
      transport: wrapping,
      skillFetcher: fetcher,
    });
    expect(result.status).toBe('done');
    expect(loaded).toContain('full plan skill body');
    expect(loaded).not.toContain('vfs brief');
  });

  it('returns already-loaded notice (no body) on duplicate load_skill in the same session', async () => {
    const skillBody =
      '---\nname: slide-creator-plan\ndescription: Plan.\n---\nfull plan skill body';
    const fetcher = async (url: string) => {
      if (url.endsWith('plan/SKILL.md') || url.includes('plan/SKILL.md')) return skillBody;
      throw new Error(`not found: ${url}`);
    };

    const toolResults: string[] = [];
    const { transport } = makeTransport([
      () => ({
        toolCalls: [toolCall('load_skill', JSON.stringify({ name: 'SKILL.md' }))],
      }),
      () => ({
        toolCalls: [toolCall('load_skill', JSON.stringify({ name: 'SKILL.md' }))],
      }),
      () => ({ content: 'ok' }),
    ]);
    const wrapping = async (msg: Parameters<NonNullable<PlanPhaseParams['transport']>>[0]) => {
      const last = msg.messages?.[msg.messages.length - 1];
      if (last && last.role === 'tool' && last.name === 'load_skill') {
        toolResults.push(typeof last.content === 'string' ? last.content : '');
      }
      return transport!(msg);
    };

    const { sink, events } = captureActivity();
    const result = await runPlanPhase({
      systemPrompt: 'stub',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport: wrapping,
      skillFetcher: fetcher,
      onActivity: sink,
    });
    expect(result.status).toBe('done');
    expect(toolResults.length).toBe(2);
    expect(toolResults[0]).toContain('full plan skill body');
    expect(toolResults[1]).toMatch(/^Already loaded: SKILL\.md/);
    expect(toolResults[1]).not.toContain('full plan skill body');
    const loadRows = events.filter((e) => e.type === 'tool_started' && e.toolName === 'load_skill');
    expect(loadRows.every((e) => e.status === 'completed')).toBe(true);
  });

  it('allows load_skill again after context compact clears the loaded set', async () => {
    const skillBody =
      '---\nname: slide-creator-plan\ndescription: Plan.\n---\nfull plan skill body';
    let skillFetches = 0;
    const fetcher = async (url: string) => {
      if (url.endsWith('plan/SKILL.md') || url.includes('plan/SKILL.md')) {
        skillFetches += 1;
        return skillBody;
      }
      throw new Error(`not found: ${url}`);
    };

    let modelTurns = 0;
    const transport: PlanPhaseParams['transport'] = async (req) => {
      const last = req.messages?.[req.messages.length - 1];
      if (
        last?.role === 'user' &&
        typeof last.content === 'string' &&
        last.content.includes('CONTEXT SUMMARIZATION')
      ) {
        return { content: '<summary>Prior plan work</summary>' };
      }
      modelTurns++;
      if (modelTurns === 1 || modelTurns === 2) {
        return {
          toolCalls: [toolCall('load_skill', JSON.stringify({ name: 'SKILL.md' }))],
        };
      }
      return { content: 'ok' };
    };

    const bloated: APIMessage[] = [
      userMsg,
      { role: 'assistant', content: 'x'.repeat(400) },
      { role: 'tool', toolCallId: 't0', name: 'read_file', content: 'y'.repeat(400) },
    ];

    const result = await runPlanPhase({
      systemPrompt: 'stub',
      messages: bloated,
      providerConfig,
      files: [],
      transport,
      skillFetcher: fetcher,
      agentContext: { toolResultCap: 12_000, charBudget: 100 },
    });
    expect(result.status).toBe('done');
    // Round 1 loads body; compact clears the set; round 2 fetches the body again.
    // (normalize may also read SKILL.md for catalog — count body-serving fetches ≥ 2.)
    expect(skillFetches).toBeGreaterThanOrEqual(2);
    expect(modelTurns).toBeGreaterThanOrEqual(2);
  });

  it('seeds loaded skills from prior transcript so follow-up does not re-fetch', async () => {
    const skillBody =
      '---\nname: slide-creator-plan\ndescription: Plan.\n---\nfull plan skill body';
    const fetcher = async (url: string) => {
      if (url.endsWith('plan/SKILL.md') || url.includes('plan/SKILL.md')) return skillBody;
      throw new Error(`not found: ${url}`);
    };

    const prior: APIMessage[] = [
      userMsg,
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'tc_prior_skill',
            name: 'load_skill',
            arguments: JSON.stringify({ name: 'SKILL.md' }),
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'tc_prior_skill',
        name: 'load_skill',
        content: skillBody,
      },
      { role: 'user', content: 'revise the brief' },
    ];

    let loaded = '';
    const { transport } = makeTransport([
      () => ({
        toolCalls: [toolCall('load_skill', JSON.stringify({ name: 'SKILL.md' }))],
      }),
      () => ({ content: 'ok' }),
    ]);
    const wrapping = async (msg: Parameters<NonNullable<PlanPhaseParams['transport']>>[0]) => {
      const last = msg.messages?.[msg.messages.length - 1];
      if (last && last.role === 'tool' && last.name === 'load_skill') {
        loaded = typeof last.content === 'string' ? last.content : '';
      }
      return transport!(msg);
    };

    const result = await runPlanPhase({
      systemPrompt: 'stub',
      messages: prior,
      providerConfig,
      files: [],
      transport: wrapping,
      skillFetcher: fetcher,
    });
    expect(result.status).toBe('done');
    expect(loaded).toMatch(/^Already loaded: SKILL\.md/);
    expect(loaded).not.toContain('full plan skill body');
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
      // resume: write missing design so plan is valid, then submit
      () => ({
        content: 'finishing',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/design.md',
                diff: '@@\n+dark theme\n',
              },
            }),
          ),
          toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '4:5' })),
        ],
      }),
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
    expect(result.pendingAsk?.payload.questions[0].field).toBe('canvas');
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

describe('google_search in plan phase (US-028)', () => {
  it('executes google_search via the injected externalTool and feeds the result back', async () => {
    const { transport, callCount: calls } = makeTransport([
      () => ({
        toolCalls: [toolCall('google_search', JSON.stringify({ query: 'coffee trends 2026' }))],
      }),
      () => ({
        content: 'Planning with search results.',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+cold brew is rising\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+editorial, coffee tones\n' } })),
        ],
      }),
      () => ({ content: 'Plan ready.' }),
    ]);

    const seen = { name: '', query: '' };
    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      toolOptions: {
        enableGoogleSearch: true,
        externalTool: async ({ name, args }) => {
          seen.name = name;
          seen.query = (args as { query?: string }).query ?? '';
          return { content: '[search results] cold brew is trending' };
        },
      },
    });

    expect(seen.name).toBe('google_search');
    expect(seen.query).toBe('coffee trends 2026');
    // The search result fed back as a tool observation allowed planning to finish.
    expect(calls()).toBe(3);
    expect(result.status).toBe('plan_ready');
    expect(result.files.find((f) => f.path === '/brief.md')?.content).toContain('cold brew');
    expect(result.files.find((f) => f.path === '/design.md')?.content).toContain('coffee tones');
  });

  it('surfaces a clear error instead of hanging when no externalTool is wired', async () => {
    // The model calls google_search but the session has no executor configured.
    const { transport } = makeTransport([
      () => ({ toolCalls: [toolCall('google_search', JSON.stringify({ query: 'x' }))] }),
      // After the error tool result, the model finishes without a valid plan.
      () => ({ content: 'No search available, using bundled references.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      toolOptions: { enableGoogleSearch: true },
    });

    expect(result.status).toBe('done');
    // Search results were never produced, so there is no ready plan.
    expect(result.files).toEqual([]);
  });
});

describe('MCP tools in slide sessions (US-029)', () => {
  const mcpTool: MCPTool = {
    name: 'slack_post',
    description: 'Post a message to Slack.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  };

  /** Transport that records the tool schemas offered on the first CHAT_REQUEST. */
  function recordingTransport(
    respondents: Responder[],
    captured: { tools?: MCPTool[] } = {}
  ) {
    let callCount = 0;
    const transport: PlanPhaseParams['transport'] = async (request) => {
      if (!captured.tools) captured.tools = request.tools;
      const respond = respondents[Math.min(callCount, respondents.length - 1)];
      callCount++;
      return respond();
    };
    return { transport, captured };
  }

  it('injects filtered MCP tools into the session tool list and keeps apply_patch client-side', async () => {
    const captured: { tools?: MCPTool[] } = {};
    const { transport } = recordingTransport(
      [
        () => ({
          content: 'drafting…',
          toolCalls: [
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee for Teams\n' } })),
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+dark theme\n' } })),
          ],
        }),
        () => ({ content: 'done.' }),
      ],
      captured
    );

    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      toolOptions: { mcpTools: [mcpTool] },
    });

    // The session offered both the MCP tool and the full slide set.
    expect(captured.tools?.some((t) => t.name === 'slack_post')).toBe(true);
    expect(captured.tools?.map((t) => t.name)).toContain('apply_patch');
    expect(captured.tools?.map((t) => t.name)).toContain('ask');
    // apply_patch still mutates the VFS client-side (never via MCP).
    expect(result.status).toBe('plan_ready');
    expect(result.files.find((f) => f.path === '/brief.md')?.content).toContain('Coffee for Teams');
  });

  it('drops any MCP tool whose name collides with a slide tool so the slide handler wins', async () => {
    const captured: { tools?: MCPTool[] } = {};
    const imposter: MCPTool = { name: 'apply_patch', description: 'MCP imposter', inputSchema: { type: 'object', properties: {} } };
    const { transport } = recordingTransport(
      [
        () => ({
          content: 'drafting…',
          toolCalls: [
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: X\n' } })),
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+theme\n' } })),
          ],
        }),
        () => ({ content: 'done.' }),
      ],
      captured
    );

    await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      toolOptions: { mcpTools: [imposter, mcpTool] },
    });

    // Only the single client-side apply_patch remains (no duplicate / imposter entry).
    const applyPatchCount = captured.tools?.filter((t) => t.name === 'apply_patch').length ?? 0;
    expect(applyPatchCount).toBe(1);
    expect(captured.tools?.some((t) => t.name === 'slack_post')).toBe(true);
  });

  it('routes MCP tool calls through externalTool (MCP_CALL_TOOL) while apply_patch stays client-side', async () => {
    const mcpCalls: { name: string; args: Record<string, unknown> }[] = [];
    const externalTool = async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      mcpCalls.push({ name, args });
      return { content: 'mcp result ok' };
    };
    const { transport } = makeTransport([
      () => ({
        content: 'reporting…',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: X\n' } })),
          toolCall('slack_post', JSON.stringify({ text: 'plan drafted' })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      toolOptions: { mcpTools: [mcpTool], externalTool },
    });

    // The MCP tool went out through the shared external executor; the patch was
    // applied client-side to the VFS.
    expect(mcpCalls).toEqual([{ name: 'slack_post', args: { text: 'plan drafted' } }]);
    expect(result.files.find((f) => f.path === '/brief.md')?.content).toContain('title');
  });

  it('surfaces an MCP disconnect error cleanly to the model', async () => {
    const externalTool = async () => ({ error: 'MCP disconnect: server-a' });
    let toolResultContent: string | undefined;
    const transport: PlanPhaseParams['transport'] = async (request) => {
      const toolResult = request.messages.find((m) => m.role === 'tool');
      if (toolResult) {
        toolResultContent = (toolResult as { content?: string }).content;
        return { content: 'done.' };
      }
      return { content: 'calling…', toolCalls: [toolCall('slack_post', JSON.stringify({ text: 'x' }))] };
    };

    await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      toolOptions: { mcpTools: [mcpTool], externalTool },
    });

    expect(toolResultContent).toBe('Error: MCP disconnect: server-a');
  });
});

describe('runBuildPhase', () => {
  const buildFiles = makeFiles([
    { path: '/brief.md', content: '# Coffee deck\nOne slide per topic.' },
    { path: '/design.md', content: 'Dark theme, 16:9.' },
  ]);

  it('produces a ready deck from plan docs, injecting them into the session prompt', async () => {
    let seenSystem = '';
    const { transport, callCount: calls } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/theme.css', diff: '@@\n+body{color:#111}\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section class="slide">Hello</section>\n' } })),
        ],
      }),
      () => ({ content: 'Deck complete.' }),
    ]);

    // Wrap transport to capture the system prompt injected on the first round.
    type T = NonNullable<Parameters<typeof runBuildPhase>[0]['transport']>;
    const capturing = (async (request) => {
      seenSystem = request.messages[0]?.content ?? '';
      return (transport as T)(request as Parameters<T>[0]);
    }) as T;

    const result = await runBuildPhase({
      systemPrompt: 'you are the build sub-agent',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport: capturing,
    });

    expect(calls()).toBe(2);
    expect(result.status).toBe('ready');
    expect(result.content).toBe('Deck complete.');
    expect(result.files.find((f) => f.path === '/deck.json')?.content).toContain('slideOrder');
    expect(result.files.find((f) => f.path === '/slides/01.html')?.content).toContain('Hello');
    // the build skill prompt carries the approved plan docs in context
    expect(seenSystem).toContain('build sub-agent');
    expect(seenSystem).toContain('/brief.md (approved)');
    expect(seenSystem).toContain('Coffee deck');
    expect(seenSystem).toContain('/design.md (approved)');
  });

  it('resolves done (partial) when the agent finishes with no renderable deck', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'no slides yet',
        toolCalls: [toolCall('list_files', JSON.stringify({ path: '/' }))],
      }),
      () => ({ content: 'done' }),
    ]);
    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
    });
    expect(result.status).toBe('done');
    expect(result.error).toBeUndefined();
  });

  it('does not mark ready when maxRounds truncates even if one slide projects', async () => {
    // Always-tool responses until the round cap → truncated partial.
    const { transport } = makeTransport([
      () => ({
        content: 'partial',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/slides/01.html',
                diff: '@@\n+<section>One</section>\n',
              },
            }),
          ),
        ],
      }),
      () => ({
        toolCalls: [toolCall('list_files', JSON.stringify({ path: '/' }))],
      }),
    ]);

    const pushed: { type: string; label?: string }[] = [];
    const result = await runBuildPhase({
      systemPrompt: 'b',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
      maxRounds: 2,
      onActivity: {
        push: (e) => pushed.push(e),
        patch: () => {},
      },
    });

    expect(result.status).toBe('done');
    expect(result.truncated).toBe(true);
    expect(result.slideCount).toBe(1);
    expect(result.rounds).toBe(2);
    // Activity must fail with max-round copy — never "Deck ready — 1 slide".
    const failed = pushed.filter((e) => e.type === 'phase_failed');
    expect(failed.length).toBe(1);
    expect(failed[0].label).toMatch(/model round/i);
    expect(pushed.some((e) => e.type === 'phase_completed')).toBe(false);
  });

  it('denies writes to plan-only paths (build allowlist) via the harness', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'oops',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/brief.md', diff: '@@\n-new\n+edited\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+ok\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/deck.json', diff: '@@\n+{"slideOrder":["01"],"canvas":"16:9","theme":"/theme.css","title":"t"}\n' } }))] }),
      () => ({ content: 'finished' }),
    ]);
    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
    });
    expect(result.status).toBe('ready');
    // /brief.md must NOT be overwritten during build (denied by allowlist)
    expect(result.files.find((f) => f.path === '/brief.md')?.content).toBe(buildFiles[0].content);
  });

  it('returns error status when the transport reports an error', async () => {
    const { transport } = makeTransport([() => ({ error: 'Build failed.' })]);
    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
    });
    expect(result.status).toBe('error');
    expect(result.error).toBe('Build failed.');
  });
});

describe('runEditPhase', () => {
  const editFiles = makeFiles([
    { path: '/brief.md', content: '# Coffee deck\nOne slide per topic.' },
    { path: '/design.md', content: 'Dark theme, 16:9.' },
    { path: '/theme.css', content: 'body{color:#111}' },
    {
      path: '/slides/01.html',
      content: '<section class="slide">\n  Hello\n</section>\n',
    },
    {
      path: '/deck.json',
      content:
        '{\n  "title":"Coffee Deck",\n  "canvas":"16:9",\n  "theme":"/theme.css",\n  "slideOrder":[\n    "01"\n  ]\n}\n',
    },
  ]);

  it('surgically updates an existing slide via update_file and stays ready', async () => {
    let seenSystem = '';
    const { transport, callCount: calls } = makeTransport([
      () => ({
        content: 'editing',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/slides/01.html', diff: '@@\n-  Hello\n+  Hello, world\n' } })),
        ],
      }),
      () => ({ content: 'Edited.' }),
    ]);

    type T = NonNullable<Parameters<typeof runEditPhase>[0]['transport']>;
    const capturing = (async (request) => {
      seenSystem = request.messages[0]?.content ?? '';
      return (transport as T)(request as Parameters<T>[0]);
    }) as T;

    const result = await runEditPhase({
      systemPrompt: 'you are the edit sub-agent',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport: capturing,
    });

    expect(calls()).toBe(2);
    expect(result.status).toBe('ready');
    expect(result.content).toBe('Edited.');
    expect(result.files.find((f) => f.path === '/slides/01.html')?.content).toContain(
      'Hello, world'
    );
    // unchanged slides keep their copy
    expect(result.files.find((f) => f.path === '/slides/01.html')?.content).toContain('</section>');
    // the plan docs are injected into the edit session prompt as context
    expect(seenSystem).toContain('edit sub-agent');
    expect(seenSystem).toContain('/brief.md (approved)');
    expect(seenSystem).toContain('/design.md (approved)');
  });

  it('adds a new slide via create_file and the harness grows deck.json slideOrder', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'adding slide 02',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/02.html', diff: '@@\n+<section class="slide">\n+  Second\n+</section>\n' } })),
        ],
      }),
      () => ({ content: 'Added.' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
    });

    expect(result.status).toBe('ready');
    expect(result.files.find((f) => f.path === '/slides/02.html')).toBeTruthy();
    expect(result.files.find((f) => f.path === '/deck.json')?.content).toContain('"02"');
    // the deck still projects slide 01 (unchanged sibling)
    expect(result.files.find((f) => f.path === '/deck.json')?.content).toContain('"01"');
  });

  it('inserts a slide mid-deck via create_file + reorder_slides without deleting slides', async () => {
    const deck = makeFiles([
      { path: '/brief.md', content: '# Coffee deck' },
      { path: '/design.md', content: 'Dark theme, 16:9.' },
      { path: '/theme.css', content: 'body{}' },
      { path: '/slides/01.html', content: '<section>one</section>' },
      { path: '/slides/01.css', content: '/* one */' },
      { path: '/slides/02.html', content: '<section>two</section>' },
      { path: '/slides/02.css', content: '/* two */' },
      { path: '/slides/03.html', content: '<section>three</section>' },
      { path: '/slides/04.html', content: '<section>four</section>' },
      { path: '/slides/05.html', content: '<section>five</section>' },
      {
        path: '/deck.json',
        content: JSON.stringify({
          title: 'Coffee Deck',
          canvas: '16:9',
          theme: '/theme.css',
          slideOrder: ['01', '02', '03', '04', '05'],
        }),
      },
    ]);

    const { transport } = makeTransport([
      () => ({
        content: 'inserting a new slide 3',
        toolCalls: [
          // create the new slide under a placeholder id, then reorder to slot it at 3
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/zz.html', diff: '@@\n+<section>new-mid</section>\n' } })),
          toolCall('reorder_slides', JSON.stringify({ order: ['01', '02', 'zz', '03', '04', '05'] })),
        ],
      }),
      () => ({ content: 'Inserted.' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: deck,
      transport,
    });

    expect(result.status).toBe('ready');
    const deckJson = JSON.parse(result.files.find((f) => f.path === '/deck.json')!.content);
    expect(deckJson.slideOrder).toEqual(['01', '02', '03', '04', '05', '06']);
    // the new slide's content is now at id 03
    expect(result.files.find((f) => f.path === '/slides/03.html')?.content).toContain('new-mid');
    // shifted slides keep their original content (renamed, not rewritten)
    expect(result.files.find((f) => f.path === '/slides/04.html')?.content).toContain('three');
    expect(result.files.find((f) => f.path === '/slides/05.html')?.content).toContain('four');
    expect(result.files.find((f) => f.path === '/slides/06.html')?.content).toContain('five');
    // no slide was deleted during the reorder
    expect(result.files.some((f) => f.path === '/slides/zz.html')).toBe(false);
  });

  it('returns status done when the edit leaves no renderable deck', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'removing last slide',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'delete_file', path: '/slides/01.html' } })),
        ],
      }),
      () => ({ content: 'done' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
    });
    expect(result.status).toBe('done');
    expect(result.error).toBeUndefined();
  });

  it('routes a failed patch back as output and still finishes', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'trying a stale diff',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/slides/01.html', diff: '@@\n-  MISSING CONTEXT\n+  replacement\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/slides/01.html', diff: '@@\n-  Hello\n+  Edited\n' } })),
        ],
      }),
      () => ({ content: 'recovered' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
    });
    expect(result.status).toBe('ready');
    // the first (stale) patch failed and did not clobber the file; the second applied
    expect(result.files.find((f) => f.path === '/slides/01.html')?.content).toContain('Edited');
  });

  it('denies writes to paths outside the edit allowlist via the harness', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'bad path',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/../untracked.txt', diff: '@@\n+oops\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/slides/01.html', diff: '@@\n-  Hello\n+  Edited\n' } })),
        ],
      }),
      () => ({ content: 'done' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
    });
    expect(result.status).toBe('ready');
    // the out-of-allowlist path was never created; only the allowed slide edit applied
    expect(result.files.some((f) => f.path.includes('untracked'))).toBe(false);
    expect(result.files.find((f) => f.path === '/slides/01.html')?.content).toContain('Edited');
  });

  it('returns error status when the transport reports an error', async () => {
    const { transport } = makeTransport([() => ({ error: 'Edit failed.' })]);
    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
    });
    expect(result.status).toBe('error');
    expect(result.error).toBe('Edit failed.');
  });
});

describe('activity events for tool calls (US-036)', () => {
  it('emits tool_started (running→completed) and file_written for each apply_patch', async () => {
    const { sink, events, pushed } = captureActivity();
    const { transport } = makeTransport([
      () => ({
        content: 'drafting',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+dark theme\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'Done.' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('plan_ready');
    // tool_started rows appeared for the two apply_patch calls + submit_plan
    const startedSnap = pushed.filter((e) => e.type === 'tool_started');
    expect(startedSnap.length).toBe(3);
    const [a, b, submit] = startedSnap;
    // each started push carried running status, name, callId + phase
    for (const ev of startedSnap) {
      expect(ev.status).toBe('running');
      expect(ev.phase).toBe('plan');
      expect(ev.toolCallId).toBeTruthy();
      expect(ev.label).toBeTruthy();
    }
    expect(a.round).toBe(1);
    expect(b.round).toBe(1);
    // submit_plan ran on the second model round
    expect(submit.toolName).toBe('submit_plan');
    expect(submit.round).toBe(2);
    // success → every started row patched to completed
    expect(events.filter((e) => e.type === 'tool_started' && e.status === 'completed').length).toBe(3);
    // apply_patch success also emitted file_written rows w/ path+patchOp
    const written = events.filter((e) => e.type === 'file_written');
    expect(written.length).toBe(2);
    expect(written[0].path).toBe('/brief.md');
    expect(written[0].patchOp).toBe('create_file');
    expect(written[1].path).toBe('/design.md');
  });

  it('marks the tool_started row failed when a patch fails and emits no file_written', async () => {
    const { sink, events } = captureActivity();
    const { transport } = makeTransport([
      () => ({
        content: 'bad diff',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/brief.md', diff: '@@\n-  MISSING\n+  x\n' } })),
        ],
      }),
      () => ({ content: 'done' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('done');
    const started = events.filter((e) => e.type === 'tool_started');
    expect(started.length).toBe(1);
    expect(started[0].status).toBe('failed');
    expect(started[0].label).toMatch(/^Failed:/);
    // no file_written for a failed patch
    expect(events.filter((e) => e.type === 'file_written').length).toBe(0);
  });

  it('emits list_files/read_file tool_started→completed with labels', async () => {
    const { sink, events } = captureActivity();
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

    await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files,
      transport,
      onActivity: sink,
    });

    const labels = events.filter((e) => e.type === 'tool_started').map((e) => e.label);
    expect(labels).toContain(listFilesLabel());
    expect(labels).toContain(readFileLabel('/brief.md'));
    expect(events.filter((e) => e.type === 'tool_started' && e.status === 'completed').length).toBe(2);
  });

  it('ask emits a running ask row that suspends, then resume patches it + emits ask_answered', async () => {
    const { sink, events } = captureActivity();
    const askId = 'tc_ask_activity';
    const respondents: (() => AgentChatResponse)[] = [
      () => ({
        toolCalls: [{ id: askId, name: 'ask', arguments: JSON.stringify({ question: 'Canvas?', field: 'canvas' }) }],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '4:5' }))] }),
      () => ({ content: 'done.' }),
    ];

    const captured: APIMessage[][] = [];
    const transport: PlanPhaseParams['transport'] = async ({ messages }) => {
      captured.push(messages.slice());
      const respond = respondents[Math.min(captured.length - 1, respondents.length - 1)];
      return respond();
    };

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('waiting_user');
    // the ask dispatched a single running row labelled "Asking you a question"
    const askStarted = events.filter((e) => e.type === 'tool_started' && e.toolCallId === askId);
    expect(askStarted.length).toBe(1);
    expect(askStarted[0].status).toBe('running');
    expect(askStarted[0].label).toBe(askStartedLabel());
    // the running ask row is keyed by the pending-ask id so resume can close it
    expect(askStarted[0].id).toBe(result.pendingAsk?.id);

    await resumePlanPhase(
      {
        systemPrompt: 'p',
        messages: [userMsg],
        providerConfig,
        files: [],
        transport,
        onActivity: sink,
      },
      result.paused!,
      '4:5'
    );

    // resume closed the suspended ask row (now completed) + emitted ask_answered
    const askRow = events.find((e) => e.type === 'tool_started' && e.toolCallId === askId);
    expect(askRow?.status).toBe('completed');
    const answered = events.filter((e) => e.type === 'ask_answered');
    expect(answered.length).toBe(1);
    expect(answered[0].toolCallId).toBe(askId);
    expect(answered[0].status).toBe('completed');
  });

  it('build phase emits tool_started + file_written rows for slide/theme files', async () => {
    const { sink, events } = captureActivity();
    const buildFiles = makeFiles([
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
    ]);
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>Hello</section>\n' } })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    expect(events.filter((e) => e.type === 'tool_started' && e.status === 'completed').length).toBe(1);
    const written = events.filter((e) => e.type === 'file_written');
    expect(written.map((e) => e.path)).toContain('/slides/01.html');
    // /deck.json is code-generated, not an apply_patch write — no file_written row.
    expect(written.map((e) => e.path)).not.toContain('/deck.json');
    expect(written.every((e) => e.phase === 'build')).toBe(true);
  });

  it('edit phase emits a file_deleted row for a successful delete_file', async () => {
    const { sink, events } = captureActivity();
    const editFiles = makeFiles([
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
      { path: '/theme.css', content: 'body{}' },
      { path: '/slides/01.html', content: '<section>Hello</section>' },
      { path: '/slides/02.html', content: '<section>Bye</section>' },
      {
        path: '/deck.json',
        content: '{"title":"t","canvas":"16:9","theme":"/theme.css","slideOrder":["01","02"]}',
      },
    ]);
    const { transport } = makeTransport([
      () => ({
        content: 'removing slide 01',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'delete_file', path: '/slides/01.html' } })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    // the delete tool_started row completed
    const delRow = events.find((e) => e.type === 'tool_started' && e.toolName === 'apply_patch');
    expect(delRow?.status).toBe('completed');
    // a file_deleted row carries the path + patchOp
    const deleted = events.filter((e) => e.type === 'file_deleted');
    expect(deleted.length).toBe(1);
    expect(deleted[0].path).toBe('/slides/01.html');
    expect(deleted[0].patchOp).toBe('delete_file');
    expect(deleted[0].phase).toBe('edit');
  });
});

describe('phase lifecycle activity events (US-037)', () => {
  it('plan success emits phase_started + connecting + model_round rows + phase_completed', async () => {
    const { sink, events, pushed } = captureActivity();
    const { transport } = makeTransport([
      () => ({
        content: 'drafting',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+dark\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('plan_ready');
    // phase_started is the first row, already completed (a check), with A.5 label
    expect(events[0].type).toBe('phase_started');
    expect(events[0].status).toBe('completed');
    expect(events[0].phase).toBe('plan');
    expect(events[0].label).toBe(phaseStartedLabel('plan'));

    // connecting row started running, completed once the first round sends a request
    const connectingPush = pushed.find((e) => e.type === 'connecting');
    expect(connectingPush).toBeTruthy();
    expect(connectingPush!.status).toBe('running');
    expect(connectingPush!.label).toBe(connectingActivityLabel());
    expect(events.find((e) => e.type === 'connecting')?.status).toBe('completed');

    // each model round: a running model_round_started snapshot → patched to completed
    const roundPushes = pushed.filter((e) => e.type === 'model_round_started');
    expect(roundPushes.map((r) => r.round)).toEqual([1, 2, 3]);
    expect(roundPushes.every((r) => r.status === 'running')).toBe(true);
    expect(roundPushes.every((r) => r.label === modelRoundLabel(r.round!))).toBe(true);
    expect(
      events.filter((e) => e.type === 'model_round_started' && e.status === 'completed').length,
    ).toBe(3);

    // phase_completed with the plan label
    const completed = events.filter((e) => e.type === 'phase_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].label).toBe(phaseCompletedLabel('plan'));
    expect(completed[0].status).toBe('completed');
  });

  it('build success emits phase_completed with the slide count', async () => {
    const { sink, events } = captureActivity();
    const buildFiles = makeFiles([
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
    ]);
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>Hello</section>\n' } })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    const completed = events.filter((e) => e.type === 'phase_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].phase).toBe('build');
    expect(completed[0].status).toBe('completed');
    expect(completed[0].label).toBe(phaseCompletedLabel('build', { slideCount: 1 }));
  });

  it('edit success emits phase_completed with the edit label', async () => {
    const { sink, events } = captureActivity();
    const editFiles = makeFiles([
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
      { path: '/theme.css', content: 'body{}' },
      { path: '/slides/01.html', content: '<section>Hello</section>' },
      { path: '/deck.json', content: '{"title":"t","canvas":"16:9","theme":"/theme.css","slideOrder":["01"]}' },
    ]);
    const { transport } = makeTransport([
      () => ({
        content: 'updating',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/slides/01.html', diff: '@@\n <section>Hello</section>\n+<p>More</p>\n' } })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    const completed = events.filter((e) => e.type === 'phase_completed');
    expect(completed).toHaveLength(1);
    expect(completed[0].label).toBe(phaseCompletedLabel('edit'));
    expect(completed[0].phase).toBe('edit');
  });

  it('user stop emits phase_stopped and settles the connecting row', async () => {
    const { sink, events } = captureActivity();
    const controller = new AbortController();
    const aborted: string[] = [];
    const transport = async () => {
      // abort the in-flight request mid-run → the runner cancels partial files
      controller.abort();
      return { content: 'never' };
    };

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      abortRequest: (id) => aborted.push(id),
      signal: controller.signal,
      onActivity: sink,
    });

    expect(result.status).toBe('cancelled');
    expect(aborted.length).toBeGreaterThan(0);
    const stopped = events.filter((e) => e.type === 'phase_stopped');
    expect(stopped).toHaveLength(1);
    expect(stopped[0].label).toBe(phaseStoppedLabel());
    expect(stopped[0].status).toBe('cancelled');
    // a round already started, so the connecting row was resolved to completed
    // (user-stop patching it to cancelled would wrongly flip a completed row)
    expect(events.find((e) => e.type === 'connecting')?.status).toBe('completed');
    // a round started before the stop
    expect(events.filter((e) => e.type === 'model_round_started').length).toBe(1);
  });

  it('transport error emits phase_failed with the message', async () => {
    const { sink, events } = captureActivity();
    const { transport } = makeTransport([() => ({ error: 'API key is required.' })]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('error');
    const failed = events.filter((e) => e.type === 'phase_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].label).toBe(phaseFailedLabel('API key is required.'));
    expect(failed[0].status).toBe('failed');
    expect(failed[0].detail).toBe('API key is required.');
    // a round started (the transport responded with an error after onRoundStart),
    // so connecting resolved to completed rather than being re-flipped to failed
    expect(events.find((e) => e.type === 'connecting')?.status).toBe('completed');
  });

  it('a pre-aborted signal settles connecting to cancelled with no round row', async () => {
    const { sink, events } = captureActivity();
    const controller = new AbortController();
    controller.abort();
    const { transport } = makeTransport([() => ({ content: 'never' })]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      signal: controller.signal,
      onActivity: sink,
    });

    expect(result.status).toBe('cancelled');
    // no round ever started, so the connecting spinner settles to cancelled
    expect(events.find((e) => e.type === 'connecting')?.status).toBe('cancelled');
    expect(events.filter((e) => e.type === 'model_round_started').length).toBe(0);
    expect(events.filter((e) => e.type === 'phase_stopped').length).toBe(1);
  });

  it('a plan that ends done without a deliverable emits phase_failed, not a bogus ready', async () => {
    const { sink, events } = captureActivity();
    const { transport } = makeTransport([
      () => ({ content: 'listing only', toolCalls: [toolCall('list_files', JSON.stringify({ path: '/' }))] }),
      () => ({ content: 'I could not write a plan.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('done');
    const failed = events.filter((e) => e.type === 'phase_failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].label).toBe(
      phaseFailedLabel('The planner finished without a complete brief and design.'),
    );
    expect(events.filter((e) => e.type === 'phase_completed').length).toBe(0);
  });
});

describe('runBuildPhase deck.json code ownership', () => {
  it('rejects a deck.json write and generates a valid code-owned deck.json', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/theme.css', diff: '@@\n+body{}\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>One</section>\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/deck.json', diff: '@@\n+{"title":"T","canvas":"16:9","slideOrder":["01"]}\n' } })),
        ],
      }),
      () => ({ content: 'finished' }),
    ]);

    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: makeFiles([
        { path: '/brief.md', content: 'brief' },
        { path: '/design.md', content: 'design' },
      ]),
      transport,
    });

    // The deck.json write is REJECTED (code-owned), yet the deck is still valid:
    // the harness generates deck.json from the slide files (theme.css → theme,
    // 01.html → slideOrder ["01"]), so the run completes ready.
    expect(result.status).toBe('ready');
    expect(result.slideCount).toBe(1);
    const deck = result.files.find((f) => f.path === '/deck.json');
    expect(deck).toBeTruthy();
    expect(deck?.content).toContain('"01"');
    expect(deck?.content).toContain('/theme.css');
    // the agent's hand-written canvas was NOT adopted — the harness owns the shape
    expect(deck?.content).not.toContain('"16:9"');
  });

  it('self-heals a pre-existing malformed deck.json on the first build patch', async () => {
    // A legacy/hand-written deck.json that is invalid JSON is regenerated the
    // moment the build agent makes any patch (dispatchApplyPatch re-syncs).
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/02.html', diff: '@@\n+<section>Two</section>\n' } })),
        ],
      }),
      () => ({ content: 'finished' }),
    ]);

    const result = await runBuildPhase({
      systemPrompt: 'p',
      messages: [userMsg],
      providerConfig,
      files: makeFiles([
        { path: '/brief.md', content: 'brief' },
        { path: '/design.md', content: 'design' },
        { path: '/slides/01.html', content: '<section>One</section>' },
        { path: '/deck.json', content: '{broken json' },
      ]),
      transport,
    });

    expect(result.status).toBe('ready');
    expect(result.slideCount).toBe(2);
    const deck = result.files.find((f) => f.path === '/deck.json');
    expect(deck).toBeTruthy();
    // valid JSON regenerated with both slides in natural order
    expect(() => JSON.parse(deck!.content)).not.toThrow();
    expect(deck?.content).toContain('"01"');
    expect(deck?.content).toContain('"02"');
  });
});
