import { describe, expect, it } from 'bun:test';
import {
  runPlanPhase,
  resumePlanPhase,
  hasValidPlanFiles,
  runBuildPhase,
  runEditPhase,
  type PlanPhaseResult,
  type PlanPhaseParams,
} from '../../src/services/slidePhases.ts';
import type { APIMessage, MCPTool, ProviderConfig, ToolCall } from '../../src/types/index.ts';
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
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/deck.json', diff: '@@\n+{"title":"Coffee Deck","canvas":"16:9","theme":"/theme.css","slideOrder":["01"]}\n' } })),
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

  it('adds a new slide via create_file and updates deck.json slideOrder', async () => {
    const { transport } = makeTransport([
      () => ({
        content: 'adding slide 02',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/02.html', diff: '@@\n+<section class="slide">\n+  Second\n+</section>\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'update_file', path: '/deck.json', diff: '@@\n-    "01"\n+    "01",\n+    "02"\n' } })),
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
