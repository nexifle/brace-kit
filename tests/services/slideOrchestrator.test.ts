import { describe, expect, it } from 'bun:test';
import { createSlideAgent, deriveSlideTitle } from '../../src/services/slideOrchestrator.ts';
import type { SlideProject, SlideFile } from '../../src/types/slides.ts';
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
  const landed: SlideProject[] = [];
  const answered: Array<{ projectId: string; answer: string }> = [];

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
  };

  return {
    host,
    get active() { return active; },
    get phase() { return phase; },
    get busy() { return busy; },
    get pendingAsk() { return pendingAsk; },
    get landed() { return landed; },
    get answered() { return answered; },
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
    // the transcript carries only the user msg + a short summary — no tool chatter
    const roles = h.active!.messages.map((m) => m.role);
    expect(roles).toContain('user');
    expect(roles).toContain('summary');
    expect(h.active!.messages.length).toBeLessThanOrEqual(3);
    // tool calls are NOT copied into the main transcript
    expect(h.active!.messages.some((m) => Array.isArray((m as unknown as { toolCalls?: unknown }).toolCalls))).toBe(false);
    // plan skill + its references were loaded for the session
    expect(calls()).toBe(3);
  });

  it('suspends with a pending ask on an ask tool call, then records the answer', async () => {
    const skills = makeSkillFetcher();
    const { transport } = makeTransport([
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
    expect(h.active?.messages.some((m) => m.role === 'summary' && /Deck built/.test(m.content))).toBe(true);
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
  });
});

describe('deriveSlideTitle', () => {
  it('derives a short title and caps whitespace + length', () => {
    expect(deriveSlideTitle('  build   a coffee deck  ')).toBe('build a coffee deck');
    expect(deriveSlideTitle('   ')).toBe('Untitled deck');
    expect(deriveSlideTitle('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});
