import { describe, expect, it } from 'bun:test';
import { createSlideAgent, deriveSlideTitle } from '../../src/services/slideOrchestrator.ts';
import type { SlideProject, SlideFile, SlideActivityEvent } from '../../src/types/slides.ts';
import type { ProviderConfig, ToolCall } from '../../src/types/index.ts';
import type { AgentChatResponse } from '../../src/services/agentSession.ts';

const providerConfig: ProviderConfig = {
  providerId: 'custom',
  apiKey: '',
  apiUrl: 'http://localhost',
  model: 'test-model',
  format: 'openai',
  systemPrompt: '',
};

/** Serve skill SKILL.md + references from an in-memory map (no chrome/fetch). */
function makeSkillFetcher() {
  return {
    fetcher: async (url: string) => {
      // URL looks like "skills://skills/slide-creator/plan/SKILL.md" — derive
      // the phase-relative key ("plan/SKILL.md") for lookup.
      const key = url.replace('skills://skills/slide-creator/', '');
      const store: Record<string, string> = {
        'plan/SKILL.md': 'plan skill **refs here** (`references/brief-template.md`)',
        'plan/references/brief-template.md': '# brief template',
        'build/SKILL.md': 'build skill',
        'edit/SKILL.md': 'edit skill',
      };
      const text = store[key];
      if (text === undefined) throw new Error(`not found: ${key}`);
      return text;
    },
  };
}

function toolCall(name: string, args: string): ToolCall {
  return { id: `tc_${Math.random().toString(36).slice(2, 8)}`, name, arguments: args };
}

function builtProject(): SlideProject {
  return {
    id: 'sp_built',
    title: 'Built deck',
    createdAt: 0,
    updatedAt: 0,
    phase: 'plan_ready',
    canvas: '16:9',
    messages: [{ id: 'u1', role: 'user', content: 'my deck', createdAt: 0 }],
    files: [
      { path: '/brief.md', content: '# Coffee deck' },
      { path: '/design.md', content: 'Dark theme' },
    ],
  };
}

type Responder = () => AgentChatResponse;
function makeTransport(respondents: Responder[]) {
  let i = 0;
  const transport = async () => {
    const respond = respondents[Math.min(i, respondents.length - 1)];
    i++;
    return respond();
  };
  return { transport, calls: () => i };
}

/** In-memory host capturing store transitions for assertions. */
function makeHost() {
  let active: SlideProject | null = null;
  let phase: SlideProject['phase'] = 'idle';
  let busy = false;
  let pendingAsk: unknown = null;
  let stoppedCalls = 0;
  const landed: SlideProject[] = [];
  const answered: Array<{ projectId: string; answer: string }> = [];
  const activity: SlideActivityEvent[] = [];
  const streamChunks: Array<{ text?: string; reasoning?: string }> = [];

  const host = {
    getActiveProject: () => active,
    landProject: (p: SlideProject) => {
      active = p;
      landed.push(p);
    },
    setPhase: (ph: SlideProject['phase']) => {
      phase = ph;
    },
    setBusy: (b: boolean) => {
      busy = b;
    },
    setPendingAsk: (pa: unknown) => {
      pendingAsk = pa;
    },
    recordAnswer: (projectId: string, answer: string) => {
      answered.push({ projectId, answer });
    },
    refreshDeckFromFiles: (_files: SlideFile[]) => {},
    markStopped: () => {
      stoppedCalls++;
      busy = false;
    },
    streamDelta: (delta: { text?: string; reasoning?: string }) => {
      streamChunks.push(delta);
    },
    clearStreaming: () => {},
    pushActivity: (event: SlideActivityEvent) => {
      activity.push(event);
    },
    patchActivity: (id: string, partial: Partial<SlideActivityEvent>) => {
      const idx = activity.findIndex((e) => e.id === id);
      if (idx >= 0) activity[idx] = { ...activity[idx], ...partial, id };
    },
  };

  return {
    host,
    get active() {
      return active;
    },
    get phase() {
      return phase;
    },
    get busy() {
      return busy;
    },
    get pendingAsk() {
      return pendingAsk;
    },
    get landed() {
      return landed;
    },
    get answered() {
      return answered;
    },
    get stoppedCalls() {
      return stoppedCalls;
    },
    get activity() {
      return activity;
    },
    get streamChunks() {
      return streamChunks;
    },
  };
}

