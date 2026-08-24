import { describe, test, expect } from 'bun:test';
import {
  applyDiff,
  deriveNewContents,
  parseApplyPatch,
  parseUpdateChunks,
  seekSequence,
  type UpdateFileChunk,
} from '../../src/utils/applyDiff.ts';

describe('seekSequence', () => {
  test('exact match returns start index at or after start', () => {
    const lines = ['foo', 'bar', 'baz'];
    expect(seekSequence(lines, ['bar', 'baz'], 0, false)).toBe(1);
  });

  test('rstrip match tolerates trailing whitespace', () => {
    expect(seekSequence(['foo   ', 'bar\t\t'], ['foo', 'bar'], 0, false)).toBe(0);
  });

  test('trim match tolerates leading and trailing whitespace', () => {
    expect(seekSequence(['    foo   ', '   bar\t'], ['foo', 'bar'], 0, false)).toBe(0);
  });

  test('normalised match tolerates typographic punctuation', () => {
    expect(seekSequence(['font-size: 48px;'], ['font-size: 48px;'], 0, false)).toBe(0);
  });

  test('pattern longer than input returns null without panicking', () => {
    expect(seekSequence(['one'], ['two', 'three'], 0, false)).toBeNull();
  });

  test('empty pattern returns the start index', () => {
    expect(seekSequence(['a', 'b'], [], 1, false)).toBe(1);
  });

  test('eof anchors search to the end of file', () => {
    const lines = ['a', 'b', 'c', 'd'];
    expect(seekSequence(lines, ['c', 'd'], 0, true)).toBe(2);
  });
});

describe('applyDiff create (mode: create)', () => {
  test('creates a full multi-line file from + lines (with optional @@ header)', () => {
    const diff = '@@\n+<section class="slide">\n+  <h1>Hook</h1>\n+</section>\n';
    expect(applyDiff('', diff, 'create')).toEqual({
      ok: true,
      text: '<section class="slide">\n  <h1>Hook</h1>\n</section>\n',
    });
  });

  test('creates from + lines without @@ (OpenAI SDK create shape)', () => {
    expect(applyDiff('', '+# Title\n+- bullet\n+body\n', 'create')).toEqual({
      ok: true,
      text: '# Title\n- bullet\nbody\n',
    });
  });

  test('accepts bare raw body when no + prefixes (first-try recovery)', () => {
    const bare = '# Single-Origin Ethiopian Blend — Slide Brief\n\n## Slide 01\n- Hook line\n';
    expect(applyDiff('', bare, 'create')).toEqual({
      ok: true,
      text: bare.endsWith('\n') ? bare : bare + '\n',
    });
  });

  test('accepts bare body after a stray @@ header', () => {
    const res = applyDiff(
      '',
      '@@\n# Single-Origin Ethiopian Blend — Slide Brief\n- item\n',
      'create',
    );
    expect(res).toEqual({
      ok: true,
      text: '# Single-Origin Ethiopian Blend — Slide Brief\n- item\n',
    });
  });

  test('recovers mixed + and bare content lines (model dropped + on a line)', () => {
    const res = applyDiff('', '+# Title\nplain line without plus\n', 'create');
    expect(res).toEqual({ ok: true, text: '# Title\nplain line without plus\n' });
  });

  test('recovers when the arrow line loses its + prefix', () => {
    const diff =
      '+# Design\n+\n+## Color Palette\n' +
      '+  - `primary`: #6f4e37\n' +
      '  - `gradient shape`: primary `#6f4e37` \u2192 cream `#F7F2EC`, diagonal\n' +
      '+  - `accent`: #E8A33D\n';
    const res = applyDiff('', diff, 'create');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text).toContain('`gradient shape`: primary `#6f4e37` \u2192 cream `#F7F2EC`');
  });

  test('rejects an empty create diff', () => {
    expect(applyDiff('', '', 'create')).toEqual({ ok: false, error: 'Error: empty diff' });
    expect(applyDiff('', '@@\n', 'create')).toEqual({ ok: false, error: 'Error: empty diff' });
  });

  test('default mode still rejects empty update diffs', () => {
    expect(applyDiff('existing', '')).toEqual({ ok: false, error: 'Error: empty diff' });
    expect(applyDiff('existing', '@@\n')).toEqual({ ok: false, error: 'Error: empty diff' });
  });
});

