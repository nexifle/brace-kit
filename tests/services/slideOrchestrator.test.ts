import { describe, expect, it } from 'bun:test';
import {
  buildPlanSessionMessages,
  createSlideAgent,
  deriveSlideTitle,
} from '../../src/services/slideOrchestrator.ts';
import type {
  SlideActivityEvent,
  SlideAskPayload,
  SlideMainMessage,
  SlidePendingAsk,
  SlideProject,
  SlideFile,
} from '../../src/types/slides.ts';
import type { APIMessage, ProviderConfig, ToolCall } from '../../src/types/index.ts';
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
        'plan/SKILL.md':
          '---\nname: slide-creator-plan\ndescription: Plan skill.\n---\nplan skill **refs here** (`references/brief-template.md`)',
        'plan/references/brief-template.md': '# brief template\nSECRET_PALETTE_BODY',
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
    mode: 'plan',
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
  const seenProviders: ProviderConfig[] = [];
  const seenMessages: APIMessage[][] = [];
  const transport = async (msg: {
    providerConfig?: ProviderConfig;
    messages?: APIMessage[];
  }) => {
    if (msg.providerConfig) seenProviders.push(msg.providerConfig);
    if (msg.messages) seenMessages.push(msg.messages);
    const respond = respondents[Math.min(i, respondents.length - 1)];
    i++;
    return respond();
  };
  return { transport, calls: () => i, seenProviders, seenMessages };
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
  const rounds: Array<{ files: SlideFile[]; label: string }> = [];

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
      // Mirror the real store's answerAsk: append an ask message (question +
      // answer) to the active project so landProject spreads don't drop it.
      if (active && active.id === projectId) {
        const pending = pendingAsk as
          | (SlidePendingAsk & { payload?: SlideAskPayload })
          | null;
        const askMsg: SlideMainMessage = {
          id: `askans_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          role: 'ask',
          content: answer,
          ...(pending?.payload?.questions
            ? { ask: { questions: pending.payload.questions } }
            : {}),
          createdAt: Date.now(),
        };
        active = {
          ...active,
          pendingAsk: undefined,
          messages: [...active.messages, askMsg],
        };
      }
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
    getActivity: () => activity,
    recordRound: (files: SlideFile[], label: string) => {
      rounds.push({ files, label });
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
    get rounds() {
      return rounds;
    },
  };
}

describe('createSlideAgent — createFromPrompt → plan (US-024)', () => {
  it('creates a project, starts plan, and reaches plan_ready, keeping the transcript short', async () => {
    const skills = makeSkillFetcher();
    const { transport, calls, seenMessages } = makeTransport([
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
    expect(calls()).toBe(3);
    const sys = seenMessages[0]?.find((m) => m.role === 'system')?.content ?? '';
    expect(sys).toContain('Skill catalog');
    expect(sys).toContain('references/brief-template.md');
    expect(sys).not.toContain('SECRET_PALETTE_BODY');
    expect(sys).not.toContain('plan skill **refs here**');
  });

  it('fires generateTitle once after the first plan completes', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
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
    const titled: string[] = [];
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
      generateTitle: (id) => titled.push(id),
    });

    await agent.createFromPrompt('a coffee deck');

    expect(h.phase).toBe('plan_ready');
    // Fired exactly once, for the just-landed project (gate: !autoTitled).
    expect(titled).toEqual([h.active!.id]);
  });

  it('skips generateTitle when the project is already autoTitled', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: 'revising',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'update_file',
                path: '/brief.md',
                diff: '@@\n-# Coffee deck\n+# Coffee deck — 12 slides\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: 'Revised plan ready.' }),
    ]);

    const h = makeHost();
    // plan_ready with plan files only — no built deck yet. Already auto-titled
    // (e.g. by a prior plan round), so a re-plan must NOT fire generateTitle.
    h.host.landProject({ ...builtProject(), autoTitled: true });

    const titled: string[] = [];
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
      generateTitle: (id) => titled.push(id),
    });

    await agent.sendFollowUp('make it 12 slides instead of 8');

    expect(h.phase).toBe('plan_ready');
    expect(titled).toEqual([]);
  });

  it('preserves the auto-title when the build lands after the title write (agent-mode race)', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      // plan round 1
      () => ({
        content: 'drafting',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+brief\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+design\n' } })),
          toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' })),
        ],
      }),
      // plan final text
      () => ({ content: 'Plan complete.' }),
      // build round 1 — yield to the macrotask queue first so the deferred
      // title write (scheduled by generateTitle) lands mid-build, AFTER runBuild
      // captured the provisional snapshot but BEFORE this round's landing.
      async () => {
        await new Promise((r) => setTimeout(r, 0));
        return {
          content: 'building',
          toolCalls: [
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>Hi</section>\n' } })),
            toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/deck.json', diff: '@@\n+{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}\n' } })),
          ],
        };
      },
      // build final text
      () => ({ content: 'Deck complete.' }),
    ]);

    const h = makeHost();
    const titled: string[] = [];
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
      generateTitle: (id) => {
        titled.push(id);
        // Simulate the real hook's async write landing mid-build (after runBuild
        // captured the provisional snapshot, before the build lands).
        setTimeout(() => {
          const active = h.host.getActiveProject();
          if (active && active.id === id) {
            h.host.landProject({ ...active, title: 'Coffee Teams', autoTitled: true });
          }
        }, 0);
      },
    });

    await agent.createFromPrompt('a deck', 'agent');

    // The build landed AFTER the title write — it must not revert the title or
    // reset autoTitled from the stale start-of-build snapshot.
    expect(h.phase).toBe('ready');
    expect(titled).toEqual([h.active!.id]);
    expect(h.active?.title).toBe('Coffee Teams');
    expect(h.active?.autoTitled).toBe(true);
  });

  it('createFromPrompt applies the passed mode to the new project (defaults to plan)', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: 'planning',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+brief\n' } }),
          ),
          toolCall(
            'apply_patch',
            JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+design\n' } }),
          ),
          toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' })),
        ],
      }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    // Explicit agent mode → new project carries it.
    await agent.createFromPrompt('a deck', 'agent');
    expect(h.active?.mode).toBe('agent');

    // Fresh agent, no mode arg → defaults to plan.
    const h2 = makeHost();
    const agent2 = createSlideAgent(h2.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });
    await agent2.createFromPrompt('another deck');
    expect(h2.active?.mode).toBe('plan');
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

  it('forwards enableGrokWebSearch into the plan session tool list', async () => {
    const skills = makeSkillFetcher();
    const offeredNames: string[][] = [];
    const transport = async (request: { tools: { name: string }[] }) => {
      offeredNames.push(request.tools.map((t) => t.name));
      return { content: 'done.' } as AgentChatResponse;
    };

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      toolOptions: { enableGrokWebSearch: true },
    });

    await agent.createFromPrompt('a deck');

    const first = offeredNames[0];
    expect(first).toContain('web_search');
    expect(first[first.length - 1]).toBe('web_search');
    expect(first).toContain('submit_plan');
  });

  it('reads getToolOptions at request time so a late Grok enablement is not frozen', async () => {
    const skills = makeSkillFetcher();
    const offeredNames: string[][] = [];
    const transport = async (request: { tools: { name: string }[] }) => {
      offeredNames.push(request.tools.map((t) => t.name));
      return { content: 'done.' } as AgentChatResponse;
    };

    const live: { enableGrokWebSearch?: boolean } = {};
    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      toolOptions: live,
      getToolOptions: () => live,
    });

    live.enableGrokWebSearch = true;
    await agent.createFromPrompt('a deck');

    expect(offeredNames[0]).toContain('web_search');
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
    expect(h.active?.pendingAsk?.payload.questions[0].field).toBe('canvas');
    expect(h.active?.phase).toBe('plan'); // phase unchanged, waiting on user
  });

  it('surfaces plan done after answerAsk when files are still incomplete', async () => {
    // answerAsk used to ignore status=done (activity failed, transcript silent).
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        toolCalls: [
          toolCall(
            'ask',
            JSON.stringify({
              question: 'Canvas?',
              options: ['16:9', '4:5'],
              field: 'canvas',
            }),
          ),
        ],
      }),
      // After answer: model ends without writing brief/design
      () => ({ content: 'Still missing the brief.' }),
    ]);

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.createFromPrompt('a deck');
    expect(h.pendingAsk).not.toBeNull();
    const projectId = h.active?.id;
    expect(projectId).toBeTruthy();

    await agent.answerAsk(projectId!, '16:9');

    expect(h.phase).toBe('plan');
    expect(h.pendingAsk).toBeNull();
    // Model prose may appear as assistant; error line is always canonical.
    expect(
      h.active?.messages.some(
        (m) => m.role === 'assistant' && m.content === 'Still missing the brief.',
      ),
    ).toBe(true);
    expect(
      h.active?.messages.some(
        (m) =>
          m.role === 'error' &&
          m.content.includes('without a complete brief and design'),
      ),
    ).toBe(true);
    expect(h.activity.some((e) => e.type === 'phase_failed')).toBe(true);
    // The answered ask (question + answer) must survive the resumed session's
    // landProject — it used to be dropped by the stale pre-answer snapshot.
    expect(
      h.active?.messages.some(
        (m) =>
          m.role === 'ask' &&
          m.content === '16:9' &&
          m.ask?.questions[0]?.text === 'Canvas?',
      ),
    ).toBe(true);
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

    // A completed build commits exactly one round checkpoint with the landed files.
    expect(h.rounds).toHaveLength(1);
    expect(h.rounds[0].files).toEqual(h.active?.files);
    expect(h.rounds[0].label).toContain('Deck built');
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

    await agent.sendFollowUp('make the first slide bolder');

    expect(h.phase).toBe('ready');
    // the follow-up request was recorded in the main transcript
    const userFollowUps = h.active!.messages.filter((m) => m.role === 'user' && m.content === 'make the first slide bolder');
    expect(userFollowUps.length).toBe(1);
    expect(h.active?.files.some((f) => f.path === '/slides/01.html')).toBe(true);
    expect(h.active?.messages.some((m) => m.role === 'assistant' && m.content === 'Edited.')).toBe(true);

    // A completed edit commits one round checkpoint labeled with the follow-up prompt.
    expect(h.rounds).toHaveLength(1);
    expect(h.rounds[0].files).toEqual(h.active?.files);
    expect(h.rounds[0].label).toBe('make the first slide bolder');
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

  it('auto-generates deck.json when the agent builds HTML without writing it', async () => {
    // Code ownership: the agent writes only slide files; the harness derives
    // deck.json (slideOrder = the slide ids), so the deck is ready.
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({
        content: 'writing slides',
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
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/slides/02.html',
                diff: '@@\n+<section>Two</section>\n',
              },
            }),
          ),
          // intentionally no /deck.json — the harness generates it
        ],
      }),
      () => ({ content: 'Deck built with 2 slides.' }),
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
    const deck = h.active?.files.find((f) => f.path === '/deck.json');
    expect(deck).toBeTruthy();
    expect(deck?.content).toContain('"01"');
    expect(deck?.content).toContain('"02"');
    expect(
      h.active?.messages.some(
        (m) => m.role === 'assistant' && m.content === 'Deck built with 2 slides.',
      ),
    ).toBe(true);
  });

  it('surfaces the specific deck.json contract violation instead of the generic no-deliverable copy', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      () => ({ content: 'Deck built.' }),
    ]);

    const h = makeHost();
    // Pre-seed a hard-invalid deck.json (inherited / not rewritten this run) so the
    // terminal gate surfaces the specific reason to the user.
    h.host.landProject({
      ...builtProject(),
      files: [
        ...builtProject().files,
        { path: '/slides/01.html', content: '<section>One</section>' },
        { path: '/deck.json', content: '{"title":"T","canvas":"16_9","slideOrder":["01"]}' },
      ],
    });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();

    expect(h.phase).toBe('error');
    // The specific reason is surfaced, not the generic no-deliverable copy.
    expect(
      h.active?.messages.some(
        (m) => m.role === 'error' && m.content.includes('without producing a renderable deck'),
      ),
    ).toBe(false);
    expect(
      h.active?.messages.some(
        (m) => m.role === 'error' && m.content.includes('canvas') && m.content.includes('16_9'),
      ),
    ).toBe(true);
  });

  it('runs ONE corrective build round with an error_context turn when the deck fails verification', async () => {
    const skills = makeSkillFetcher();
    // Phase 1: build a slide with a forbidden <script> → verifyDeck fails.
    // Phase 2 (corrective): remove the script. Each phase = 2 model turns.
    const { transport, calls, seenMessages } = makeTransport([
      // phase 1, round 1
      () => ({
        content: 'building',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/slides/01.html',
                diff: '@@\n+<section>One</section>\n+<script>alert(1)</script>\n',
              },
            }),
          ),
        ],
      }),
      // phase 1, round 2 (stop)
      () => ({ content: 'Deck built.', toolCalls: [] }),
      // corrective round (phase 2), round 1
      () => ({
        content: 'fixing',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'update_file',
                path: '/slides/01.html',
                diff: '@@\n-<script>alert(1)</script>\n',
              },
            }),
          ),
        ],
      }),
      // corrective round (phase 2), round 2 (stop)
      () => ({ content: 'Fixed 01.', toolCalls: [] }),
    ]);

    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();

    expect(calls()).toBe(4); // 2 rounds per phase × 2 phases (initial + corrective)
    // The corrective round's messages carry an error_context user turn naming the issue.
    const correctiveMessages = seenMessages[2] ?? [];
    expect(
      correctiveMessages.some(
        (m) => m.role === 'user' && m.content.includes('[verification]') && m.content.includes('script'),
      ),
    ).toBe(true);
    // The corrective round started from the just-produced files (script removed).
    expect(h.phase).toBe('ready');
    expect(h.active?.files.find((f) => f.path === '/slides/01.html')?.content.includes('<script')).toBe(false);
    expect(h.active?.messages.some((m) => m.role === 'assistant' && m.content === 'Fixed 01.')).toBe(true);
  });

  it('does NOT run a third round when the corrective round still fails verification (cap of 1)', async () => {
    const skills = makeSkillFetcher();
    // Phase 1: build a slide with a forbidden <script>. Phase 2 (corrective):
    // produces nothing new, so the deck still fails verifyDeck — and must NOT
    // trigger a third round.
    const { transport, calls } = makeTransport([
      // phase 1, round 1
      () => ({
        content: 'building',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/slides/01.html',
                diff: '@@\n+<section>One</section>\n+<script>alert(1)</script>\n',
              },
            }),
          ),
        ],
      }),
      // phase 1, round 2 (stop)
      () => ({ content: 'Deck built.', toolCalls: [] }),
      // corrective round (phase 2), no new output → script still present
      () => ({ content: 'Deck built again.', toolCalls: [] }),
    ]);

    const h = makeHost();
    h.host.landProject(builtProject());
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();

    expect(calls()).toBe(3); // initial phase (2) + corrective phase (1) — no third phase
    // Surfaces the verification failure with the specific forbidden script.
    expect(
      h.active?.messages.some(
        (m) => m.role === 'error' && m.content.includes('failed verification') && m.content.includes('script'),
      ),
    ).toBe(true);
  });

  it('continues the prior edit-session context across follow-ups (Phase 4)', async () => {
    const skills = makeSkillFetcher();
    const prior: APIMessage[] = [
      { role: 'user', content: 'make the title font bold' },
      { role: 'assistant', content: 'Bolded the title.' },
    ];
    const { transport, seenMessages } = makeTransport([
      () => ({ content: 'Reverted the bold.', toolCalls: [] }),
    ]);

    const h = makeHost();
    h.host.landProject({
      ...builtProject(),
      phase: 'ready',
      mode: 'plan',
      editTranscript: prior,
      files: [
        ...builtProject().files,
        { path: '/theme.css', content: ':root{}' },
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

    await agent.sendFollowUp('I did not like that');

    // The edit session starts from the system prompt + prior edit transcript + the
// new message — so the model sees what the previous follow-up changed. (The
// agent loop appends the model's reply to the same array; assert the segment
// after the injected system message.)
    const firstMessages = seenMessages[0] ?? [];
    expect(firstMessages[1]?.role).toBe('user');
    expect(firstMessages.slice(1, prior.length + 2)).toEqual([
      ...prior,
      { role: 'user', content: 'I did not like that' },
    ]);
    // The completed edit lands a fresh editTranscript on the project.
    expect(h.active?.editTranscript).toBeDefined();
  });

  it('strips leftover vision parts on edit follow-up when switching to a non-vision model', async () => {
    const skills = makeSkillFetcher();
    const prior: APIMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'use the logo' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,SMALL' } },
        ],
      },
      { role: 'assistant', content: 'Placed the logo.' },
    ];
    const { transport, seenMessages } = makeTransport([
      () => ({ content: 'Tweaked placement.', toolCalls: [] }),
    ]);

    const h = makeHost();
    h.host.landProject({
      ...builtProject(),
      phase: 'ready',
      mode: 'agent',
      editTranscript: prior,
      files: [
        ...builtProject().files,
        { path: '/uploads/logo.png', content: 'data:image/png;base64,ORIGINAL' },
        { path: '/theme.css', content: ':root{}' },
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
      canSendImageParts: () => false,
    });

    await agent.sendFollowUp('make it bigger');

    const firstMessages = seenMessages[0] ?? [];
    const wire = JSON.stringify(firstMessages);
    expect(wire).not.toContain('image_url');
    expect(wire).not.toContain('data:image');
    expect(wire).toContain('/uploads/logo.png');
    expect(wire).toContain('make it bigger');
  });

  it('starts a fresh edit session with a single message when there is no prior edit context', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({ content: 'Done.', toolCalls: [] }),
    ]);

    const h = makeHost();
    h.host.landProject({
      ...builtProject(),
      phase: 'ready',
      mode: 'plan',
      files: [
        ...builtProject().files,
        { path: '/theme.css', content: ':root{}' },
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

    await agent.sendFollowUp('first follow-up');

    const firstMessages = seenMessages[0] ?? [];
    // No prior edit context: the first user message (after the injected system
    // prompt) is the new follow-up, and no prior-edit content leaked in.
    expect(firstMessages[1]).toEqual({ role: 'user', content: 'first follow-up' });
    expect(firstMessages.some((m) => m.content === 'make the title font bold')).toBe(false);
  });

  it('resumes a stopped build with its prior context instead of a blank edit', async () => {
    const skills = makeSkillFetcher();
    const prior: APIMessage[] = [
      { role: 'user', content: 'Build the deck from the approved brief and design.' },
      { role: 'assistant', content: 'Drafting slide 1.' },
    ];
    const { transport, seenMessages } = makeTransport([
      () => ({ content: 'Continuing the build.', toolCalls: [] }),
    ]);

    const h = makeHost();
    // A stopped build: phase stays 'build', mode already 'agent' (forced by the
    // original runBuild), plan files valid, with the stopped build's transcript.
    h.host.landProject({
      ...builtProject(),
      phase: 'build',
      mode: 'agent',
      stopped: true,
      buildTranscript: prior,
      files: [
        ...builtProject().files,
        { path: '/theme.css', content: ':root{}' },
        {
          path: '/deck.json',
          content: '{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}',
        },
        { path: '/slides/01.html', content: '<section>Hi</section>' },
      ],
    });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.sendFollowUp('make the title bolder');

    // The resumed build session starts from the injected system prompt + prior
    // build transcript + the new message — the model continues where it stopped.
    const firstMessages = seenMessages[0] ?? [];
    expect(firstMessages[1]?.role).toBe('user');
    expect(firstMessages.slice(1, prior.length + 2)).toEqual([
      ...prior,
      { role: 'user', content: 'make the title bolder' },
    ]);
    // The resumed build lands a fresh buildTranscript on the project.
    expect(h.active?.buildTranscript).toBeDefined();
    expect(h.active?.phase).toBe('ready');
  });

  it('flips the project mode to agent when the user clicks Build', async () => {
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
                diff: '@@\n+{"title":"Coffee","canvas":"16:9","theme":"/theme.css","slideOrder":["01"]}\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: 'Built.', toolCalls: [] }),
    ]);

    const h = makeHost();
    // A plan-mode project (mode 'plan', plan_ready) — the user clicks Build.
    h.host.landProject({ ...builtProject(), mode: 'plan' });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.runBuild();

    // The landed project reflects agent mode (execution), so the toggle shows Agent.
    expect(h.active?.mode).toBe('agent');
  });

it('surfaces verification issues on a truncated edit whose deck fails verification', async () => {
    const skills = makeSkillFetcher();
    // Single tool call per round + maxRounds 1 → the edit truncates. The patch
    // makes deck.json reference a dangling id (02 with no 02.html) → verifyDeck
    // fails, so the truncated branch must surface the specific issues (not the
    // generic max-rounds copy).
    const { transport } = makeTransport([
      () => ({
        content: 'editing',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'update_file',
                path: '/slides/01.html',
                diff: '@@\n <section>Hi</section>\n+<script>alert(1)</script>\n',
              },
            }),
          ),
        ],
      }),
    ]);

    const h = makeHost();
    h.host.landProject({
      ...builtProject(),
      phase: 'ready',
      mode: 'plan',
      files: [
        ...builtProject().files,
        { path: '/theme.css', content: ':root{}' },
        {
          path: '/deck.json',
          content: '{"title":"Coffee","canvas":"16:9","slideOrder":["01"]}',
        },
        { path: '/slides/01.html', content: '<section>Hi</section>' },
      ],
    });
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 1,
    });

    await agent.sendFollowUp('add a slide');

    // Truncated edit + failed verification → surfaces the specific forbidden
    // script, not the generic max-rounds copy.
    expect(
      h.active?.messages.some(
        (m) =>
          m.role === 'error' &&
          m.content.includes('failed verification') &&
          m.content.includes('script'),
      ),
    ).toBe(true);
    expect(h.activity.some((e) => e.type === 'phase_failed')).toBe(true);
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
        payload: { questions: [{ id: 'q1', text: 'Canvas?', field: 'canvas' }] },
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

describe('createSlideAgent — continue after failed plan resumes plan', () => {
  it('sendFollowUp re-runs plan with original deck prompt in session messages', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenProviders, seenMessages } = makeTransport([
      () => ({
        content: 'retrying plan',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+brief\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+design\n' } })),
          toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' })),
        ],
      }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const h = makeHost();
    // Simulate a project after a plan-phase API error: no plan files, phase error.
    h.host.landProject({
      id: 'sp_failed_plan',
      title: 'Coffee',
      createdAt: 0,
      updatedAt: 0,
      phase: 'error',
      mode: 'plan',
      canvas: null,
      messages: [
        { id: 'u1', role: 'user', content: 'a coffee deck', createdAt: 0 },
        { id: 'e1', role: 'error', content: 'API Error (402): Insufficient Balance', createdAt: 1 },
      ],
      files: [],
    });
    h.host.setPhase('error');

    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });

    await agent.sendFollowUp('continue');

    expect(h.phase).toBe('plan_ready');
    expect(h.active?.files.some((f) => f.path === '/brief.md')).toBe(true);
    expect(h.active?.files.some((f) => f.path === '/design.md')).toBe(true);
    expect(h.active?.messages.some((m) => m.role === 'user' && m.content === 'continue')).toBe(true);
    expect(seenProviders.length).toBeGreaterThan(0);
    // Plan session must include the original deck prompt, not only "continue".
    const firstUserTurns = (seenMessages[0] ?? []).filter((m) => m.role === 'user').map((m) => m.content);
    expect(firstUserTurns).toContain('a coffee deck');
    expect(firstUserTurns).toContain('continue');
  });

  it('retryFailedPhase re-runs plan without adding a continue user turn', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({
        content: 'retrying plan',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+brief\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+design\n' } })),
          toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' })),
        ],
      }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const h = makeHost();
    h.host.landProject({
      id: 'sp_failed_plan',
      title: 'Coffee',
      createdAt: 0,
      updatedAt: 0,
      phase: 'error',
      mode: 'plan',
      canvas: null,
      messages: [
        { id: 'u1', role: 'user', content: 'a coffee deck for instagram', createdAt: 0 },
        { id: 'e1', role: 'error', content: 'API Error (402): Insufficient Balance', createdAt: 1 },
      ],
      files: [],
    });
    h.host.setPhase('error');

    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });

    await agent.retryFailedPhase();

    expect(h.phase).toBe('plan_ready');
    // No synthetic "continue"/"retry" user bubble.
    expect(h.active?.messages.filter((m) => m.role === 'user').map((m) => m.content)).toEqual([
      'a coffee deck for instagram',
    ]);
    const firstUserTurns = (seenMessages[0] ?? []).filter((m) => m.role === 'user').map((m) => m.content);
    expect(firstUserTurns).toEqual(['a coffee deck for instagram']);
  });

  it('Continue after max-round build failure re-runs build without a user turn', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
      // Continue/retry build produces a full deck
      () => ({
        content: 'finishing',
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
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'create_file',
                path: '/deck.json',
                diff: '@@\n+{"title":"T","canvas":"16:9","slideOrder":["01"]}\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: 'Deck complete.' }),
    ]);

    const h = makeHost();
    // Partial deck after a truncated build: plan files exist + 0 slides.
    h.host.landProject({
      ...builtProject(),
      phase: 'error',
      messages: [
        { id: 'u1', role: 'user', content: 'my deck', createdAt: 0 },
        {
          id: 'e1',
          role: 'error',
          content:
            'Hit 24 model rounds with only 1 slide projectable — full deck not finished. Partial work was kept.',
          createdAt: 1,
        },
      ],
    });
    h.host.setPhase('error');
    // Seed activity as the UI would after a max-round phase_failed.
    h.host.pushActivity!({
      id: 'pf',
      type: 'phase_failed',
      status: 'failed',
      ts: 1,
      phase: 'build',
      label:
        'Error: Hit 24 model rounds with only 1 slide projectable — full deck not finished. Partial work was kept.',
    });

    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
    });

    await agent.retryFailedPhase();

    expect(h.phase).toBe('ready');
    expect(h.active?.files.some((f) => f.path === '/slides/01.html')).toBe(true);
    // No synthetic Continue user message.
    expect(h.active?.messages.filter((m) => m.role === 'user')).toHaveLength(1);
  });

  it('buildPlanSessionMessages keeps original prompt and optional extra', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'error',
      mode: 'plan',
      canvas: null,
      messages: [
        { id: 'u1', role: 'user', content: 'deck brief', createdAt: 0 },
        { id: 'e1', role: 'error', content: 'fail', createdAt: 1 },
      ],
      files: [],
    };
    expect(buildPlanSessionMessages(project).map((m) => m.content)).toEqual(['deck brief']);
    expect(buildPlanSessionMessages(project, 'continue').map((m) => m.content)).toEqual([
      'deck brief',
      'continue',
    ]);
  });

  it('buildPlanSessionMessages continues from a persisted planTranscript, appending only the newest user turn', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'plan_ready',
      mode: 'plan',
      canvas: '16:9',
      messages: [
        { id: 'u1', role: 'user', content: 'deck brief', createdAt: 0 },
        { id: 'u2', role: 'user', content: 'make it 12 slides', createdAt: 1 },
      ],
      files: [],
      planTranscript: [
        { role: 'user', content: 'deck brief' },
        { role: 'assistant', content: 'drafting', toolCalls: [] },
        { role: 'tool', toolCallId: 'tc1', name: 'apply_patch', content: 'ok' },
      ],
    };
    const msgs = buildPlanSessionMessages(project);
    // Prior assistant + tool turns are carried over (same context).
    expect(msgs.some((m) => m.role === 'assistant' && m.content === 'drafting')).toBe(true);
    expect(msgs.some((m) => m.role === 'tool' && m.content === 'ok')).toBe(true);
    // Only the newest user turn is appended.
    expect(msgs.map((m) => m.content)).toEqual(['deck brief', 'drafting', 'ok', 'make it 12 slides']);
  });

  it('buildPlanSessionMessages does not duplicate a user turn already at the transcript tail', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'plan_ready',
      mode: 'plan',
      canvas: '16:9',
      messages: [{ id: 'u1', role: 'user', content: 'make it 12 slides', createdAt: 0 }],
      files: [],
      planTranscript: [
        { role: 'user', content: 'deck brief' },
        { role: 'assistant', content: 'drafting', toolCalls: [] },
        { role: 'user', content: 'make it 12 slides' },
      ],
    };
    const msgs = buildPlanSessionMessages(project);
    // The newest user turn already ends the transcript — no duplicate appended.
    expect(msgs.filter((m) => m.role === 'user' && m.content === 'make it 12 slides')).toHaveLength(1);
    expect(msgs.map((m) => m.content)).toEqual(['deck brief', 'drafting', 'make it 12 slides']);
  });

  it('buildPlanSessionMessages restores vision parts when the plan transcript lost image_url', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'plan_ready',
      mode: 'plan',
      canvas: '16:9',
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'logo deck',
          createdAt: 0,
          attachments: [
            {
              id: 'a1',
              type: 'image',
              name: 'logo.png',
              path: '/uploads/logo.png',
              preview: 'data:image/jpeg;base64,SMALL',
            },
          ],
        },
      ],
      files: [{ path: '/uploads/logo.png', content: 'data:image/png;base64,ORIGINAL' }],
      planTranscript: [{ role: 'user', content: 'logo deck' }],
    };
    const msgs = buildPlanSessionMessages(project);
    const user = msgs.find((m) => m.role === 'user');
    expect(Array.isArray(user?.content)).toBe(true);
    const parts = user?.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.some((p) => p.type === 'image_url' && p.image_url?.url === 'data:image/jpeg;base64,SMALL')).toBe(true);
  });

  it('buildPlanSessionMessages strips vision parts when sendImageParts is false', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'plan_ready',
      mode: 'plan',
      canvas: '16:9',
      messages: [
        {
          id: 'u1',
          role: 'user',
          content: 'logo deck',
          createdAt: 0,
          attachments: [
            {
              id: 'a1',
              type: 'image',
              name: 'logo.png',
              path: '/uploads/logo.png',
              preview: 'data:image/jpeg;base64,SMALL',
            },
          ],
        },
      ],
      files: [{ path: '/uploads/logo.png', content: 'data:image/png;base64,ORIGINAL' }],
      planTranscript: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'logo deck' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,SMALL' } },
          ],
        },
      ],
    };
    const msgs = buildPlanSessionMessages(project, undefined, false);
    const user = msgs.find((m) => m.role === 'user');
    expect(typeof user?.content).toBe('string');
    expect(String(user?.content)).not.toContain('data:image');
    expect(String(user?.content)).toContain('/uploads/logo.png');
  });

  it('buildPlanSessionMessages injects workspace upload paths when a non-vision model resumes a deck', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'plan_ready',
      mode: 'plan',
      canvas: '16:9',
      messages: [{ id: 'u1', role: 'user', content: 'logo deck', createdAt: 0 }],
      files: [{ path: '/uploads/logo.png', content: 'data:image/png;base64,ORIGINAL' }],
      planTranscript: [{ role: 'user', content: 'logo deck' }],
    };
    const msgs = buildPlanSessionMessages(project, undefined, false);
    const blob = msgs.map((m) => String(m.content)).join('\n');
    expect(blob).toContain('/uploads/logo.png');
    expect(blob).toContain('cannot view image pixels');
    expect(blob).toContain('if the user asked');
    expect(blob).not.toContain('data:image');
    expect(blob).not.toContain('<img src=');
  });

  it('buildPlanSessionMessages rehydrates only images named on that user turn when switching back to vision', () => {
    const project: SlideProject = {
      id: 'p',
      title: 't',
      createdAt: 0,
      updatedAt: 0,
      phase: 'plan_ready',
      mode: 'plan',
      canvas: '16:9',
      messages: [{ id: 'u1', role: 'user', content: 'see /uploads/logo.png', createdAt: 0 }],
      files: [
        { path: '/uploads/logo.png', content: 'data:image/png;base64,LOGO' },
        { path: '/uploads/other.png', content: 'data:image/png;base64,OTHER' },
      ],
      planTranscript: [{ role: 'user', content: 'see /uploads/logo.png' }],
    };
    const msgs = buildPlanSessionMessages(project, undefined, true);
    const user = msgs.find((m) => m.role === 'user');
    expect(Array.isArray(user?.content)).toBe(true);
    const parts = user?.content as Array<{ type: string; image_url?: { url: string } }>;
    const urls = parts.filter((p) => p.type === 'image_url').map((p) => p.image_url?.url);
    expect(urls).toEqual(['data:image/png;base64,LOGO']);
  });

  it('createFromPrompt with only a txt attachment seeds /uploads and inlines the body', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+ok\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+ok\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);
    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });
    await agent.createFromPrompt('', undefined, [
      { id: 'a1', type: 'text', name: 'notes.txt', data: 'secret brief body' },
    ]);
    expect(h.active?.files.some((f) => f.path === '/uploads/notes.txt' && f.content === 'secret brief body')).toBe(true);
    expect(h.active?.messages[0]?.attachments?.[0]?.path).toBe('/uploads/notes.txt');
    const userTurn = seenMessages[0]?.find((m) => m.role === 'user');
    expect(typeof userTurn?.content).toBe('string');
    expect(String(userTurn?.content)).toContain('secret brief body');
  });

  it('createFromPrompt with an image uses multipart image_url', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+ok\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+ok\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);
    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });
    await agent.createFromPrompt('', undefined, [
      { id: 'img', type: 'image', name: 'hero.jpg', data: 'data:image/jpeg;base64,qq' },
    ]);
    const userTurn = seenMessages[0]?.find((m) => m.role === 'user');
    expect(Array.isArray(userTurn?.content)).toBe(true);
  });

  it('createFromPrompt with an image still writes /uploads when vision is off, without image_url', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+ok\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+ok\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);
    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
      canSendImageParts: () => false,
    });
    await agent.createFromPrompt('', undefined, [
      { id: 'img', type: 'image', name: 'hero.jpg', data: 'data:image/jpeg;base64,qq' },
    ]);
    expect(h.active?.files.some((f) => f.path === '/uploads/hero.jpg')).toBe(true);
    const userTurn = seenMessages[0]?.find((m) => m.role === 'user');
    expect(typeof userTurn?.content).toBe('string');
    expect(String(userTurn?.content)).toContain('/uploads/hero.jpg');
  });

  it('createFromPrompt no-ops when prompt and attachments are empty', async () => {
    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport: async () => ({ content: 'nope' }),
      skillFetcher: makeSkillFetcher().fetcher,
    });
    await agent.createFromPrompt('');
    expect(h.active).toBeNull();
  });

  it('sendFollowUp uses edit when a built deck already exists', async () => {
    const skills = makeSkillFetcher();
    let usedEdit = false;
    const transport = async (): Promise<AgentChatResponse> => {
      usedEdit = true;
      return {
        content: 'tweaked',
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
                diff:
                  '@@\n+{"canvas":"16:9","theme":"/theme.css","slides":[{"id":"s1","html":"/slides/01.html"}]}\n',
              },
            }),
          ),
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: { type: 'create_file', path: '/theme.css', diff: '@@\n+body{}\n' },
            }),
          ),
        ],
      };
    };

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
      maxRounds: 6,
    });

    await agent.sendFollowUp('make the title bigger');

    expect(usedEdit).toBe(true);
    expect(h.phase === 'ready' || h.phase === 'error' || h.phase === 'edit').toBe(true);
  });

  it('re-plans on a plan_ready follow-up so the brief can be revised before building', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({
        content: 'revising',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'update_file',
                path: '/brief.md',
                diff: '@@\n-# Coffee deck\n+# Coffee deck — 12 slides\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: 'Revised plan ready.' }),
    ]);

    const h = makeHost();
    // plan_ready with plan files only — no built deck yet.
    h.host.landProject(builtProject());

    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });

    await agent.sendFollowUp('make it 12 slides instead of 8');

    // Re-plan lands back on plan_ready (edit would land ready/error/edit).
    expect(h.phase).toBe('plan_ready');
    // The follow-up was recorded in the main transcript.
    expect(
      h.active?.messages.some((m) => m.role === 'user' && m.content === 'make it 12 slides instead of 8'),
    ).toBe(true);
    // The plan session saw the original prompt + the follow-up.
    expect(
      seenMessages[0]?.some((m) => m.role === 'user' && m.content === 'make it 12 slides instead of 8'),
    ).toBe(true);
    // The revised brief landed on the project VFS.
    expect(h.active?.files.find((f) => f.path === '/brief.md')?.content).toContain('12 slides');
    // No edit round checkpoint was committed (edit only).
    expect(h.rounds).toHaveLength(0);
  });

  it('continues a follow-up plan from the persisted transcript (same context across rounds)', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenMessages } = makeTransport([
      () => ({
        content: 'revising',
        toolCalls: [
          toolCall(
            'apply_patch',
            JSON.stringify({
              operation: {
                type: 'update_file',
                path: '/brief.md',
                diff: '@@\n-# Coffee deck\n+# Coffee deck — 15 slides\n',
              },
            }),
          ),
        ],
      }),
      () => ({ content: 'Revised plan ready.' }),
    ]);

    const h = makeHost();
    // A project whose FIRST plan round completed, carrying its conversation.
    h.host.landProject({
      ...builtProject(),
      planTranscript: [
        { role: 'user', content: 'my deck' },
        {
          role: 'assistant',
          content: 'drafting',
          toolCalls: [
            { id: 'tc1', name: 'apply_patch', arguments: '{}' },
          ],
        },
        { role: 'tool', toolCallId: 'tc1', name: 'apply_patch', content: 'ok' },
      ],
    });

    const agent = createSlideAgent(h.host, {
      providerConfig,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });

    await agent.sendFollowUp('make it 15 slides instead of 12');

    // Re-plan landed back on plan_ready.
    expect(h.phase).toBe('plan_ready');
    // The session continued from the PRIOR transcript (prior assistant + tool
    // turns are present) and appended the new follow-up user turn.
    const session = seenMessages[0] ?? [];
    expect(session.some((m) => m.role === 'assistant' && m.content === 'drafting')).toBe(true);
    expect(session.some((m) => m.role === 'tool' && m.content === 'ok')).toBe(true);
    expect(session.some((m) => m.role === 'user' && m.content === 'make it 15 slides instead of 12')).toBe(
      true,
    );
    // The updated conversation was persisted back onto the project — including
    // the PRIOR assistant + tool + user turns, not just the new follow-up.
    const persisted = h.active?.planTranscript ?? [];
    expect(persisted.some((m) => m.role === 'assistant' && m.content === 'drafting')).toBe(true);
    expect(persisted.some((m) => m.role === 'tool' && m.content === 'ok')).toBe(true);
    expect(persisted.some((m) => m.role === 'user' && m.content === 'my deck')).toBe(true);
    expect(persisted.some((m) => m.role === 'user' && m.content === 'make it 15 slides instead of 12')).toBe(
      true,
    );
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

describe('createSlideAgent — live providerConfig (provider switch)', () => {
  it('reads getProviderConfig at phase start so a mid-session switch is used', async () => {
    const skills = makeSkillFetcher();
    const { transport, seenProviders } = makeTransport([
      () => ({
        content: 'done',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+b\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+d\n' } })),
          toolCall('submit_plan', JSON.stringify({ summary: 'ok', canvas: '16:9' })),
        ],
      }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const frozen: ProviderConfig = {
      ...providerConfig,
      providerId: 'deepseek',
      model: 'deepseek-v4-flash',
      apiUrl: 'https://api.deepseek.com/v1',
    };
    let live: ProviderConfig = frozen;

    const h = makeHost();
    const agent = createSlideAgent(h.host, {
      // Stale first-render snapshot (the bug): still deepseek.
      providerConfig: frozen,
      // Live selection after the user switches in the picker.
      getProviderConfig: () => live,
      transport,
      skillFetcher: skills.fetcher,
      maxRounds: 6,
    });

    live = {
      ...providerConfig,
      providerId: 'cline',
      model: 'cline-pass/deepseek-v4-flash',
      apiUrl: 'https://api.cline.bot/v1',
      apiKey: 'cline-key',
    };

    await agent.createFromPrompt('a coffee deck');

    expect(seenProviders.length).toBeGreaterThan(0);
    expect(seenProviders[0]?.providerId).toBe('cline');
    expect(seenProviders[0]?.model).toBe('cline-pass/deepseek-v4-flash');
    expect(seenProviders[0]?.apiUrl).toBe('https://api.cline.bot/v1');
    // Every request in the phase must use the live config, not the frozen one.
    for (const pc of seenProviders) {
      expect(pc.providerId).toBe('cline');
    }
  });
});