describe('createSlideAgent — createFromPrompt → plan (US-024)', () => {
  it('creates a project, starts plan, and reaches plan_ready, keeping the transcript short', async () => {
    const skills = makeSkillFetcher();
    const { transport, calls } = makeTransport([
      () => ({
        content: 'drafting',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee for Teams\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+dark theme\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '4:5' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });

    await agent.createFromPrompt('a coffee deck');

    expect(h.active).not.toBeNull();
    expect(h.active?.messages[0]).toMatchObject({ role: 'user', content: 'a coffee deck' });
    expect(h.phase).toBe('plan_ready');
    expect(h.landed.length).toBeGreaterThan(0);
    // brief/design landed on the project VFS
    const files = h.active!.files;
    expect(files.some((f) => f.path === '/brief.md')).toBe(true);
    expect(files.some((f) => f.path === '/design.md')).toBe(true);
    // canvas from submit_plan adopted
    expect(h.active?.canvas).toBe('4:5');
    // transcript: user msg + model final text (no tool chatter)
    const roles = h.active!.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('assistant');
    expect(h.active!.messages.some((m) => m.role === 'assistant' && m.content === 'Plan complete.')).toBe(true);
    expect(h.active!.messages.length).toBeLessThanOrEqual(3);
    // tool calls are NOT copied into the main transcript
    expect(h.active!.messages.some((m) => Array.isArray((m as unknown as { toolCalls?: unknown }).toolCalls))).toBe(false);
    // plan skill + its references were loaded for the session
    expect(calls()).toBe(3);
  });

  it('forwards deps.toolOptions.mcpTools into the plan session tool list (US-029)', async () => {
    const skills = makeSkillFetcher();
    const offeredNames: string[][] = [];
    const transport = async (request: {
      tools: { name: string }[];
    }) => {
      offeredNames.push(request.tools.map((t) => t.name));
      return { content: 'done.' } as AgentChatResponse;
    };

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      toolOptions: {
        enableGoogleSearch: true,
        mcpTools: [{ name: 'slack_post', description: 'x', inputSchema: { type: 'object', properties: {} } }],
        externalTool: async () => ({ content: 'ok' }),
      },
    });

    await agent.createFromPrompt('a deck');

    const first = offeredNames[0];
    expect(first).toContain('slack_post');
    expect(first).toContain('apply_patch');
    expect(first).toContain('google_search');
  });

  it('suspends with a pending ask on an ask tool call, then records the answer', async () => {
    const skills = makeSkillFetcher();    const { transport } = makeTransport([
      () => ({
        toolCalls: [toolCall('ask', JSON.stringify({ question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' }))],
      }),
    ]);

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.createFromPrompt('a deck');

    expect(h.pendingAsk).not.toBeNull();
    expect(h.active?.pendingAsk?.payload.field).toBe('canvas');
    expect(h.active?.phase).toBe('plan'); // phase unchanged, waiting on user
  });

  it('surfaces an error message in the transcript when planning fails', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([() => ({ error: 'API key is required.' })]);

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.createFromPrompt('a deck');

    expect(h.phase).toBe('error');
    expect(h.active?.messages.some((m) => m.role === 'error' && m.content.includes('API key'))).toBe(true);
  });
});

describe('createSlideAgent — build + follow-up (US-024)', () => {
  it('runs build to ready and refreshes the deck files onto the project', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>Hello</section>\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/deck.json', diff: '@@\n+{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}\n' } })),
        ],
      }),
      () => ({ content: 'Deck complete.' }),
    ]);

    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();

    expect(h.phase).toBe('ready');
    expect(h.active?.files.some((f) => f.path === '/slides/01.html')).toBe(true);
    expect(h.active?.messages.some((m) => m.role === 'assistant' && m.content === 'Deck complete.')).toBe(true);
  });

  it('refuses to build when brief/design are missing', async () => {
    const skills = makeSkillFetcher();
    let calls = 0;
    const transport = async () => {
      calls++;
      return { content: 'should not run' } as AgentChatResponse;
    };

    const h = makeHost();
    // project with no plan files at all
    h.host.landProject({
      ...builtProject(),
      files: [],
    });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();
    expect(calls).toBe(0); // no model round was attempted
    expect(h.phase).toBe('idle'); // never transitioned to build
  });

  it('routes a follow-up message to the edit phase and lands the updated deck', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: 'editing',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>Edited</section>\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/deck.json', diff: '@@\n+{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}\n' } })),
        ],
      }),
      () => ({ content: 'Edited.' }),
    ]);

    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.sendFollowUp('make the first slide bolder');

    expect(h.phase).toBe('ready');
    // the follow-up request was recorded in the main transcript
    const userFollowUps = h.active!.messages.filter((m) => m.role === 'user' && m.content === 'make the first slide bolder');
    expect(userFollowUps.length).toBe(1);
    expect(h.active?.files.some((f) => f.path === '/slides/01.html')).toBe(true);
    expect(h.active?.messages.some((m) => m.role === 'assistant' && m.content === 'Edited.')).toBe(true);
  });

  it('lands the full model summary as assistant and emits activity for tools/files', async () => {
    const skills = makeSkillFetcher();
    const longSummary =
      'The font change is applied. Plus Jakarta Sans and Lora load from Google Fonts via @import.';
    const { transport } = makeTransport([
      () => ({
        content: 'patching theme',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'update_file',
                path: '/theme.css',
                diff: '@@\n+@import url("https://fonts.googleapis.com");\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: longSummary }),
    ]);

    const h = makeHost();
    h.host.landProject({
      ...builtProject(),
      phase: 'ready',
      files: [
        ...builtProject().files,
        { path: '/theme.css', content: ':root{--sans:Inter}' },
        {
          path: '/deck.json',
          content: JSON.stringify({ title: 'Coffee', canvas: '16:9', slideOrder: ['01'] }),
        },
        { path: '/slides/01.html', content: '<section>Hi</section>' },
      ],
    });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.sendFollowUp('change fonts to jakarta sans');

    const assistant = h.active!.messages.filter((m) => m.role === 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0].content).toBe(longSummary);
    expect(h.active!.messages.some((m) => m.role === 'summary')).toBe(false);

    // Activity feed still received phase/tool/file events (UI store preserves them on land).
    expect(h.activity.some((e) => e.type === 'phase_started' && e.phase === 'edit')).toBe(true);
    expect(h.activity.some((e) => e.type === 'tool_started' && e.toolName === 'apply_patch')).toBe(
      true,
    );
    expect(h.activity.some((e) => e.type === 'file_written' && e.path === '/theme.css')).toBe(true);
    expect(h.activity.some((e) => e.type === 'phase_completed' && e.phase === 'edit')).toBe(true);
  });

  it('falls back to a short summary when the model returns empty final text', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: '',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/slides/01.html',
                diff: '@@\n+<section>Hi</section>\n',
              },
            }),
          ),
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/deck.json',
                diff: '@@\n+{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: '   ' }),
    ]);

    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.sendFollowUp('nudge');

    expect(h.active?.messages.some((m) => m.role === 'summary' && m.content === 'Deck updated.')).toBe(
      true,
    );
    expect(h.active?.messages.some((m) => m.role === 'assistant')).toBe(false);
  });

  it('lands build final text as assistant instead of Deck built hardcode', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/slides/01.html',
                diff: '@@\n+<section>Hello</section>\n',
              },
            }),
          ),
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/deck.json',
                diff: '@@\n+{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: 'Built 1 slide on 16:9 with the approved design system.' }),
    ]);

    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();

    expect(
      h.active?.messages.some(
        (m) =>
          m.role === 'assistant' &&
          m.content === 'Built 1 slide on 16:9 with the approved design system.',
      ),
    ).toBe(true);
    expect(h.active?.messages.some((m) => m.role === 'summary' && /Deck built/.test(m.content))).toBe(
      false,
    );
    expect(h.activity.some((e) => e.type === 'file_written')).toBe(true);
  });
});

