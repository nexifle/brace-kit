import { describe, expect, test } from 'bun:test';
import {
  composePageHtml,
  rebuildSiteProjection,
  syncSiteJson,
} from '../../src/utils/siteVfs.ts';
import { applyPatchOperation } from '../../src/services/applyPatchHarness.ts';

describe('site VFS', () => {
  test('rebuilds pages from /pages html even without site.json', () => {
    const site = rebuildSiteProjection(
      [
        { path: '/pages/index.html', content: '<h1>Home</h1>' },
        { path: '/pages/about.html', content: '<h1>About</h1>' },
      ],
      'site',
    );
    expect(site.kind).toBe('site');
    expect(site.pages.map((p) => p.path).sort()).toEqual(['/', '/about']);
  });

  test('syncSiteJson writes /site.json', () => {
    const files = syncSiteJson(
      [{ path: '/pages/index.html', content: '<h1>Hi</h1>' }],
      'site',
      'Launch',
    );
    const json = files.find((f) => f.path === '/site.json')?.content;
    expect(json).toBeTruthy();
    const parsed = JSON.parse(json!);
    expect(parsed.kind).toBe('site');
    expect(parsed.title).toBe('Launch');
  });

  test('composePageHtml inlines theme and scripts', () => {
    const html = composePageHtml(
      [
        { path: '/pages/index.html', content: '<main>Hi</main>' },
        { path: '/theme.css', content: 'body{color:red}' },
        { path: '/scripts/nav.js', content: 'console.log(1)' },
      ],
      { id: 'index', path: '/', htmlPath: '/pages/index.html' },
      {
        kind: 'site',
        title: 'T',
        home: '/pages/index.html',
        pages: [{ id: 'index', path: '/', htmlPath: '/pages/index.html' }],
        theme: '/theme.css',
        scripts: ['/scripts/nav.js'],
      },
    );
    expect(html).toContain('data-builder-theme');
    expect(html).toContain('console.log(1)');
    expect(html).toContain('<main>Hi</main>');
  });
});

describe('apply_patch kind allowlists', () => {
  test('site build can write /pages and /site.json', () => {
    const res = applyPatchOperation(
      [],
      'build',
      { type: 'create_file', path: '/pages/index.html', diff: '+<h1>x</h1>\n' },
      'site',
    );
    expect(res.status).toBe('completed');
  });

  test('site build cannot write /slides', () => {
    const res = applyPatchOperation(
      [],
      'build',
      { type: 'create_file', path: '/slides/01.html', diff: '+<h1>x</h1>\n' },
      'site',
    );
    expect(res.status).toBe('failed');
  });

  test('slides build cannot write /pages', () => {
    const res = applyPatchOperation(
      [],
      'build',
      { type: 'create_file', path: '/pages/index.html', diff: '+<h1>x</h1>\n' },
      'slides',
    );
    expect(res.status).toBe('failed');
  });
});
