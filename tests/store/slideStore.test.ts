import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import 'fake-indexeddb/auto';
import { useSlideStore } from '../../src/store/slideStore.ts';
import {
  clearAllSlideProjects,
  getSlideActivity,
  saveSlideActivity,
  saveSlideProject,
  setLastActiveSlideProject,
} from '../../src/utils/slideDB.ts';
import type { SlideProject } from '../../src/types/slides.ts';
import { DEFAULT_SLIDE_AGENT_MAX_ROUNDS } from '../../src/types/slides.ts';


function makeProject(overrides: Partial<SlideProject> = {}): SlideProject {
  return {
    id: 'proj_1',
    title: 'Test Deck',
    createdAt: 1000,
    updatedAt: 2000,
    phase: 'idle',
    canvas: '16:9',
    messages: [],
    files: [
      { path: '/deck.json', content: JSON.stringify({ title: 'Test Deck', slideOrder: ['01', '02'], canvas: '16:9' }) },
      { path: '/slides/01.html', content: '<h1>One</h1>' },
      { path: '/slides/02.html', content: '<h1>Two</h1>' },
    ],
    ...overrides,
  };
}

describe('slideStore', () => {
  // Reset BOTH the store and the shared fake-indexeddb so no activity/project
  // leaks across tests (the persistence actions write to IDB; a dirty DB makes
  // length/list assertions order-dependent).
  beforeEach(async () => {
    useSlideStore.getState().reset();
    await clearAllSlideProjects();
  });
  afterAll(() => clearAllSlideProjects());

  it('starts in a neutral idle state', () => {
    const s = useSlideStore.getState();
    expect(s.activeProjectId).toBeNull();
    expect(s.activeProject).toBeNull();
    expect(s.phase).toBe('idle');
    expect(s.sessionStatus).toBe('idle');
    expect(s.busy).toBe(false);
    expect(s.busy).toBe(s.sessionStatus === 'running');
    expect(s.pendingAsk).toBeNull();
    expect(s.activity).toEqual([]);
    expect(s.streamingText).toBe('');
    expect(s.streamingReasoning).toBe('');
    expect(s.agentRound).toBe(0);
    expect(s.agentMaxRounds).toBe(DEFAULT_SLIDE_AGENT_MAX_ROUNDS);

    expect(s.lastToolName).toBeNull();
    expect(s.lastError).toBeNull();
    expect(s.activeDeck).toBeNull();
    expect(s.deckSlides).toEqual([]);
    expect(s.currentSlideIndex).toBe(0);
    expect(s.messages).toEqual([]);
    expect(s.panelView).toBe('split');
  });


  it('setActiveProjectData rebuilds deck projection and slides', () => {
    const project = makeProject();
    useSlideStore.getState().setActiveProjectData(project);

    const s = useSlideStore.getState();
    expect(s.activeProjectId).toBe('proj_1');
    expect(s.phase).toBe('idle');
    expect(s.activeDeck?.title).toBe('Test Deck');
    expect(s.activeDeck?.slideOrder).toEqual(['01', '02']);
    expect(s.deckSlides.map((sl) => sl.id)).toEqual(['01', '02']);
    expect(s.deckSlides[0]?.htmlPath).toBe('/slides/01.html');
    expect(s.currentSlideIndex).toBe(0);
  });

  it('setActiveProjectData wires up a pending ask', () => {
    const ask = {
      id: 'ask_1',
      toolCallId: 'tc_1',
      sessionRef: 'plan' as const,
      createdAt: 123,
      payload: { question: 'Which canvas?', field: 'canvas' as const },
    };
    const project = makeProject({ pendingAsk: ask });
    useSlideStore.getState().setActiveProjectData(project);

    const s = useSlideStore.getState();
    expect(s.pendingAsk?.question).toBeUndefined();
    expect(s.pendingAsk?.id).toBe('ask_1');
    expect(s.pendingAsk?.projectId).toBe('proj_1');
    expect(s.pendingAsk?.payload.question).toBe('Which canvas?');
  });

  it('setActiveProjectData clears activity when switching projects without a feed', () => {
    const store = useSlideStore.getState();
    store.setActiveProjectData(makeProject({ id: 'proj_old' }));
    store.setSessionStatus('running');
    store.setStreamingText('leftover');
    store.setStreamingReasoning('think');
    store.setLastError('boom');
    store.setAgentRound(3);
    store.setLastToolName('apply_patch');
    store.pushActivity({
      id: 'old',
      type: 'info',
      status: 'completed',
      ts: 1,
      phase: 'plan',
      label: 'stale',
    });

    store.setActiveProjectData(makeProject({ id: 'proj_1' }));
    const s = useSlideStore.getState();
    expect(s.activity).toEqual([]);
    expect(s.streamingText).toBe('');
    expect(s.streamingReasoning).toBe('');
    expect(s.lastError).toBeNull();
    expect(s.lastToolName).toBeNull();
    expect(s.agentRound).toBe(0);
    expect(s.busy).toBe(false);
    expect(s.sessionStatus).toBe('idle');
  });

  it('setActiveProjectData keeps live activity when re-landing the same project without a feed', () => {
    const store = useSlideStore.getState();
    store.setActiveProjectData(makeProject({ id: 'proj_1' }));
    const feed = [
      {
        id: 'e1',
        type: 'phase_started' as const,
        status: 'completed' as const,
        ts: 1,
        phase: 'edit' as const,
        label: 'Editing started',
      },
      {
        id: 'e2',
        type: 'file_written' as const,
        status: 'completed' as const,
        ts: 2,
        phase: 'edit' as const,
        path: '/theme.css',
        label: 'Updated /theme.css',
      },
    ];
    for (const ev of feed) store.pushActivity(ev);

    // Orchestrator landProject path: plain SlideProject, no activity field.
    store.setActiveProjectData(
      makeProject({
        id: 'proj_1',
        messages: [
          { id: 'm1', role: 'user', content: 'change fonts', createdAt: 1 },
          { id: 'm2', role: 'assistant', content: 'Fonts updated.', createdAt: 2 },
        ],
      }),
    );

    expect(useSlideStore.getState().activity).toEqual(feed);
    expect(useSlideStore.getState().messages).toHaveLength(2);
  });

  it('setActiveProjectData keeps session running when mid-phase same-project land', () => {
    // sendFollowUp: setBusy(true) then appendMessage → landProject must not
    // flip the composer out of Generating… / Stop.
    const store = useSlideStore.getState();
    store.setActiveProjectData(makeProject({ id: 'proj_1', phase: 'ready' }));
    store.setBusy(true);
    store.setStreamingText('partial');
    expect(useSlideStore.getState().sessionStatus).toBe('running');
    expect(useSlideStore.getState().busy).toBe(true);

    store.setActiveProjectData(
      makeProject({
        id: 'proj_1',
        phase: 'edit',
        messages: [{ id: 'm1', role: 'user', content: 'continue', createdAt: 1 }],
      }),
    );

    const s = useSlideStore.getState();
    expect(s.sessionStatus).toBe('running');
    expect(s.busy).toBe(true);
    expect(s.phase).toBe('edit');
    expect(s.streamingText).toBe('partial');
    expect(s.messages).toHaveLength(1);
  });

  it('setActiveProjectData prefers explicit activity=[] over the live feed (restore)', () => {
    const store = useSlideStore.getState();
    store.setActiveProjectData(makeProject({ id: 'proj_1' }));
    store.pushActivity({
      id: 'live',
      type: 'file_written',
      status: 'completed',
      ts: 1,
      phase: 'edit',
      path: '/theme.css',
      label: 'Updated /theme.css',
    });

    // FullSlideProject restore can ship an empty capped feed — must not keep stale live rows.
    store.setActiveProjectData({ ...makeProject({ id: 'proj_1' }), activity: [] });
    expect(useSlideStore.getState().activity).toEqual([]);
  });

  it('orchestrator-style completion keeps tool rows when landing assistant text', () => {
    // Mirrors useSlideAgent.landProject → setActiveProjectData(SlideProject) after
    // pushActivity during a phase: messages update, activity must survive.
    const store = useSlideStore.getState();
    store.setActiveProjectData(makeProject({ id: 'sp_edit', phase: 'ready' }));
    store.setBusy(true);

    const phaseFeed = [
      {
        id: 'ps',
        type: 'phase_started' as const,
        status: 'running' as const,
        ts: 10,
        phase: 'edit' as const,
        label: 'Editing started',
      },
      {
        id: 't1',
        type: 'tool_started' as const,
        status: 'completed' as const,
        ts: 20,
        phase: 'edit' as const,
        toolName: 'apply_patch',
        toolCallId: 'tc_1',
        label: 'Updating /theme.css',
      },
      {
        id: 'f1',
        type: 'file_written' as const,
        status: 'completed' as const,
        ts: 21,
        phase: 'edit' as const,
        path: '/theme.css',
        patchOp: 'update_file' as const,
        toolCallId: 'tc_1',
        label: 'Updated /theme.css',
      },
      {
        id: 'pc',
        type: 'phase_completed' as const,
        status: 'completed' as const,
        ts: 30,
        phase: 'edit' as const,
        label: 'Updates applied',
      },
    ];
    for (const ev of phaseFeed) store.pushActivity(ev);

    store.setBusy(false);
    store.setActiveProjectData(
      makeProject({
        id: 'sp_edit',
        phase: 'ready',
        messages: [
          { id: 'u1', role: 'user', content: 'change the font to jakarta sans', createdAt: 1 },
          {
            id: 'a1',
            role: 'assistant',
            content:
              'The font change is applied. Plus Jakarta Sans and Lora are loaded from Google Fonts.',
            createdAt: 2,
          },
        ],
      }),
    );

    const s = useSlideStore.getState();
    expect(s.activity.map((e) => e.id)).toEqual(['ps', 't1', 'f1', 'pc']);
    expect(s.activity.some((e) => e.type === 'file_written' && e.path === '/theme.css')).toBe(true);
    expect(s.messages.some((m) => m.role === 'assistant' && /Jakarta Sans/.test(m.content))).toBe(
      true,
    );
    expect(s.busy).toBe(false);
    expect(s.sessionStatus).toBe('idle');
  });

  it('switching projects adopts the incoming explicit activity feed', () => {
    const store = useSlideStore.getState();
    store.setActiveProjectData(makeProject({ id: 'proj_a' }));
    store.pushActivity({
      id: 'a_only',
      type: 'phase_started',
      status: 'completed',
      ts: 1,
      phase: 'plan',
      label: 'A only',
    });

    const bFeed = [
      {
        id: 'b1',
        type: 'phase_started' as const,
        status: 'completed' as const,
        ts: 5,
        phase: 'build' as const,
        label: 'Building',
      },
    ];
    store.setActiveProjectData({ ...makeProject({ id: 'proj_b' }), activity: bFeed });
    expect(useSlideStore.getState().activity).toEqual(bFeed);
    expect(useSlideStore.getState().activity.some((e) => e.id === 'a_only')).toBe(false);
  });

  it('setActiveProjectData marks waiting_user when project has pendingAsk', () => {
    const ask = {
      id: 'ask_1',
      toolCallId: 'tc_1',
      sessionRef: 'plan' as const,
      createdAt: 123,
      payload: { question: 'Which canvas?', field: 'canvas' as const },
    };
    useSlideStore.getState().setActiveProjectData(makeProject({ pendingAsk: ask }));
    const s = useSlideStore.getState();
    expect(s.sessionStatus).toBe('waiting_user');
    expect(s.busy).toBe(false);
    expect(s.pendingAsk?.id).toBe('ask_1');
  });


  it('setActiveDeckFromVfs re-projects and refreshes files', () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    const project = makeProject({
      files: [
        { path: '/deck.json', content: JSON.stringify({ title: 'New', slideOrder: ['03'], canvas: '4:5' }) },
        { path: '/slides/03.html', content: '<h1>Three</h1>' },
      ],
    });
    useSlideStore.getState().setActiveDeckFromVfs(project.files);

    const s = useSlideStore.getState();
    expect(s.activeDeck?.title).toBe('New');
    expect(s.deckSlides.map((sl) => sl.id)).toEqual(['03']);
    expect(s.canvas).toBe('4:5');
    expect(s.activeProject?.files).toHaveLength(2);
    expect(s.currentSlideIndex).toBe(0);
  });

  it('selectSlide clamps to a valid range', () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    const s = useSlideStore.getState();
    expect(s.deckSlides.length).toBe(2);

    s.selectSlide(1);
    expect(useSlideStore.getState().currentSlideIndex).toBe(1);

    s.selectSlide(99);
    expect(useSlideStore.getState().currentSlideIndex).toBe(1);

    s.selectSlide(-5);
    expect(useSlideStore.getState().currentSlideIndex).toBe(0);
  });

  it('setSessionStatus derives busy from running', () => {
    useSlideStore.getState().setSessionStatus('running');
    expect(useSlideStore.getState().busy).toBe(true);
    expect(useSlideStore.getState().busy).toBe(
      useSlideStore.getState().sessionStatus === 'running',
    );

    useSlideStore.getState().setSessionStatus('waiting_user');
    expect(useSlideStore.getState().busy).toBe(false);
    expect(useSlideStore.getState().sessionStatus).toBe('waiting_user');
    expect(useSlideStore.getState().busy).toBe(
      useSlideStore.getState().sessionStatus === 'running',
    );
  });

  it('setBusy keeps sessionStatus in lockstep with busy', () => {
    useSlideStore.getState().setBusy(true);
    let s = useSlideStore.getState();
    expect(s.busy).toBe(true);
    expect(s.sessionStatus).toBe('running');
    expect(s.busy).toBe(s.sessionStatus === 'running');

    useSlideStore.getState().setBusy(false);
    s = useSlideStore.getState();
    expect(s.busy).toBe(false);
    expect(s.sessionStatus).toBe('idle');
    expect(s.busy).toBe(s.sessionStatus === 'running');

    // setBusy(false) must not clobber waiting_user / done / error / stopped.
    useSlideStore.getState().setSessionStatus('waiting_user');
    useSlideStore.getState().setBusy(false);
    expect(useSlideStore.getState().sessionStatus).toBe('waiting_user');
    expect(useSlideStore.getState().busy).toBe(false);
  });

  it('streamingText/streamingReasoning clear on stop, error, and done', () => {
    const store = useSlideStore.getState();
    store.setSessionStatus('running');
    store.setStreamingText('hello');
    store.appendStreamingText(' world');
    store.setStreamingReasoning('think');
    expect(useSlideStore.getState().streamingText).toBe('hello world');
    expect(useSlideStore.getState().streamingReasoning).toBe('think');

    store.clearStreaming();
    expect(useSlideStore.getState().streamingText).toBe('');
    expect(useSlideStore.getState().streamingReasoning).toBe('');

    store.setStreamingText('again');
    store.setStreamingReasoning('r');
    store.setSessionStatus('done');
    expect(useSlideStore.getState().streamingText).toBe('');
    expect(useSlideStore.getState().streamingReasoning).toBe('');
    expect(useSlideStore.getState().busy).toBe(false);

    store.setSessionStatus('running');
    store.setStreamingText('x');
    store.setStreamingReasoning('rx');
    store.setSessionStatus('error');
    expect(useSlideStore.getState().streamingText).toBe('');
    expect(useSlideStore.getState().streamingReasoning).toBe('');

    store.setSessionStatus('running');
    store.setStreamingText('y');
    store.setStreamingReasoning('ry');
    store.markStopped();
    expect(useSlideStore.getState().streamingText).toBe('');
    expect(useSlideStore.getState().streamingReasoning).toBe('');
    expect(useSlideStore.getState().sessionStatus).toBe('stopped');
    expect(useSlideStore.getState().busy).toBe(false);

  });

  it('pushActivity and patchActivity manage the activity feed', () => {
    const base = {
      id: 'plan_1_1',
      type: 'tool_started' as const,
      status: 'running' as const,
      ts: 1,
      phase: 'plan' as const,
      label: 'Updating /brief.md',
      toolName: 'apply_patch',
      path: '/brief.md',
    };
    useSlideStore.getState().pushActivity(base);
    useSlideStore.getState().pushActivity({
      ...base,
      id: 'plan_1_2',
      type: 'info' as const,
      status: 'completed' as const,
      label: 'Note',
    });
    expect(useSlideStore.getState().activity).toHaveLength(2);

    useSlideStore.getState().patchActivity('plan_1_1', {
      status: 'completed',
      type: 'tool_finished',
      label: 'Updated /brief.md',
    });
    const row = useSlideStore.getState().activity.find((e) => e.id === 'plan_1_1');
    expect(row?.status).toBe('completed');
    expect(row?.type).toBe('tool_finished');
    expect(row?.label).toBe('Updated /brief.md');
    // id is immutable under patch
    expect(row?.id).toBe('plan_1_1');

    useSlideStore.getState().setActivity([]);
    expect(useSlideStore.getState().activity).toEqual([]);
  });


  it('setPhase / setBusy / setPendingAsk / setMessages / addMessage / setPanelView work', () => {
    const s = useSlideStore.getState();
    s.setPhase('plan');
    expect(useSlideStore.getState().phase).toBe('plan');

    s.setBusy(true);
    expect(useSlideStore.getState().busy).toBe(true);

    s.setPendingAsk({ id: 'a', toolCallId: 't', sessionRef: 'plan', createdAt: 1, payload: { question: 'Q' }, projectId: 'p' });
    expect(useSlideStore.getState().pendingAsk?.payload.question).toBe('Q');

    s.setMessages([{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }]);
    expect(useSlideStore.getState().messages).toHaveLength(1);

    s.addMessage({ id: 'm2', role: 'assistant', content: 'yo', createdAt: 2 });
    expect(useSlideStore.getState().messages).toHaveLength(2);

    s.setPanelView('preview');
    expect(useSlideStore.getState().panelView).toBe('preview');
  });

  it('answerAsk clears the pending ask and appends the answer to the transcript', () => {
    const ask = {
      id: 'ask_1',
      toolCallId: 'tc_1',
      sessionRef: 'plan' as const,
      createdAt: 123,
      payload: { question: 'Which canvas?', field: 'canvas' as const },
    };
    useSlideStore.getState().setActiveProjectData(makeProject({ pendingAsk: ask }));
    expect(useSlideStore.getState().pendingAsk).not.toBeNull();

    useSlideStore.getState().answerAsk('proj_1', '4:5');

    const s = useSlideStore.getState();
    expect(s.pendingAsk).toBeNull();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe('user');
    expect(s.messages[0].content).toBe('4:5');
    expect(s.activeProject?.pendingAsk).toBeUndefined();
    expect(s.activeProject?.messages).toHaveLength(1);
  });

  it('answerAsk ignores a stale mismatch of project id', () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    useSlideStore.getState().answerAsk('other_proj', 'hello');
    expect(useSlideStore.getState().messages).toHaveLength(0);
  });

  it('updatePlanFile upserts an edited plan artifact into the VFS', async () => {
    const project = makeProject({
      files: [
        { path: '/deck.json', content: '{}' },
        { path: '/brief.md', content: '# Old brief' },
      ],
    });
    useSlideStore.getState().setActiveProjectData(project);

    useSlideStore.getState().updatePlanFile('/brief.md', '# New brief');

    const s = useSlideStore.getState();
    expect(s.activeProject?.files).toHaveLength(2);
    expect(s.activeProject?.files.find((f) => f.path === '/brief.md')?.content).toBe('# New brief');
    expect(s.phase).toBe('idle');
  });

  it('updatePlanFile clears the cached planTranscript on a plan-doc edit', () => {
    const project = makeProject({
      phase: 'plan_ready',
      files: [
        { path: '/deck.json', content: '{}' },
        { path: '/brief.md', content: '# Old brief' },
      ],
      planTranscript: [
        { role: 'user', content: 'my deck' },
        { role: 'assistant', content: 'drafting', toolCalls: [] },
      ],
    });
    useSlideStore.getState().setActiveProjectData(project);

    useSlideStore.getState().updatePlanFile('/brief.md', '# New brief');

    const s = useSlideStore.getState();
    expect(s.activeProject?.files.find((f) => f.path === '/brief.md')?.content).toBe('# New brief');
    // The stale transcript (whose tool results embed the old brief) is dropped.
    expect(s.activeProject?.planTranscript).toBeUndefined();
  });

  it('updatePlanFile ignores a missing active project', () => {
    useSlideStore.getState().reset();
    useSlideStore.getState().updatePlanFile('/brief.md', 'x');
    expect(useSlideStore.getState().activeProject).toBeNull();
  });

  it('requestBuild transitions the active project into the build phase', () => {
    const project = makeProject({ phase: 'plan_ready' });
    useSlideStore.getState().setActiveProjectData(project);

    useSlideStore.getState().requestBuild();

    const s = useSlideStore.getState();
    expect(s.phase).toBe('build');
    expect(s.activeProject?.phase).toBe('build');
  });

  it('restoreLastActiveProject hydrates the last-active project from slideDB', async () => {
    const project = makeProject({
      id: 'proj_restore',
      phase: 'plan_ready',
      messages: [{ id: 'm1', role: 'user', content: 'hi', createdAt: 1 }],
      pendingAsk: {
        id: 'ask_r',
        toolCallId: 'tc_r',
        sessionRef: 'plan' as const,
        createdAt: 2,
        payload: { question: 'Canvas?', field: 'canvas', options: ['16:9', '4:5'] },
      },
    });
    await saveSlideProject(project);
    await setLastActiveSlideProject(project.id);

    useSlideStore.getState().restoreLastActiveProject();

    // await the async IDB reads to settle
    await new Promise((r) => setTimeout(r, 10));
    const s = useSlideStore.getState();
    expect(s.activeProjectId).toBe('proj_restore');
    expect(s.activeProject?.phase).toBe('plan_ready');
    expect(s.activeProject?.messages).toHaveLength(1);
    // pending ask is re-shown on the restored project
    expect(s.pendingAsk?.projectId).toBe('proj_restore');
    expect(s.pendingAsk?.payload.question).toBe('Canvas?');
    // deck projection rebuilt from restored VFS
    expect(s.deckSlides.map((sl) => sl.id)).toEqual(['01', '02']);
  });

  it('restoreLastActiveProject with a named id restores that project', async () => {
    await saveSlideProject(makeProject({ id: 'proj_a' }));
    await saveSlideProject(makeProject({ id: 'proj_b' }));
    await setLastActiveSlideProject('proj_a');

    useSlideStore.getState().restoreLastActiveProject('proj_b');
    await new Promise((r) => setTimeout(r, 10));

    expect(useSlideStore.getState().activeProjectId).toBe('proj_b');
  });

  it('listProjects returns persisted projects sorted by recency', async () => {
    // saveSlideProject refreshes updatedAt to now, so the newest save sorts first.
    // Wait >1ms between saves so Date.now() differs (equal index keys sort non-deterministically).
    await saveSlideProject(makeProject({ id: 'p_old' }));
    await new Promise((r) => setTimeout(r, 5));
    await saveSlideProject(makeProject({ id: 'p_new' }));
    await new Promise((r) => setTimeout(r, 5));

    const list = await useSlideStore.getState().listProjects();
    const ids = list.map((p) => p.id);
    expect(ids).toContain('p_old');
    expect(ids).toContain('p_new');
    expect(ids[0]).toBe('p_new');
  });

  it('deleteProject removes all related data and resets when active', async () => {
    const project = makeProject({ id: 'proj_del' });
    await saveSlideProject(project);
    await setLastActiveSlideProject(project.id);
    useSlideStore.getState().setActiveProjectData(project);
    expect(useSlideStore.getState().activeProjectId).toBe('proj_del');

    await useSlideStore.getState().deleteProject('proj_del');

    // workspace returned to idle
    expect(useSlideStore.getState().activeProject).toBeNull();
    expect(useSlideStore.getState().activeProjectId).toBeNull();
    // project gone from IDB + last-active cleared
    const list = await useSlideStore.getState().listProjects();
    expect(list.some((p) => p.id === 'proj_del')).toBe(false);
  });

  it('deleteProject of a non-active project leaves the workspace untouched', async () => {
    await saveSlideProject(makeProject({ id: 'proj_other' }));
    useSlideStore.getState().setActiveProjectData(makeProject({ id: 'proj_active' }));

    await useSlideStore.getState().deleteProject('proj_other');

    expect(useSlideStore.getState().activeProjectId).toBe('proj_active');
  });

  it('markStopped clears busy, dismisses a suspended ask, and flags the project stopped', () => {
    useSlideStore.getState().setActiveProjectData({
      ...makeProject(),
      pendingAsk: {
        id: 'ask_1',
        toolCallId: 'tc_1',
        sessionRef: 'plan',
        createdAt: 1000,
        payload: { question: 'Canvas?', field: 'canvas' },
      },
    });
    useSlideStore.getState().setBusy(true);

    useSlideStore.getState().markStopped();

    const s = useSlideStore.getState();
    expect(s.busy).toBe(false);
    expect(s.sessionStatus).toBe('stopped');
    expect(s.pendingAsk).toBeNull();
    expect(s.activeProject?.stopped).toBe(true);
    expect(s.activeProject?.pendingAsk).toBeUndefined();
  });

  it('setActiveProjectData restores the persisted activity feed (US-047)', () => {
    const feed = [
      { id: 'e1', type: 'phase_started' as const, status: 'completed' as const, ts: 1, phase: 'plan' as const, label: 'Planning started' },
      { id: 'e2', type: 'tool_started' as const, status: 'completed' as const, ts: 2, phase: 'plan' as const, round: 1, toolName: 'apply_patch', label: 'Creating /brief.md' },
    ];
    useSlideStore.getState().setActiveProjectData({ ...makeProject(), activity: feed });

    expect(useSlideStore.getState().activity).toEqual(feed);
  });

  it('setActiveProjectData without a persisted feed starts empty', () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    expect(useSlideStore.getState().activity).toEqual([]);
  });

  it('pushActivity persists the feed for the active project (US-047)', async () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    useSlideStore.getState().pushActivity({
      id: 'e1',
      type: 'phase_started',
      status: 'completed',
      ts: 1,
      phase: 'plan',
      label: 'Planning started',
    });

    // Fire-and-forget write is async — flush the microtask queue before reading.
    await new Promise((r) => setTimeout(r, 0));
    expect(await getSlideActivity('proj_1')).toHaveLength(1);
    expect((await getSlideActivity('proj_1'))[0].label).toBe('Planning started');
  });

  it('pushActivity does not persist when no project is active', async () => {
    useSlideStore.getState().pushActivity({
      id: 'e1',
      type: 'phase_started',
      status: 'completed',
      ts: 1,
      phase: 'plan',
      label: 'Planning started',
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(await getSlideActivity('proj_never_saved')).toEqual([]);
  });

  it('patchActivity persists the patched feed for the active project (US-047)', async () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    useSlideStore.getState().pushActivity({
      id: 'e1',
      type: 'tool_started',
      status: 'running',
      ts: 1,
      phase: 'plan',
      label: 'Reading /brief.md',
    });
    useSlideStore.getState().patchActivity('e1', { status: 'completed' });

    await new Promise((r) => setTimeout(r, 0));
    const persisted = await getSlideActivity('proj_1');
    expect(persisted).toHaveLength(1);
    expect(persisted[0].status).toBe('completed');
    expect(persisted[0].id).toBe('e1');
  });

  it('setActivity replaces and persists the feed for the active project (US-047)', async () => {
    useSlideStore.getState().setActiveProjectData(makeProject());
    const feed = [
      { id: 'a', type: 'phase_started' as const, status: 'completed' as const, ts: 1, phase: 'plan' as const, label: 'Planning started' },
      { id: 'b', type: 'phase_completed' as const, status: 'completed' as const, ts: 2, phase: 'build' as const, label: 'Deck ready — 3 slides' },
    ];
    useSlideStore.getState().setActivity(feed);

    await new Promise((r) => setTimeout(r, 0));
    const persisted = await getSlideActivity('proj_1');
    expect(persisted).toHaveLength(2);
    expect(persisted.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('restoreLastActiveProject restores the persisted activity feed (US-047 end-to-end)', async () => {
    const project = makeProject();
    await saveSlideProject(project);
    const feed = [
      { id: 's', type: 'phase_started' as const, status: 'completed' as const, ts: 1, phase: 'plan' as const, label: 'Planning started' },
      { id: 't', type: 'tool_finished' as const, status: 'failed' as const, ts: 2, phase: 'plan' as const, round: 1, toolName: 'apply_patch', label: 'Failed: bad context', detail: 'Error: context not found' },
    ];
    await saveSlideActivity(project.id, feed);

    await useSlideStore.getState().restoreLastActiveProject('proj_1');

    const s = useSlideStore.getState();
    expect(s.activeProjectId).toBe('proj_1');
    expect(s.activity).toEqual(feed);
    // a pendingAsk re-shows too (restore path unchanged for the rest)
    expect(s.activeProject?.title).toBe('Test Deck');
  });

  describe('undo/redo rounds', () => {
    const r1Files = [
      { path: '/deck.json', content: JSON.stringify({ title: 'Test Deck', slideOrder: ['01', '02'], canvas: '16:9' }) },
      { path: '/slides/01.html', content: '<h1>One</h1>' },
      { path: '/slides/02.html', content: '<h1>Two</h1>' },
    ];
    const r2Files = [
      { path: '/deck.json', content: JSON.stringify({ title: 'Test Deck', slideOrder: ['01', '02'], canvas: '16:9' }) },
      { path: '/slides/01.html', content: '<h1>One v2</h1>' },
      { path: '/slides/02.html', content: '<h1>Two</h1>' },
    ];

    it('commitRound appends checkpoints and advances roundIndex', () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Deck built · 2 slides');
      useSlideStore.getState().commitRound(r2Files, 'Make the title darker');

      const s = useSlideStore.getState();
      expect(s.rounds).toHaveLength(2);
      expect(s.roundIndex).toBe(1);
      expect(s.rounds[0].number).toBe(1);
      expect(s.rounds[0].label).toBe('Deck built · 2 slides');
      expect(s.rounds[1].number).toBe(2);
      expect(s.rounds[1].label).toBe('Make the title darker');
    });

    it('commitRound is a no-op when files match the head round', () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Round 1');
      useSlideStore.getState().commitRound(r1Files, 'Round 2 (dup)');

      const s = useSlideStore.getState();
      expect(s.rounds).toHaveLength(1);
      expect(s.roundIndex).toBe(0);
    });

    it('restoreRound rebuilds the deck to the pointed-to fileset', async () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Round 1');
      useSlideStore.getState().commitRound(r2Files, 'Round 2');

      await useSlideStore.getState().restoreRound('proj_1', 0);

      const s = useSlideStore.getState();
      expect(s.roundIndex).toBe(0);
      expect(s.activeProject?.files).toEqual(r1Files);
      expect(s.activeDeck?.slideOrder).toEqual(['01', '02']);
      expect(s.deckSlides.map((sl) => sl.id)).toEqual(['01', '02']);
      expect(s.deckSlides[0]?.htmlPath).toBe('/slides/01.html');
    });

    it('commitRound after restore truncates the redo tail', () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Round 1');
      useSlideStore.getState().commitRound(r2Files, 'Round 2');
      useSlideStore.getState().restoreRound('proj_1', 0);

      // A new edit from the restored state drops Round 2 (the redo tail).
      const r3Files = [
        { path: '/deck.json', content: JSON.stringify({ title: 'Test Deck', slideOrder: ['01', '02'], canvas: '16:9' }) },
        { path: '/slides/01.html', content: '<h1>One v3</h1>' },
        { path: '/slides/02.html', content: '<h1>Two</h1>' },
      ];
      useSlideStore.getState().commitRound(r3Files, 'Fresh edit');
      const s = useSlideStore.getState();
      expect(s.rounds).toHaveLength(2);
      expect(s.rounds.map((r) => r.number)).toEqual([1, 2]);
      expect(s.roundIndex).toBe(1);
      expect(s.rounds[1].label).toBe('Fresh edit');
      expect(s.rounds[1].files).toEqual(r3Files);
    });

    it('undo/redo via restoreRound(±1) walk the history', async () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Round 1');
      useSlideStore.getState().commitRound(r2Files, 'Round 2');

      await useSlideStore.getState().restoreRound('proj_1', 0);
      expect(useSlideStore.getState().roundIndex).toBe(0);
      expect(useSlideStore.getState().activeProject?.files).toEqual(r1Files);

      await useSlideStore.getState().restoreRound('proj_1', 1);
      expect(useSlideStore.getState().roundIndex).toBe(1);
      expect(useSlideStore.getState().activeProject?.files).toEqual(r2Files);

      // Restoring the current round is a no-op.
      await useSlideStore.getState().restoreRound('proj_1', 1);
      expect(useSlideStore.getState().roundIndex).toBe(1);
    });

    it('restoreRound is a no-op while busy', async () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Round 1');
      useSlideStore.getState().commitRound(r2Files, 'Round 2');
      // Simulate the orchestrator having landed the newest fileset.
      useSlideStore.getState().setActiveDeckFromVfs(r2Files);

      useSlideStore.getState().setBusy(true);
      await useSlideStore.getState().restoreRound('proj_1', 0);
      expect(useSlideStore.getState().roundIndex).toBe(1);
      expect(useSlideStore.getState().activeProject?.files).toEqual(r2Files);
    });

    it('restoreRound is a no-op while a pendingAsk is suspended', async () => {
      useSlideStore.getState().setActiveProjectData(makeProject());
      useSlideStore.getState().commitRound(r1Files, 'Round 1');
      useSlideStore.getState().commitRound(r2Files, 'Round 2');
      // Simulate the orchestrator having landed the newest fileset.
      useSlideStore.getState().setActiveDeckFromVfs(r2Files);

      useSlideStore.getState().setPendingAsk({
        id: 'ask1',
        toolCallId: 'tc1',
        sessionRef: 'plan',
        payload: { question: 'Canvas?', options: ['16:9'], field: 'canvas' },
        createdAt: 1500,
        projectId: 'proj_1',
      });
      await useSlideStore.getState().restoreRound('proj_1', 0);
      expect(useSlideStore.getState().roundIndex).toBe(1);
      expect(useSlideStore.getState().activeProject?.files).toEqual(r2Files);
    });
  });
});