describe('deriveSlideTitle', () => {
  it('derives a short title and caps whitespace + length', () => {
    expect(deriveSlideTitle('  build   a coffee deck  ')).toBe('build a coffee deck');
    expect(deriveSlideTitle('   ')).toBe('Untitled deck');
    expect(deriveSlideTitle('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('createSlideAgent — stop generation (US-027)', () => {
  it('aborts the in-flight plan, clears busy + pendingAsk, and keeps partial files', async () => {
    const skills = makeSkillFetcher();
    // Round 1 lands a real patch (brief.md). Round 2 is parked until we release
    // it, so agent.stop() fires while a subsequent model request is in flight.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let round = 0;
    const transport = async (): Promise<AgentChatResponse> => {
      round++;
      if (round === 1) {
        return {
          content: 'drafting',
          toolCalls: [
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee\n' } })),
          ],
        };
      }
      await gate;
      return { content: 'still going' };
    };

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      // stop() now aborts the in-flight stream via abortRequest (US-035); stub it
      // so the test never touches chrome.
      abortRequest: () => {},
    });

    const pending = agent.createFromPrompt('a plan');
    // Give the runner time to run round 1 (landing brief.md) and park in round 2.
    await new Promise((r) => setTimeout(r, 5));

    agent.stop();
    release();
    await pending;

    // Stop clears busy + narrates in the transcript.
    expect(h.stoppedCalls).toBeGreaterThanOrEqual(1);
    expect(h.busy).toBe(false);
    expect(h.pendingAsk).toBeNull();
    // The cancelled branch persisted the partial VFS (brief.md survived).
    expect(h.active?.files.some((f) => f.path === '/brief.md')).toBe(true);
    expect(h.active?.stopped).toBe(true);
    expect(h.active?.messages.some((m) => m.role === 'summary' && /stopped/i.test(m.content))).toBe(true);
  });

  it('stop clears a suspended pending ask without a running session', () => {
    const skills = makeSkillFetcher();
    const h = makeHost();
    h.host.landProject({
      ...builtProject(),
      pendingAsk: {
        id: 'ask_1',
        toolCallId: 'tc_1',
        sessionRef: 'plan',
        createdAt: 0,
        payload: { question: 'Canvas?', field: 'canvas' },
      },
    });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport: async () => ({ content: 'unused' }),
      skillFetcher: skills.fetcher,
    });

    agent.stop();

    expect(h.stoppedCalls).toBeGreaterThanOrEqual(1);
    expect(h.busy).toBe(false);
    expect(h.active?.stopped).toBe(true);
    expect(h.active?.pendingAsk).toBeUndefined();
  });
});

