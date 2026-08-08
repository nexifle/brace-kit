import { describe, test, expect } from 'bun:test';
import type { SlideFile } from '../../src/types/index.ts';
import {
  applyPatchOperation,
  allowlistForPhase,
  parseApplyPatchArgs,
  type SlidePatchOperation,
} from '../../src/services/applyPatchHarness.ts';

function files(initial: Record<string, string>): SlideFile[] {
  return Object.entries(initial).map(([path, content]) => ({ path, content }));
}

function toMap(fs: SlideFile[]): Record<string, string> {
  return Object.fromEntries(fs.map((f) => [f.path, f.content]));
}

describe('parseApplyPatchArgs', () => {
  test('accepts flat args (preferred function-tool shape)', () => {
    const res = parseApplyPatchArgs({
      type: 'create_file',
      path: '/brief.md',
      diff: '+# Title\n',
    });
    expect(res).toEqual({
      ok: true,
      operation: { type: 'create_file', path: '/brief.md', diff: '+# Title\n' },
    });
  });

  test('accepts nested operation object (legacy / OpenAI docs shape)', () => {
    const res = parseApplyPatchArgs({
      operation: { type: 'update_file', path: '/design.md', diff: '@@\n-a\n+b\n' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.operation).toEqual({
      type: 'update_file',
      path: '/design.md',
      diff: '@@\n-a\n+b\n',
    });
  });

  test('accepts stringified nested operation', () => {
    const res = parseApplyPatchArgs({
      operation: JSON.stringify({ type: 'delete_file', path: '/slides/01.html' }),
    });
    expect(res).toEqual({
      ok: true,
      operation: { type: 'delete_file', path: '/slides/01.html' },
    });
  });

  test('accepts stringified whole payload', () => {
    const res = parseApplyPatchArgs(
      JSON.stringify({ type: 'create_file', path: '/deck.json', diff: '+{}\n' }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.operation.type).toBe('create_file');
  });

  test('accepts mis-nested operation as type string', () => {
    const res = parseApplyPatchArgs({
      operation: 'create_file',
      path: '/brief.md',
      diff: '+x\n',
    });
    expect(res).toEqual({
      ok: true,
      operation: { type: 'create_file', path: '/brief.md', diff: '+x\n' },
    });
  });

  test('fails clearly when type/path missing', () => {
    const res = parseApplyPatchArgs({ path: '/brief.md', diff: '+x\n' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain('type');
  });
});

describe('applyPatchHarness allowlists', () => {
  test('plan allowlist is brief/design only (deck.json is code-owned)', () => {
    const a = allowlistForPhase('plan');
    expect(a).toContain('/brief.md');
    expect(a).toContain('/design.md');
    expect(a).not.toContain('/deck.json');
    expect(a).not.toContain('/theme.css');
  });

  test('build allowlist is theme/slides only (deck.json is code-owned)', () => {
    const a = allowlistForPhase('build');
    expect(a).not.toContain('/deck.json');
    expect(a).toContain('/theme.css');
    expect(a).toContain('/slides/');
    expect(a).not.toContain('/brief.md');
  });

  test('edit allowlist adds brief/design on top of build', () => {
    const a = allowlistForPhase('edit');
    expect(a).toContain('/slides/');
    expect(a).toContain('/theme.css');
    expect(a).toContain('/brief.md');
    expect(a).toContain('/design.md');
  });

  test('main phase cannot patch anything', () => {
    expect(allowlistForPhase('main')).toEqual([]);
  });

  test('deck.json is not writable in any phase (code-owned)', () => {
    for (const phase of ['plan', 'build', 'edit'] as const) {
      const res = applyPatchOperation([], phase, {
        type: 'create_file',
        path: '/deck.json',
        diff: '+{}\n',
      });
      expect(res.status).toBe('failed');
      if (res.status === 'failed') expect(res.output).toContain('/deck.json');
    }
  });
});

describe('applyPatchHarness create_file', () => {
  test('creates a file from a V4A diff of + lines', () => {
    const res = applyPatchOperation([], 'build', {
      type: 'create_file',
      path: '/slides/01.html',
      diff: '@@\n+<section class="slide">\n+  <h1>Hook</h1>\n+</section>\n',
    });
    expect(res.status).toBe('completed');
    if (res.status !== 'completed') return;
    expect(res.output).toContain('Created');
    expect(res.files).toHaveLength(1);
    expect(res.files[0].content).toContain('<h1>Hook</h1>');
  });

  test('creates a file from bare content without + prefixes (model first-try)', () => {
    const res = applyPatchOperation([], 'plan', {
      type: 'create_file',
      path: '/brief.md',
      diff: '# Single-Origin Ethiopian Blend — Slide Brief\n\n## Slide 01\n- Hook\n',
    });
    expect(res.status).toBe('completed');
    if (res.status !== 'completed') return;
    expect(res.files[0].content).toContain('# Single-Origin Ethiopian Blend — Slide Brief');
    expect(res.files[0].content).toContain('- Hook');
  });

  test('creates from + lines only (OpenAI create shape, no @@)', () => {
    const res = applyPatchOperation([], 'plan', {
      type: 'create_file',
      path: '/design.md',
      diff: '+# Design\n+Palette: dark\n',
    });
    expect(res.status).toBe('completed');
    if (res.status !== 'completed') return;
    expect(res.files[0].content).toBe('# Design\nPalette: dark\n');
  });

  test('fails when create_file targets an existing path', () => {
    const res = applyPatchOperation(
      files({ '/slides/01.html': '<section>old</section>\n' }),
      'edit',
      { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<p>new</p>\n' },
    );
    expect(res.status).toBe('failed');
    if (res.status !== 'failed') return;
    expect(res.output).toContain('already exists');
  });

  test('fails when create_file has no diff', () => {
    const res = applyPatchOperation(files({}), 'build', {
      type: 'create_file',
      path: '/slides/01.html',
      diff: '',
    });
    expect(res.status).toBe('failed');
  });
});

describe('applyPatchHarness update_file', () => {
  test('updates a file with matching context', () => {
    const fs = files({ '/slides/01.css': 'h1 {\n  font-size: 48px;\n}\n' });
    const res = applyPatchOperation(fs, 'build', {
      type: 'update_file',
      path: '/slides/01.css',
      diff: '@@\n-  font-size: 48px;\n+  font-size: 64px;\n',
    });
    expect(res.status).toBe('completed');
    if (res.status !== 'completed') return;
    expect(res.output).toBe('Updated /slides/01.css');
    expect(toMap(res.files)['/slides/01.css']).toContain('font-size: 64px');
    expect(toMap(fs)['/slides/01.css']).toContain('font-size: 48px'); // input not mutated
  });

  test('fails when update_file targets a missing path', () => {
    const res = applyPatchOperation(files({}), 'build', {
      type: 'update_file',
      path: '/slides/02.css',
      diff: '@@\n-foo\n+bar\n',
    });
    expect(res.status).toBe('failed');
    if (res.status !== 'failed') return;
    expect(res.output).toContain('File not found');
  });

  test('fails on bad context (nothing matches)', () => {
    const fs = files({ '/design.md': 'Topic: A\n' });
    const res = applyPatchOperation(fs, 'plan', {
      type: 'update_file',
      path: '/design.md',
      diff: '@@\n-This line does not exist\n+Nope\n',
    });
    expect(res.status).toBe('failed');
    if (res.status !== 'failed') return;
    expect(res.output.toLowerCase()).toContain('context');
    expect(toMap(fs)['/design.md']).toBe('Topic: A\n'); // unchanged on failure
  });
});

describe('applyPatchHarness delete_file', () => {
  test('deletes an existing file', () => {
    const res = applyPatchOperation(files({ '/slides/03.html': '<p>x</p>\n' }), 'build', {
      type: 'delete_file',
      path: '/slides/03.html',
    });
    expect(res.status).toBe('completed');
    if (res.status !== 'completed') return;
    expect(res.output).toContain('Deleted');
    expect(res.files).toHaveLength(0);
  });

  test('fails when delete_file targets a missing path', () => {
    const res = applyPatchOperation(files({}), 'build', {
      type: 'delete_file',
      path: '/slides/99.html',
    });
    expect(res.status).toBe('failed');
    if (res.status !== 'failed') return;
    expect(res.output).toContain('File not found');
  });
});

describe('applyPatchHarness path & phase guards', () => {
  test('rejects traversal paths in every phase', () => {
    const res = applyPatchOperation(files({}), 'build', {
      type: 'create_file',
      path: '/../../etc/passwd',
      diff: '@@\n+x\n',
    });
    expect(res.status).toBe('failed');
    if (res.status !== 'failed') return;
    expect(res.output.toLowerCase()).toContain('invalid path');
  });

  test('rejects phase disallowed paths', () => {
    const planWriteSlide = applyPatchOperation(files({}), 'plan', {
      type: 'create_file',
      path: '/slides/01.html',
      diff: '@@\n+<section></section>\n',
    });
    expect(planWriteSlide.status).toBe('failed');
    if (planWriteSlide.status !== 'failed') return;
    expect(planWriteSlide.output).toContain('not allowed in plan phase');

    const buildWriteBrief = applyPatchOperation(files({}), 'build', {
      type: 'update_file',
      path: '/brief.md',
      diff: '@@\n+x\n+y\n',
    });
    expect(buildWriteBrief.status).toBe('failed');
    if (buildWriteBrief.status !== 'failed') return;
    expect(buildWriteBrief.output).toContain('not allowed in build phase');
  });

  test('rejects an unknown default phase', () => {
    const res = applyPatchOperation(files({}), 'main', {
      type: 'create_file',
      path: '/design.md',
      diff: '@@\n+x\n',
    });
    expect(res.status).toBe('failed');
  });
});
