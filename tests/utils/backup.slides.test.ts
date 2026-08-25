import { beforeEach, describe, expect, test } from 'bun:test';
import 'fake-indexeddb/auto';
import { createMockChrome } from '../helpers/chrome-mock.ts';
import {
  buildChunkedBackupPayload,
  importData,
} from '../../src/utils/backup.ts';
import {
  clearAllSlideProjects,
  getLastActiveSlideProject,
  getSlideProject,
  saveSlideActivity,
  saveSlideProject,
  saveSlideRounds,
  setLastActiveSlideProject,
} from '../../src/utils/slideDB.ts';
import type { SlideProject, SlideRound } from '../../src/types/index.ts';

function makeProject(id: string): SlideProject {
  return {
    id,
    title: `Deck ${id}`,
    createdAt: 1000,
    updatedAt: 2000,
    phase: 'ready',
    mode: 'plan',
    canvas: '16:9',
    messages: [{ id: 'm1', role: 'user', content: 'Hello', createdAt: 1000 }],
    files: [
      { path: '/deck.json', content: '{"title":"Deck"}' },
      { path: '/slides/01.html', content: '<h1>One</h1>' },
    ],
  };
}

beforeEach(async () => {
  globalThis.chrome = createMockChrome({
    storageData: { theme: 'dark', someSetting: true },
  }) as unknown as typeof chrome;
  await clearAllSlideProjects();
});

describe('backup includes Slide Creator', () => {
  test('plain export includes slide_project and slide_meta chunks', async () => {
    await saveSlideProject(makeProject('p1'), { preserveUpdatedAt: true });
    await saveSlideActivity('p1', []);
    const rounds: SlideRound[] = [{
      number: 1,
      label: 'Ready',
      createdAt: 3000,
      files: [{ path: '/slides/01.html', content: '<h1>One</h1>' }],
    }];
    await saveSlideRounds('p1', rounds, 0);
    await setLastActiveSlideProject('p1');

    const payload = await buildChunkedBackupPayload({ includeApiKeys: false });
    expect(payload.version).toBe(3);
    expect(payload.meta.slideProjectCount).toBe(1);
    expect(payload.chunks.some((c) => c.type === 'slide_project' && c.id === 'p1')).toBe(true);
    expect(payload.chunks.some((c) => c.type === 'slide_meta')).toBe(true);

    const projectChunk = payload.chunks.find((c) => c.type === 'slide_project')!;
    const parsed = JSON.parse(projectChunk.data);
    expect(parsed.files).toHaveLength(2);
    expect(parsed.rounds).toHaveLength(1);

    const metaChunk = payload.chunks.find((c) => c.type === 'slide_meta')!;
    expect(JSON.parse(metaChunk.data).lastActiveProjectId).toBe('p1');
  });

  test('empty slide DB still emits slide_meta so restore can wipe', async () => {
    const payload = await buildChunkedBackupPayload({ includeApiKeys: false });
    expect(payload.meta.slideProjectCount).toBe(0);
    expect(payload.chunks.filter((c) => c.type === 'slide_project')).toHaveLength(0);
    expect(payload.chunks.some((c) => c.type === 'slide_meta')).toBe(true);
  });

  test('import restores slide projects from a new backup', async () => {
    await saveSlideProject(makeProject('p1'), { preserveUpdatedAt: true });
    await setLastActiveSlideProject('p1');
    const payload = await buildChunkedBackupPayload({ includeApiKeys: false });

    await clearAllSlideProjects();
    expect(await getSlideProject('p1')).toBeNull();

    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    await importData(file);

    const restored = await getSlideProject('p1');
    expect(restored?.title).toBe('Deck p1');
    expect(restored?.files[1]?.path).toBe('/slides/01.html');
    expect(await getLastActiveSlideProject()).toBe('p1');
  });

  test('encrypted export/import round-trips slide projects', async () => {
    await saveSlideProject(makeProject('enc'), { preserveUpdatedAt: true });
    await setLastActiveSlideProject('enc');
    const payload = await buildChunkedBackupPayload({
      includeApiKeys: false,
      password: 'secret-pass',
    });
    expect(payload.encrypted).toBe(true);
    const projectChunk = payload.chunks.find((c) => c.type === 'slide_project')!;
    expect(projectChunk.iv).toBeTruthy();
    expect(() => JSON.parse(projectChunk.data)).toThrow();

    await clearAllSlideProjects();
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    await importData(file, { password: 'secret-pass' });
    expect((await getSlideProject('enc'))?.id).toBe('enc');
    expect(await getLastActiveSlideProject()).toBe('enc');
  });

  test('legacy backup without slide chunks does not clear existing decks', async () => {
    await saveSlideProject(makeProject('keep-me'), { preserveUpdatedAt: true });
    const payload = await buildChunkedBackupPayload({ includeApiKeys: false });
    payload.chunks = payload.chunks.filter(
      (c) => c.type !== 'slide_project' && c.type !== 'slide_meta',
    );
    delete payload.meta.slideProjectCount;

    const file = new File([JSON.stringify(payload)], 'legacy.json', { type: 'application/json' });
    await importData(file);
    expect((await getSlideProject('keep-me'))?.id).toBe('keep-me');
  });
});