describe('createSlideAgent — non-function-calling model guard (US-032)', () => {
  it('blocks createFromPrompt with a clear error instead of hanging', async () => {
    const skills = makeSkillFetcher();
    let transportCalled = false;
    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport: async () => {
        transportCalled = true;
        return { content: 'unused' };
      },
      skillFetcher: skills.fetcher,
      canFunctionCall: () => false,
    });

    await agent.createFromPrompt('a deck');

    // No model round-trip happened — no silent hang.
    expect(transportCalled).toBe(false);
    // A project was created with the user message + a clear error narration.
    expect(h.active).not.toBeNull();
    expect(h.active?.phase).toBe('error');
    expect(
      h.active?.messages.some((m) => m.role === 'error' && /function calling/i.test(m.content))
    ).toBe(true);
    expect(h.busy).toBe(false);
  });

  it('blocks runBuild with a clear error on an active project', async () => {
    const skills = makeSkillFetcher();
    let transportCalled = false;
    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport: async () => {
        transportCalled = true;
        return { content: 'unused' };
      },
      skillFetcher: skills.fetcher,
      canFunctionCall: () => false,
    });

    await agent.runBuild();

    expect(transportCalled).toBe(false);
    expect(h.active?.phase).toBe('error');
    expect(
      h.active?.messages.some((m) => m.role === 'error' && /function calling/i.test(m.content))
    ).toBe(true);
  });

  it('blocks sendFollowUp with a clear error on an active project', async () => {
    const skills = makeSkillFetcher();
    let transportCalled = false;
    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport: async () => {
        transportCalled = true;
        return { content: 'unused' };
      },
      skillFetcher: skills.fetcher,
      canFunctionCall: () => false,
    });

    await agent.sendFollowUp('make it bigger');

    expect(transportCalled).toBe(false);
    expect(h.active?.phase).toBe('error');
    expect(
      h.active?.messages.some((m) => m.role === 'error' && /function calling/i.test(m.content))
    ).toBe(true);
  });

  it('exposes canUseFunctionCalling from the injected dep', () => {
    const skills = makeSkillFetcher();
    const h = makeHost();
    const supported = createSlideAgent(h.host, {
      providerConfig,
      skillFetcher: skills.fetcher,
      canFunctionCall: () => true,
    });
    const blocked = createSlideAgent(h.host, {
      providerConfig,
      skillFetcher: skills.fetcher,
      canFunctionCall: () => false,
    });
    expect(supported.canUseFunctionCalling()).toBe(true);
    expect(blocked.canUseFunctionCalling()).toBe(false);
  });

  it('defaults to the pure provider check when canFunctionCall is not injected', () => {
    const skills = makeSkillFetcher();
    const h = makeHost();
    // 'test-model' on a non-Gemini ('custom') provider → function calling enabled.
    const agent = createSlideAgent(h.host, {
      providerConfig,
      skillFetcher: skills.fetcher,
    });
    expect(agent.canUseFunctionCalling()).toBe(true);
  });
});

describe('createSlideAgent — streaming lifecycle (US-035)', () => {
  it('clears streaming at phase start and again when a plan suspends on an ask', async () => {
    const skills = makeSkillFetcher();
    const h = makeHost();
    let clears = 0;
    h.host.clearStreaming = () => { clears++; };

    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport: async () => ({
        content: 'drafting',
        toolCalls: [toolCall('ask', JSON.stringify({ question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' }))],
      }) as AgentChatResponse,
      skillFetcher: skills.fetcher,
    });

    await agent.createFromPrompt('a deck');

    // The plan suspends on the ask...
    expect(h.pendingAsk).not.toBeNull();
    expect(h.active?.phase).toBe('plan');
    // clearStreaming ran at phase start (prepareStream) AND on the waiting_user
    // branch so leftover turn text never sticks in the rail.
    expect(clears).toBeGreaterThanOrEqual(2);
  });
});


