import { beforeEach, afterAll, describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import {
  clearAllSlideProjects,
  deleteSlideProject,
  getLastActiveSlideProject,
  getSlideProject,
  listSlideProjects,
  saveSlideProject,
  setLastActiveSlideProject,
} from '../../src/utils/slideDB.ts';
import type { SlideFile, SlideProject } from '../../src/types/index.ts';

const project = (id: string, title = `Project ${id}`): SlideProject => ({
  id,
  title,
  createdAt: 1000,
  updatedAt: 2000,
  phase: 'plan',
  canvas: '16:9',
  messages: [
    { id: 'm1', role: 'user', content: 'Build a deck', createdAt: 1000 },
    { id: 'm2', role: 'assistant', content: 'Planning…', createdAt: 1100 },
  ],
  files: [
    { path: '/brief.md', content: '# Brief' },
    { path: '/design.md', content: '# Design' },
  ],
  pendingAsk: {
    id: 'ask1',
    toolCallId: 'tc1',
    sessionRef: 'plan',
    payload: { question: 'Canvas?', options: ['16:9'], field: 'canvas' },
    createdAt: 1500,
  },
});

beforeEach(async () => {
  await clearAllSlideProjects();
});

afterAll(async () => {
  await clearAllSlideProjects();
});

describe('slideDB project CRUD', () => {
  test('save then get reassembles the full project', async () => {
    await saveSlideProject(project('p1'));
    const loaded = await getSlideProject('p1');
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe('p1');
    expect(loaded!.title).toBe('Project p1');
    expect(loaded!.phase).toBe('plan');
    expect(loaded!.canvas).toBe('16:9');
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.messages[0].role).toBe('user');
    expect(loaded!.files).toEqual([
      { path: '/brief.md', content: '# Brief' },
      { path: '/design.md', content: '# Design' },
    ]);
    expect(loaded!.pendingAsk?.payload.question).toBe('Canvas?');
    expect(loaded!.pendingAsk?.toolCallId).toBe('tc1');
    expect(loaded!.createdAt).toBe(1000);
  });

  test('get returns null for a missing project', async () => {
    expect(await getSlideProject('nope')).toBeNull();
  });

  test('overwriting a project replaces its data (upsert)', async () => {
    await saveSlideProject(project('p1', 'First'));
    await saveSlideProject({ ...project('p1', 'Second'), files: [] });
    const loaded = await getSlideProject('p1');
    expect(loaded!.title).toBe('Second');
    expect(loaded!.files).toEqual([]);
  });

  test('list returns projects sorted by updatedAt desc', async () => {
    const a = project('a', 'A');
    const b = project('b', 'B');
    await saveSlideProject(a);
    await saveSlideProject(b);

    // Force a known ordering: save refreshes updatedAt to now, so run order matters.
    const list = await listSlideProjects();
    expect(list.map((p) => p.id)).toContain('a');
    expect(list.map((p) => p.id)).toContain('b');
    expect(list).toHaveLength(2);
    expect(list[0].updatedAt >= list[1].updatedAt).toBe(true);
  });

  test('list is empty when no projects exist', async () => {
    expect(await listSlideProjects()).toEqual([]);
  });

  test('delete removes metadata, messages, files, and last-active', async () => {
    await saveSlideProject(project('p1'));
    await setLastActiveSlideProject('p1');

    await deleteSlideProject('p1');

    expect(await getSlideProject('p1')).toBeNull();
    expect(await listSlideProjects()).toEqual([]);
    expect(await getLastActiveSlideProject()).toBeNull();
  });

  test('delete of a missing project is a no-op (does not throw)', async () => {
    await expect(deleteSlideProject('missing')).resolves.toBeUndefined();
  });
});

describe('slideDB last-active', () => {
  test('set then get round-trips the id', async () => {
    await setLastActiveSlideProject('pZ');
    expect(await getLastActiveSlideProject()).toBe('pZ');
  });

  test('get returns null before anything is set', async () => {
    expect(await getLastActiveSlideProject()).toBeNull();
  });

  test('clearing resets last-active', async () => {
    await setLastActiveSlideProject('p1');
    await clearAllSlideProjects();
    expect(await getLastActiveSlideProject()).toBeNull();
  });
});