describe('applyDiff update (patch existing with context)', () => {
  const css = '.title {\n  font-size: 48px;\n  color: #333;\n}\n';

  test('removes and inserts around matching context', () => {
    const res = applyDiff(css, '@@\n-  font-size: 48px;\n+  font-size: 64px;\n');
    expect(res).toEqual({ ok: true, text: '.title {\n  font-size: 64px;\n  color: #333;\n}\n' });
  });

  test('keeps context lines that are present', () => {
    const res = applyDiff(css, '@@\n .title {\n-  font-size: 48px;\n+  font-size: 32px;\n');
    expect(res).toEqual({ ok: true, text: '.title {\n  font-size: 32px;\n  color: #333;\n}\n' });
  });

  test('inserts a new line using a context anchor', () => {
    const res = applyDiff(css, '@@\n   color: #333;\n+  line-height: 1.4;\n }\n');
    expect(res).toEqual({ ok: true, text: '.title {\n  font-size: 48px;\n  color: #333;\n  line-height: 1.4;\n}\n' });
  });

  test('appends a line at the end anchored on final context', () => {
    const res = applyDiff(css, '@@\n }\n+  outline: none;\n');
    expect(res).toEqual({ ok: true, text: css + '  outline: none;\n' });
  });

  test('applies multiple httunks sequentially', () => {
    const diff =
      '@@\n-  font-size: 48px;\n+  font-size: 20px;\n' +
      '@@\n-  color: #333;\n+  color: #181818;\n';
    const res = applyDiff(css, diff);
    expect(res).toEqual({ ok: true, text: '.title {\n  font-size: 20px;\n  color: #181818;\n}\n' });
  });

  test('removes a whole line', () => {
    const res = applyDiff(css, '@@\n-  color: #333;\n');
    expect(res).toEqual({ ok: true, text: '.title {\n  font-size: 48px;\n}\n' });
  });

  test('matches tolerantly when the file has trailing whitespace', () => {
    const res = applyDiff('.title {\n  font-size: 48px;  \n}\n', '@@\n-  font-size: 48px;\n+  font-size: 60px;\n');
    expect(res.ok).toBe(true);
  });

  test('uses a change-context (@@ heading) to locate the chunk', () => {
    const file = 'h1 { color: red; }\n\n.title {\n  font-size: 48px;\n}\n\np { color: blue; }\n';
    const diff = '@@ .title {\n-  font-size: 48px;\n+  font-size: 72px;\n';
    const res = applyDiff(file, diff);
    expect(res).toEqual({ ok: true, text: 'h1 { color: red; }\n\n.title {\n  font-size: 72px;\n}\n\np { color: blue; }\n' });
  });

  test('patches a file that has no trailing newline (normalises output)', () => {
    const single = '.foo {\n  color: red;\n}';
    const res = applyDiff(single, '@@\n-  color: red;\n+  color: blue;\n');
    expect(res).toEqual({ ok: true, text: '.foo {\n  color: blue;\n}\n' });
  });

  test('updates a single-line deck.json by substring match (regression)', () => {
    // The deck.json is a single line with an em dash. The build agent keeps
    // failing to update it because it matches only the changing fragment (a
    // substring), not the whole line. Substring matching must resolve it.
    const deck = '{"title":"Nexifle \u2014 Instagram Launch","canvas":"4:5"}';
    const ok = applyDiff(
      deck,
      '@@\n-"canvas":"4:5"}\n+"canvas":"4:5","theme":"/theme.css","slideOrder":["01"]}\n',
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.text).toBe(
        '{"title":"Nexifle \u2014 Instagram Launch","canvas":"4:5","theme":"/theme.css","slideOrder":["01"]}\n',
      );
    }
  });

  test('matches a full-line deck.json diff even with a different dash codepoint (regression)', () => {
    // Models emit various dash Unicode codepoints; normalize must fold them so
    // a full-line replace succeeds regardless of which dash variant is used.
    const deck = '{"title":"Nexifle \u2014 Instagram Launch","canvas":"4:5"}';
    const fullwidthDash = '{"title":"Nexifle \uFF0D Instagram Launch","canvas":"4:5"}';
    const res = applyDiff(
      deck,
      `@@\n-${fullwidthDash}\n+{"title":"Nexifle \u2014 Instagram Launch","canvas":"4:5","theme":"/theme.css","slideOrder":["01"]}\n`,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.text).toBe(
        '{"title":"Nexifle \u2014 Instagram Launch","canvas":"4:5","theme":"/theme.css","slideOrder":["01"]}\n',
      );
    }
  });
});

describe('applyDiff failure on bad context', () => {
  const css = '.title {\n  font-size: 48px;\n}\n';

  test('fails when removal context is not present', () => {
    const res = applyDiff(css, '@@\n-  font-family: serif;\n+  font-family: sans;\n');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('Failed to find');
  });

  test('fails when a referenced context heading is not present', () => {
    const res = applyDiff(css, '@@ .does-not-exist {\n-  font-size: 48px;\n+  color: red;\n');
    expect(res.ok).toBe(false);
  });

  test('rejects an unknown diff line', () => {
    const res = applyDiff(css, '@@\nBOGUS LINE\n');
    expect(res.ok).toBe(false);
  });
});

