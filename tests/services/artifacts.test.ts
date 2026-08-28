import { describe, expect, test } from 'bun:test';
import { artifactFor } from '../../src/services/artifacts/index.ts';
import { normalizeBuilderKind } from '../../src/types/slides.ts';

describe('artifactFor', () => {
  test('slides never uses site verification', () => {
    const a = artifactFor('slides');
    expect(a.skillPack).toBe('slides');
    const empty = a.verify([]);
    expect(empty.ok).toBe(false);
    expect(empty.issues.join('\n')).toContain('slideOrder');
  });

  test('site never uses deck.json verification', () => {
    const a = artifactFor('site');
    expect(a.skillPack).toBe('web');
    const withPage = a.verify([
      { path: '/pages/index.html', content: '<h1>Home</h1>' },
    ]);
    expect(withPage.ok).toBe(true);
    expect(withPage.issues).toEqual([]);
    const empty = a.verify([]);
    expect(empty.ok).toBe(false);
    expect(empty.issues.join('\n')).not.toContain('slideOrder');
    expect(empty.issues.join('\n')).toContain('/pages');
  });

  test('build kickoff copy is kind-owned', () => {
    expect(artifactFor('slides').buildKickoffInstruction).toContain('deck');
    expect(artifactFor('site').buildKickoffInstruction).toContain('site');
    expect(artifactFor(normalizeBuilderKind('landing')).kind).toBe('site');
    expect(normalizeBuilderKind('landing')).toBe('site');
  });

  test('sync writes the kind-owned manifest only', () => {
    const siteFiles = artifactFor('site').sync(
      [{ path: '/pages/index.html', content: '<h1>x</h1>' }],
      { title: 'Launch' },
    );
    expect(siteFiles.some((f) => f.path === '/site.json')).toBe(true);
    expect(siteFiles.some((f) => f.path === '/deck.json')).toBe(false);

    const deckFiles = artifactFor('slides').sync(
      [{ path: '/slides/01.html', content: '<h1>x</h1>' }],
      { title: 'Deck' },
    );
    expect(deckFiles.some((f) => f.path === '/deck.json')).toBe(true);
    expect(deckFiles.some((f) => f.path === '/site.json')).toBe(false);
  });
});
