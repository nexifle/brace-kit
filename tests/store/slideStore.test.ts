import { afterAll, beforeEach, describe, expect, it } from 'bun:test';
import 'fake-indexeddb/auto';
import { useSlideStore } from '../../src/store/slideStore.ts';
import {
  clearAllSlideProjects,
  saveSlideProject,
  setLastActiveSlideProject,
} from '../../src/utils/slideDB.ts';
import type { SlideProject } from '../../src/types/slides.ts';

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
  beforeEach(() => {
    useSlideStore.getState().reset();
  });
  afterAll(() => clearAllSlideProjects());

  it('starts in a neutral idle state', () => {
    const s = useSlideStore.getState();
    expect(s.activeProjectId).toBeNull();
    expect(s.activeProject).toBeNull();
    expect(s.phase).toBe('idle');
    expect(s.busy).toBe(false);
    expect(s.pendingAsk).toBeNull();
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

    useSlideStore.getState().setSessionStatus('waiting_user');
    expect(useSlideStore.getState().busy).toBe(false);
    expect(useSlideStore.getState().sessionStatus).toBe('waiting_user');
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
});