describe('parseApplyPatch (full Codex format)', () => {
  test('parses Add File hunk into contents', () => {
    const patch = '*** Begin Patch\n*** Add File: bar.md\n+hi\n+there\n*** End Patch';
    const parsed = parseApplyPatch(patch);
    expect(parsed.hunks).toEqual([{ kind: 'AddFile', path: 'bar.md', contents: 'hi\nthere\n' }]);
  });

  test('parses Delete File hunk', () => {
    const patch = '*** Begin Patch\n*** Delete File: gone.txt\n*** End Patch';
    expect(parseApplyPatch(patch).hunks).toEqual([{ kind: 'DeleteFile', path: 'gone.txt' }]);
  });

  test('parses Update File hunk with chunks', () => {
    const patch =
      '*** Begin Patch\n*** Update File: file.py\n@@ def f():\n-    pass\n+    return 123\n*** End Patch';
    const parsed = parseApplyPatch(patch);
    expect(parsed.hunks).toEqual([
      {
        kind: 'UpdateFile',
        path: 'file.py',
        chunks: [
          {
            changeContext: 'def f():',
            oldLines: ['    pass'],
            newLines: ['    return 123'],
            isEndOfFile: false,
          },
        ],
      },
    ]);
  });

  test('parses multiple hunks and a Move to header', () => {
    const patch =
      '*** Begin Patch\n' +
      '*** Update File: old.txt\n*** Move to: new.txt\n@@\n-old\n+new\n' +
      '*** Add File: other.txt\n+content\n' +
      '*** End Patch';
    const parsed = parseApplyPatch(patch);
    expect(parsed.hunks).toHaveLength(2);
    const upd = parsed.hunks[0];
    expect(upd.kind).toBe('UpdateFile');
    if (upd.kind === 'UpdateFile') {
      expect(upd.movePath).toBe('new.txt');
      expect(upd.chunks).toEqual([
        { changeContext: null, oldLines: ['old'], newLines: ['new'], isEndOfFile: false },
      ]);
    }
    expect(parsed.hunks[1]).toEqual({ kind: 'AddFile', path: 'other.txt', contents: 'content\n' });
  });

  test('captures an environment id preamble', () => {
    const patch =
      '*** Begin Patch\n*** Environment ID: remote\n*** Add File: hello.txt\n+hello\n*** End Patch';
    expect(parseApplyPatch(patch).environmentId).toBe('remote');
  });

  test('rejects a patch without End Patch', () => {
    expect(() => parseApplyPatch('*** Begin Patch\n*** Add File: a.txt\n+hi\n')).toThrow();
  });

  test('rejects content after End Patch', () => {
    expect(() =>
      parseApplyPatch('*** Begin Patch\n*** Add File: a.txt\n+hi\n*** End Patch\nextra\n'),
    ).toThrow("The last line of the patch must be '*** End Patch'");
  });

  test('rejects an empty Update File hunk', () => {
    expect(() => parseApplyPatch('*** Begin Patch\n*** Update File: a.txt\n*** End Patch')).toThrow(
      "Update file hunk for path 'a.txt' is empty",
    );
  });
});

describe('deriveNewContents', () => {
  test('appends a line at the end of file marker', () => {
    const chunks: UpdateFileChunk[] = [
      { changeContext: null, oldLines: [], newLines: ['quux'], isEndOfFile: true },
    ];
    expect(deriveNewContents('foo\nbar\nbaz\n', chunks)).toEqual({
      ok: true,
      text: 'foo\nbar\nbaz\nquux\n',
    });
  });

  test('replaces the last line of a file', () => {
    const chunks: UpdateFileChunk[] = [
      {
        changeContext: null,
        oldLines: ['baz'],
        newLines: ['BAZ'],
        isEndOfFile: true,
      },
    ];
    expect(deriveNewContents('foo\nbar\nbaz\n', chunks)).toEqual({ ok: true, text: 'foo\nbar\nBAZ\n' });
  });

  test('reports a structured error on a bad context', () => {
    const chunks: UpdateFileChunk[] = [
      { changeContext: null, oldLines: ['nope'], newLines: ['yep'], isEndOfFile: false },
    ];
    const res = deriveNewContents('foo\nbar\n', chunks, '/deck.json');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('/deck.json');
  });
});

describe('parseUpdateChunks', () => {
  test('parses a bare diff into chunks', () => {
    const chunks = parseUpdateChunks('@@\n-  a;\n+  b;\n@@\n .title {\n-  c;\n');
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ changeContext: null, oldLines: ['  a;'], newLines: ['  b;'], isEndOfFile: false });
    expect(chunks[1]).toEqual({
      changeContext: null,
      oldLines: ['.title {', '  c;'],
      newLines: ['.title {'],
      isEndOfFile: false,
    });
  });
});
