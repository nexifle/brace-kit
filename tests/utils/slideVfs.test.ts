import { describe, test, expect } from 'bun:test';
import type { SlideFile } from '../../src/types/index.ts';
import {
  DEFAULT_SLIDE_CANVAS,
} from '../../src/types/index.ts';
import {
  normalizeSlidePath,
  isValidSlidePath,
  safeSlidePath,
  MAX_SLIDE_FILE_BYTES,
  isSlideFileOverLimit,
  slidesToMap,
  slideMapToFiles,
  getSlideFile,
  upsertSlideFile,
  removeSlideFile,
  rebuildDeckProjection,
  deckSlideCount,
  projectDeckSlides,
  slideHtmlPath,
  composeSlideHtml,
  validateDeckJson,
  formatDeckJsonIssues,
  hasHardDeckJsonErrors,
  verifyDeck,
  syncDeckJson,
  naturalCompare,
  reorderSlideFiles,
} from '../../src/utils/slideVfs.ts';


describe('slideVfs path rules', () => {
  test('normalize ensures leading slash and collapses slashes', () => {
    expect(normalizeSlidePath('slides/01.html')).toBe('/slides/01.html');
    expect(normalizeSlidePath('/brief.md')).toBe('/brief.md');
    expect(normalizeSlidePath('/slides//01.html')).toBe('/slides/01.html');
    expect(normalizeSlidePath('/theme.css/')).toBe('/theme.css');
  });

  test('normalize returns empty for non-string or empty input', () => {
    expect(normalizeSlidePath('')).toBe('');
    expect(normalizeSlidePath('   ')).toBe('');
  });

  test('accepts valid absolute project paths', () => {
    expect(isValidSlidePath('/brief.md')).toBe(true);
    expect(isValidSlidePath('/design.md')).toBe(true);
    expect(isValidSlidePath('/deck.json')).toBe(true);
    expect(isValidSlidePath('/theme.css')).toBe(true);
    expect(isValidSlidePath('/slides/01.html')).toBe(true);
    expect(isValidSlidePath('/slides/02.css')).toBe(true);
  });

  test('rejects traversal attempts', () => {
    expect(isValidSlidePath('/../secret')).toBe(false);
    expect(isValidSlidePath('../secret')).toBe(false);
    expect(isValidSlidePath('/slides/../../etc/passwd')).toBe(false);
    expect(isValidSlidePath('a/../../b')).toBe(false);
    expect(isValidSlidePath('/a/./b')).toBe(false);
  });

  test('rejects empty, root-as-file, and malformed paths', () => {
    expect(isValidSlidePath('')).toBe(false);
    expect(isValidSlidePath('/')).toBe(false);
    expect(isValidSlidePath('.')).toBe(false);
    expect(isValidSlidePath('..')).toBe(false);
    expect(isValidSlidePath('/a\\b')).toBe(false);
  });

  test('safeSlidePath returns canonical or null', () => {
    expect(safeSlidePath('/slides/01.html')).toBe('/slides/01.html');
    expect(safeSlidePath('slides/01.html')).toBe('/slides/01.html');
    expect(safeSlidePath('../escape')).toBeNull();
  });
});

describe('slideVfs size caps', () => {
  test('MAX_SLIDE_FILE_BYTES is documented and finite', () => {
    expect(MAX_SLIDE_FILE_BYTES).toBeGreaterThan(0);
  });

  test('empty and small content are under the limit', () => {
    expect(isSlideFileOverLimit('')).toBe(false);
    expect(isSlideFileOverLimit('hello')).toBe(false);
    expect(isSlideFileOverLimit('x'.repeat(1000))).toBe(false);
  });

  test('content at/over the byte limit is flagged', () => {
    expect(isSlideFileOverLimit('x'.repeat(MAX_SLIDE_FILE_BYTES + 1))).toBe(true);
    expect(isSlideFileOverLimit('<section>'.repeat(200000))).toBe(true);
  });
});

describe('slideVfs file map helpers', () => {
  const base: SlideFile[] = [
    { path: '/brief.md', content: '# Brief' },
    { path: '/slides/01.html', content: '<section>1</section>' },
    { path: '/slides/01.css', content: 'section{}' },
  ];

  test('slidesToMap preserves content by safe path', () => {
    const map = slidesToMap(base);
    expect(map.get('/brief.md')).toBe('# Brief');
    expect(map.get('/slides/01.html')).toBe('<section>1</section>');
  });

  test('slideMapToFiles round-trips', () => {
    const map = slidesToMap(base);
    const files = slideMapToFiles(map);
    expect(files).toHaveLength(base.length);
    expect(slidesToMap(files)).toEqual(map);
  });

  test('getSlideFile finds by safe path, ignores unsafe path', () => {
    expect(getSlideFile(base, '/slides/01.html')?.content).toBe('<section>1</section>');
    expect(getSlideFile(base, '../bad')).toBeUndefined();
    expect(getSlideFile(base, '/missing.html')).toBeUndefined();
  });

  test('upsertSlideFile adds a new file immutably', () => {
    const next = upsertSlideFile(base, '/design.md', '# Design');
    expect(next).toHaveLength(base.length + 1);
    expect(base).toHaveLength(3); // original untouched
    expect(getSlideFile(next, '/design.md')?.content).toBe('# Design');
  });

  test('upsertSlideFile replaces existing content and normalizes path', () => {
    const next = upsertSlideFile(base, 'slides/01.html', '<section>updated</section>');
    expect(next).toHaveLength(3);
    expect(getSlideFile(next, '/slides/01.html')?.content).toBe('<section>updated</section>');
  });

  test('upsertSlideFile ignores unsafe paths', () => {
    expect(upsertSlideFile(base, '../evil', 'x')).toEqual(base);
  });

  test('removeSlideFile deletes and returns new array', () => {
    const next = removeSlideFile(base, '/slides/01.css');
    expect(next).toHaveLength(2);
    expect(getSlideFile(next, '/slides/01.css')).toBeUndefined();
    expect(base).toHaveLength(3);
  });
});

describe('rebuildDeckProjection', () => {
  const files: SlideFile[] = [
    { path: '/brief.md', content: '# Brief' },
    { path: '/design.md', content: '# Design' },
    {
      path: '/deck.json',
      content: JSON.stringify({
        title: 'Quarterly Opco Review',
        description: 'deck for leadership',
        canvas: '16:9',
        theme: '/theme.css',
        slideOrder: ['01', '02', 'ghost'],
      }),
    },
    { path: '/theme.css', content: ':root{}' },
    { path: '/slides/01.html', content: '<section>one</section>' },
    { path: '/slides/02.html', content: '<section>two</section>' },
    { path: '/slides/01.css', content: 'section{}' },
  ];

  test('happy path projects deck from deck.json and slide files', () => {
    const deck = rebuildDeckProjection(files);
    expect(deck.title).toBe('Quarterly Opco Review');
    expect(deck.description).toBe('deck for leadership');
    expect(deck.canvas).toBe('16:9');
    expect(deck.theme).toBe('/theme.css');
    // 'ghost' has no backing HTML file and is filtered out
    expect(deck.slideOrder).toEqual(['01', '02']);
  });

  test('deckSlideCount matches projected slideOrder length', () => {
    expect(deckSlideCount(files)).toBe(2);
    expect(
      deckSlideCount([
        { path: '/slides/01.html', content: '<h1>x</h1>' },
        // no deck.json → not projectable
      ]),
    ).toBe(0);
    expect(
      deckSlideCount([
        {
          path: '/deck.json',
          content: JSON.stringify({ slideOrder: ['01'], canvas: '16:9' }),
        },
        // order id without HTML → filtered
      ]),
    ).toBe(0);
  });

  test('missing or invalid deck.json degrades to empty deck without inventing canvas', () => {
    expect(rebuildDeckProjection([{ path: '/brief.md', content: 'hi' }])).toMatchObject({
      title: expect.any(String),
      canvas: null,
      slideOrder: [],
    });

    const bad = rebuildDeckProjection([
      { path: '/deck.json', content: '{ not valid json' },
    ]);
    expect(bad.slideOrder).toEqual([]);
    expect(bad.canvas).toBeNull();
  });

  test('invalid canvas preset becomes null — never invents a size', () => {
    const deck = rebuildDeckProjection([
      { path: '/deck.json', content: JSON.stringify({ canvas: '99:99', slideOrder: [] }) },
    ]);
    expect(deck.canvas).toBeNull();
  });


  test('theme only resolves when the referenced path exists', () => {
    const noTheme = rebuildDeckProjection([
      { path: '/deck.json', content: JSON.stringify({ theme: '/nope.css', slideOrder: [] }) },
    ]);
    expect(noTheme.theme).toBeUndefined();
  });
});

describe('projectDeckSlides', () => {
  const files: SlideFile[] = [
    {
      path: '/deck.json',
      content: JSON.stringify({ title: 'T', slideOrder: ['01', '02', 'ghost'] }),
    },
    { path: '/slides/01.html', content: '<section>one</section>' },
    { path: '/slides/01.css', content: 'section{}' },
    { path: '/slides/02.html', content: '<section>two</section>' },
  ];

  test('returns ordered slides with html/css paths, skipping ghosts', () => {
    const deck = rebuildDeckProjection(files);
    const slides = projectDeckSlides(files, deck);
    expect(slides.map((s) => s.id)).toEqual(['01', '02']);
    expect(slides[0].htmlPath).toBe(slideHtmlPath('01'));
    expect(slides[0].cssPath).toBe('/slides/01.css');
    expect(slides[1].cssPath).toBeUndefined();
  });
});

describe('composeSlideHtml', () => {
  const deck = { title: 'T', canvas: '16:9' as const, theme: '/theme.css', slideOrder: ['01'] };
  const slide = { id: '01', htmlPath: '/slides/01.html', cssPath: '/slides/01.css' };
  const one = { path: '/theme.css', content: '.deck-theme{--x:1}' };
  const slideCss = { path: '/slides/01.css', content: '#head{color:red}' };
  const slideHtml = { path: '/slides/01.html', content: '<section class="slide deck-theme"><h1>Hi</h1></section>' };

  test('inlines theme + slide css then markup', () => {
    const out = composeSlideHtml([one, slideCss, slideHtml], slide, deck);
    expect(out).toContain('<style>\n.deck-theme{--x:1}\n</style>');
    expect(out).toContain('<style>\n#head{color:red}\n</style>');
    expect(out).toContain('<section class="slide deck-theme"><h1>Hi</h1></section>');
    expect(out.indexOf('<style>')).toBeLessThan(out.indexOf('<section'));
  });

  test('omits missing theme and missing css gracefully', () => {
    const noTheme = { ...deck, theme: '/nope.css' };
    const out = composeSlideHtml([slideCss, slideHtml], slide, noTheme);
    expect(out).not.toContain('.deck-theme');
    expect(out).toContain('#head{color:red}');
    expect(out).toContain('<h1>Hi</h1>');
  });

  test('returns bare markup when no slide css and theme css present', () => {
    const out = composeSlideHtml([slideHtml], slide, deck);
    expect(out).toBe('<section class="slide deck-theme"><h1>Hi</h1></section>');
  });

  test('returns empty body when the slide html file is missing', () => {
    const out = composeSlideHtml([one, slideCss], slide, deck);
    expect(out).not.toContain('<section');
  });

  test('inlines /uploads image src on the slide', () => {
    const html = {
      path: '/slides/01.html',
      content: '<section><img src="/uploads/logo.jpg" alt=""></section>',
    };
    const upload = { path: '/uploads/logo.jpg', content: 'data:image/jpeg;base64,QQ' };
    const out = composeSlideHtml([one, slideCss, html, upload], slide, deck);
    expect(out).toContain('src="data:image/jpeg;base64,QQ"');
  });
});

function deckFiles(content: string): SlideFile[] {
  return [{ path: '/deck.json', content }];
}

const VALID_DECK =
  '{"title":"T","canvas":"16:9","theme":"/theme.css","slideOrder":["01","02"]}';

describe('validateDeckJson', () => {
  test('accepts a contract-valid deck.json', () => {
    const v = validateDeckJson(deckFiles(VALID_DECK));
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  test('accepts a deck.json with no theme and no title (graceful degradation)', () => {
    // Existing accepted behavior: title/theme are not gated; the projection degrades them.
    const v = validateDeckJson(deckFiles('{"canvas":"16:9","slideOrder":["01"]}'));
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  test('flags a missing deck.json as MISSING_DECK', () => {
    const v = validateDeckJson([]);
    expect(v.ok).toBe(false);
    expect(v.issues[0]?.code).toBe('MISSING_DECK');
  });

  test('flags malformed JSON as INVALID_JSON', () => {
    const v = validateDeckJson(deckFiles('{not json'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toEqual(['INVALID_JSON']);
  });

  test('flags a non-object JSON value as NOT_OBJECT', () => {
    const v = validateDeckJson(deckFiles('"a string"'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toEqual(['NOT_OBJECT']);
  });

  test('flags the forbidden aspect key as ASPECT_FORBIDDEN', () => {
    const v = validateDeckJson(
      deckFiles('{"title":"T","aspect":"16:9","canvas":"16:9","slideOrder":["01"]}'),
    );
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('ASPECT_FORBIDDEN');
  });

  test('flags underscore-form canvas as INVALID_CANVAS', () => {
    const v = validateDeckJson(deckFiles('{"canvas":"16_9","slideOrder":["01"]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toEqual(['INVALID_CANVAS']);
    expect(v.issues[0]?.message).toContain('16_9');
  });

  test('flags an object canvas as INVALID_CANVAS', () => {
    const v = validateDeckJson(deckFiles('{"canvas":{"width":1920,"height":1080},"slideOrder":["01"]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('INVALID_CANVAS');
  });

  test('flags a prototype-chain canvas key as INVALID_CANVAS', () => {
    const v = validateDeckJson(deckFiles('{"canvas":"toString","slideOrder":["01"]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('INVALID_CANVAS');
  });

  test('flags a missing canvas as INVALID_CANVAS', () => {
    const v = validateDeckJson(deckFiles('{"slideOrder":["01"]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toEqual(['INVALID_CANVAS']);
    expect(v.issues[0]?.message).toContain('required');
  });

  test('flags a missing or non-array slideOrder as INVALID_SLIDE_ORDER', () => {
    const v = validateDeckJson(deckFiles('{"canvas":"16:9","slideOrder":"01"}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('INVALID_SLIDE_ORDER');
  });

  test('rejects a theme value that is not an absolute path (INVALID_THEME)', () => {
    // A bare color keyword like "dark" is NOT a file path and must be rejected
    // so a plan phase can't land a deck.json the build phase can't consume.
    const v = validateDeckJson(deckFiles('{"title":"T","canvas":"16:9","theme":"dark","slideOrder":["01"]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('INVALID_THEME');
    expect(v.issues.find((i) => i.code === 'INVALID_THEME')?.severity).toBe('error');
  });

  test('accepts an absolute-path theme and a missing theme', () => {
    const withPath = validateDeckJson(deckFiles('{"title":"T","canvas":"16:9","theme":"/theme.css","slideOrder":["01"]}'));
    expect(withPath.ok).toBe(true);
    expect(withPath.issues.map((i) => i.code)).not.toContain('INVALID_THEME');

    const noTheme = validateDeckJson(deckFiles('{"title":"T","canvas":"16:9","slideOrder":["01"]}'));
    expect(noTheme.ok).toBe(true);
    expect(noTheme.issues.map((i) => i.code)).not.toContain('INVALID_THEME');
  });

  test('flags non-string slideOrder entries as INVALID_SLIDE_ORDER_ENTRY', () => {
    const v = validateDeckJson(deckFiles('{"canvas":"16:9","slideOrder":["01",2]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('INVALID_SLIDE_ORDER_ENTRY');
  });

  test('collects multiple independent violations', () => {
    const v = validateDeckJson(deckFiles('{"aspect":"x","canvas":"42:42","slideOrder":["01",{}]}'));
    const codes = v.issues.map((i) => i.code);
    expect(codes).toContain('ASPECT_FORBIDDEN');
    expect(codes).toContain('INVALID_CANVAS');
    expect(codes).toContain('INVALID_SLIDE_ORDER_ENTRY');
  });
});

describe('validateDeckJson severity classification', () => {
  test('present-but-wrong canvas is a hard error', () => {
    const v = validateDeckJson(deckFiles('{"canvas":"16_9","slideOrder":["01"]}'));
    expect(v.issues.find((i) => i.code === 'INVALID_CANVAS')?.severity).toBe('error');
    expect(hasHardDeckJsonErrors(v)).toBe(true);
  });

  test('missing canvas is a soft warning', () => {
    const v = validateDeckJson(deckFiles('{"slideOrder":["01"]}'));
    expect(v.issues.find((i) => i.code === 'INVALID_CANVAS')?.severity).toBe('warning');
    expect(hasHardDeckJsonErrors(v)).toBe(false);
  });

  test('present-but-not-array slideOrder is a hard error; missing slideOrder is a warning', () => {
    const present = validateDeckJson(deckFiles('{"canvas":"16:9","slideOrder":"01"}'));
    expect(present.issues.find((i) => i.code === 'INVALID_SLIDE_ORDER')?.severity).toBe('error');
    expect(hasHardDeckJsonErrors(present)).toBe(true);

    const missing = validateDeckJson(deckFiles('{"canvas":"16:9"}'));
    expect(missing.issues.find((i) => i.code === 'INVALID_SLIDE_ORDER')?.severity).toBe('warning');
    expect(hasHardDeckJsonErrors(missing)).toBe(false);
  });

  test('unknown field and aspect are advisory warnings; invalid JSON is a hard error', () => {
    // Extra top-level fields are allowed (projection ignores them) — advisory only.
    const unknown = validateDeckJson(deckFiles('{"canvas":"16:9","slideOrder":["01"],"slides":[]}'));
    expect(unknown.issues.find((i) => i.code === 'UNKNOWN_FIELD')?.severity).toBe('warning');
    expect(hasHardDeckJsonErrors(unknown)).toBe(false);

    const aspect = validateDeckJson(deckFiles('{"aspect":"16:9","canvas":"16:9","slideOrder":["01"]}'));
    expect(aspect.issues.find((i) => i.code === 'ASPECT_FORBIDDEN')?.severity).toBe('warning');
    expect(hasHardDeckJsonErrors(aspect)).toBe(false);

    const badJson = validateDeckJson(deckFiles('{ not json'));
    expect(badJson.issues[0]?.severity).toBe('error');
    expect(hasHardDeckJsonErrors(badJson)).toBe(true);
  });

  test('a contract-valid deck has no hard errors', () => {
    const v = validateDeckJson(deckFiles('{"title":"T","canvas":"16:9","theme":"/theme.css","slideOrder":["01"]}'));
    expect(v.ok).toBe(true);
    expect(hasHardDeckJsonErrors(v)).toBe(false);
  });
});

describe('validateDeckJson unknown-field gate', () => {
  test('accepts the optional description field', () => {
    const v = validateDeckJson(deckFiles('{"title":"T","description":"d","canvas":"16:9","slideOrder":["01"]}'));
    expect(v.ok).toBe(true);
  });

  test('flags an extra unknown top-level field as UNKNOWN_FIELD', () => {
    const v = validateDeckJson(deckFiles('{"title":"T","canvas":"16:9","slideOrder":["01"],"slides":[]}'));
    expect(v.ok).toBe(false);
    expect(v.issues.map((i) => i.code)).toContain('UNKNOWN_FIELD');
    expect(v.issues.find((i) => i.code === 'UNKNOWN_FIELD')?.message).toContain('slides');
  });

  test('does not double-report aspect (reported separately as ASPECT_FORBIDDEN)', () => {
    const v = validateDeckJson(deckFiles('{"title":"T","aspect":"16:9","canvas":"16:9","slideOrder":["01"]}'));
    const codes = v.issues.map((i) => i.code);
    expect(codes).toContain('ASPECT_FORBIDDEN');
    expect(codes).not.toContain('UNKNOWN_FIELD');
  });
});

describe('formatDeckJsonIssues', () => {
  test('joins issues as one "- " bullet per line', () => {
    const out = formatDeckJsonIssues([
      { code: 'A', message: 'first' },
      { code: 'B', message: 'second' },
    ]);
    expect(out).toBe('- first\n- second');
  });

  test('returns empty string for no issues', () => {
    expect(formatDeckJsonIssues([])).toBe('');
  });
});

describe('verifyDeck', () => {
  const validFiles = (): SlideFile[] => [
    {
      path: '/deck.json',
      content: JSON.stringify({ title: 'T', canvas: '16:9', theme: '/theme.css', slideOrder: ['01', '02'] }),
    },
    { path: '/theme.css', content: ':root{}' },
    { path: '/slides/01.html', content: '<section>one</section>' },
    { path: '/slides/01.css', content: 'section{}' },
    { path: '/slides/02.html', content: '<section>two</section>' },
    { path: '/slides/02.css', content: 'section{}' },
  ];

  test('valid deck → ok:true with no issues', () => {
    const r = verifyDeck(validFiles());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  test('dangling slideOrder id (missing HTML) → hard issue naming the id', () => {
    const files = validFiles().filter((f) => f.path !== '/slides/01.html');
    const r = verifyDeck(files);
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('01');
    expect(r.issues.join('\n')).toContain('/slides/01.html');
  });

  test('missing per-slide CSS → soft warning only, ok stays true', () => {
    const files = validFiles().filter((f) => f.path !== '/slides/02.css');
    const r = verifyDeck(files);
    expect(r.ok).toBe(true);
    expect(r.issues.join('\n')).toContain('/slides/02.css');
  });

  test('slideOrder id missing both HTML and CSS → flags both paths', () => {
    const files = validFiles().filter(
      (f) => f.path !== '/slides/02.html' && f.path !== '/slides/02.css',
    );
    const r = verifyDeck(files);
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('/slides/02.html');
    expect(r.issues.join('\n')).toContain('/slides/02.css');
  });

  test('slide .html containing <script → hard issue', () => {
    const files = validFiles();
    const idx = files.findIndex((f) => f.path === '/slides/01.html');
    files[idx] = { path: '/slides/01.html', content: '<script>alert(1)</script><section>x</section>' };
    const r = verifyDeck(files);
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('<script>');
  });

  test('empty slideOrder → hard issue', () => {
    const files = [
      { path: '/deck.json', content: JSON.stringify({ title: 'T', canvas: '16:9', slideOrder: [] }) },
    ];
    const r = verifyDeck(files);
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('slideOrder is empty');
  });

  test('deck.json contract violation → hard issue surfaced', () => {
    const files = [
      { path: '/deck.json', content: '{ not json' },
    ];
    const r = verifyDeck(files);
    expect(r.ok).toBe(false);
    expect(r.issues.join('\n')).toContain('not valid JSON');
  });

  test('missing referenced theme → soft warning only, ok stays true', () => {
    const files = validFiles().filter((f) => f.path !== '/theme.css');
    const r = verifyDeck(files);
    expect(r.ok).toBe(true);
    expect(r.issues.join('\n')).toContain('/theme.css');
  });
});

describe('naturalCompare', () => {
  test('orders numeric ids numerically, not lexically', () => {
    const ids = ['10', '01', '02'];
    expect([...ids].sort(naturalCompare)).toEqual(['01', '02', '10']);
  });

  test('orders non-NN names numerically-aware', () => {
    const ids = ['step-10', 'step-1', 'step-2'];
    expect([...ids].sort(naturalCompare)).toEqual(['step-1', 'step-2', 'step-10']);
  });

  test('is deterministic for mixed names', () => {
    const ids = ['hero', '01', 'a2', 'a10'];
    expect([...ids].sort(naturalCompare)).toEqual(['01', 'a2', 'a10', 'hero']);
  });
});

describe('syncDeckJson', () => {
  test('derives slideOrder from existing slide files, pins theme, preserves meta', () => {
    const files: SlideFile[] = [
      { path: '/slides/03.html', content: '<section>3</section>' },
      { path: '/slides/03.css', content: 'body{}' },
      { path: '/slides/01.html', content: '<section>1</section>' },
      { path: '/theme.css', content: ':root{}' },
      {
        path: '/deck.json',
        content: JSON.stringify({ title: 'T', canvas: '16:9', description: 'd' }),
      },
    ];
    const out = syncDeckJson(files);
    const deck = JSON.parse(out.find((f) => f.path === '/deck.json')!.content);
    expect(deck.slideOrder).toEqual(['01', '03']);
    expect(deck.theme).toBe('/theme.css');
    expect(deck.title).toBe('T');
    expect(deck.canvas).toBe('16:9');
    expect(deck.description).toBe('d');
  });

  test('meta overrides canvas/title/description and preserves the rest', () => {
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>1</section>' },
      { path: '/deck.json', content: JSON.stringify({ title: 'T', canvas: '16:9', description: 'd' }) },
    ];
    const out = syncDeckJson(files, { canvas: '4:5', title: 'New' });
    const deck = JSON.parse(out.find((f) => f.path === '/deck.json')!.content);
    expect(deck.canvas).toBe('4:5');
    expect(deck.title).toBe('New');
    expect(deck.description).toBe('d');
  });

  test('sorts out-of-order creation and defaults when no deck.json exists', () => {
    const files: SlideFile[] = [
      { path: '/slides/02.html', content: '<section>2</section>' },
      { path: '/slides/01.html', content: '<section>1</section>' },
    ];
    const out = syncDeckJson(files);
    const deck = JSON.parse(out.find((f) => f.path === '/deck.json')!.content);
    expect(deck.slideOrder).toEqual(['01', '02']);
    expect(deck.title).toBe('Untitled deck');
    expect('canvas' in deck).toBe(false);
    expect('theme' in deck).toBe(false);
  });

  test('natural order for badly-named files', () => {
    const files: SlideFile[] = [
      { path: '/slides/step-10.html', content: '<section>10</section>' },
      { path: '/slides/step-2.html', content: '<section>2</section>' },
      { path: '/slides/step-1.html', content: '<section>1</section>' },
    ];
    const out = syncDeckJson(files);
    const deck = JSON.parse(out.find((f) => f.path === '/deck.json')!.content);
    expect(deck.slideOrder).toEqual(['step-1', 'step-2', 'step-10']);
  });

  test('regenerates a malformed deck.json into valid JSON', () => {
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>1</section>' },
      { path: '/deck.json', content: '{ broken json' },
    ];
    const out = syncDeckJson(files);
    const deckRaw = out.find((f) => f.path === '/deck.json')!.content;
    expect(() => JSON.parse(deckRaw)).not.toThrow();
    const deck = JSON.parse(deckRaw);
    expect(deck.slideOrder).toEqual(['01']);
    expect(deck.title).toBe('Untitled deck');
  });

  test('drops a deleted slide and ignores orphan css', () => {
    // 02.html deleted; 02.css orphan remains and must NOT be in slideOrder.
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>1</section>' },
      { path: '/slides/02.css', content: 'body{}' },
      { path: '/deck.json', content: JSON.stringify({ title: 'T', canvas: '16:9', slideOrder: ['01', '02'] }) },
    ];
    const out = syncDeckJson(files);
    const deck = JSON.parse(out.find((f) => f.path === '/deck.json')!.content);
    expect(deck.slideOrder).toEqual(['01']);
    expect(deck.title).toBe('T');
    expect(deck.canvas).toBe('16:9');
  });

  test('returns a new array and never mutates the input', () => {
    const files: SlideFile[] = [{ path: '/slides/01.html', content: '<section>1</section>' }];
    const before = JSON.stringify(files);
    const out = syncDeckJson(files);
    expect(out).not.toBe(files);
    expect(JSON.stringify(files)).toBe(before);
  });
});

describe('reorderSlideFiles', () => {
  /** Deck 01..05 plus a freshly-created `zz` slide (the mid-deck insert target). */
  function deckWithZz(): SlideFile[] {
    return [
      { path: '/slides/01.html', content: '<section>one</section>' },
      { path: '/slides/01.css', content: '/* one */' },
      { path: '/slides/02.html', content: '<section>two</section>' },
      { path: '/slides/02.css', content: '/* two */' },
      { path: '/slides/03.html', content: '<section>three</section>' },
      { path: '/slides/03.css', content: '/* three */' },
      { path: '/slides/04.html', content: '<section>four</section>' },
      { path: '/slides/04.css', content: '/* four */' },
      { path: '/slides/05.html', content: '<section>five</section>' },
      { path: '/slides/05.css', content: '/* five */' },
      { path: '/slides/zz.html', content: '<section>new-mid</section>' },
      { path: '/slides/zz.css', content: '/* new-mid */' },
      { path: '/theme.css', content: ':root{}' },
      { path: '/deck.json', content: JSON.stringify({ title: 'T', canvas: '16:9', slideOrder: ['01', '02', '03', '04', '05', 'zz'] }) },
    ];
  }

  function idsOf(files: SlideFile[]): string[] {
    return files
      .filter((f) => f.path.startsWith('/slides/') && f.path.endsWith('.html'))
      .map((f) => f.path.slice(8, -5));
  }

  function contentAt(files: SlideFile[], path: string): string {
    return files.find((f) => f.path === path)!.content;
  }

  test('insert-in-middle: renames 03..05 to 04..06 and places zz at 03, content preserved', () => {
    const files = deckWithZz();
    const r = reorderSlideFiles(files, ['01', '02', 'zz', '03', '04', '05']);
    expect(r.ok).toBe(true);
    expect([...idsOf(r.files!)].sort(naturalCompare)).toEqual(['01', '02', '03', '04', '05', '06']);

    // The new slide's content lands at 03.
    expect(contentAt(r.files!, '/slides/03.html')).toBe('<section>new-mid</section>');
    expect(contentAt(r.files!, '/slides/03.css')).toBe('/* new-mid */');

    // Old 03 → 04, 04 → 05, 05 → 06 with content intact (no rewrite).
    expect(contentAt(r.files!, '/slides/04.html')).toBe('<section>three</section>');
    expect(contentAt(r.files!, '/slides/04.css')).toBe('/* three */');
    expect(contentAt(r.files!, '/slides/05.html')).toBe('<section>four</section>');
    expect(contentAt(r.files!, '/slides/06.html')).toBe('<section>five</section>');

    // Unchanged slides keep their content.
    expect(contentAt(r.files!, '/slides/01.html')).toBe('<section>one</section>');
    expect(contentAt(r.files!, '/slides/02.html')).toBe('<section>two</section>');

    // Non-slide files untouched.
    expect(r.files!.some((f) => f.path === '/theme.css')).toBe(true);
    expect(r.files!.some((f) => f.path === '/deck.json')).toBe(true);
  });

  test('reverse order: full renumbering to 01..05', () => {
    const files = deckWithZz();
    const r = reorderSlideFiles(files, ['05', '04', '03', '02', '01', 'zz']);
    expect(r.ok).toBe(true);
    expect([...idsOf(r.files!)].sort(naturalCompare)).toEqual(['01', '02', '03', '04', '05', '06']);
    expect(contentAt(r.files!, '/slides/01.html')).toBe('<section>five</section>');
    expect(contentAt(r.files!, '/slides/02.html')).toBe('<section>four</section>');
    expect(contentAt(r.files!, '/slides/03.html')).toBe('<section>three</section>');
    expect(contentAt(r.files!, '/slides/04.html')).toBe('<section>two</section>');
    expect(contentAt(r.files!, '/slides/05.html')).toBe('<section>one</section>');
    expect(contentAt(r.files!, '/slides/06.html')).toBe('<section>new-mid</section>');
  });

  test('idempotent identity order: no-op renumber to same ids', () => {
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>1</section>' },
      { path: '/slides/02.html', content: '<section>2</section>' },
    ];
    const r = reorderSlideFiles(files, ['01', '02']);
    expect(r.ok).toBe(true);
    expect([...idsOf(r.files!)].sort(naturalCompare)).toEqual(['01', '02']);
    expect(contentAt(r.files!, '/slides/01.html')).toBe('<section>1</section>');
    expect(contentAt(r.files!, '/slides/02.html')).toBe('<section>2</section>');
  });

  test('missing id → error listing current ids', () => {
    const files = deckWithZz();
    const r = reorderSlideFiles(files, ['01', '02', '03', '04', '05']); // omits zz
    expect(r.ok).toBe(false);
    expect(r.error).toContain('missing zz');
    expect(r.error).toContain("Current ids:");
  });

  test('extra/unknown id → error', () => {
    const files = deckWithZz();
    const r = reorderSlideFiles(files, ['01', '02', '03', '04', '05', 'zz', 'nope']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('unknown nope');
  });

  test('duplicate id → error', () => {
    const files = deckWithZz();
    const r = reorderSlideFiles(files, ['01', '01', '02', '03', '04', '05']);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('contains duplicate ids');
  });

  test('empty order → error', () => {
    const files = deckWithZz();
    const r = reorderSlideFiles(files, []);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('non-empty "order"');
  });

  test('10+ slides keep 10/11 zero-padding', () => {
    const files: SlideFile[] = Array.from({ length: 12 }, (_, i) => ({
      path: `/slides/${String(i + 1).padStart(2, '0')}.html`,
      content: `<section>${i + 1}</section>`,
    }));
    const order = idsOf(files).reverse();
    const r = reorderSlideFiles(files, order);
    expect(r.ok).toBe(true);
    expect([...idsOf(r.files!)].sort(naturalCompare)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']);
    expect(contentAt(r.files!, '/slides/10.html')).toBe('<section>3</section>');
    expect(contentAt(r.files!, '/slides/11.html')).toBe('<section>2</section>');
    expect(contentAt(r.files!, '/slides/12.html')).toBe('<section>1</section>');
    // renames reports every changed slide (old id → new id), html-canonical,
    // in source-file order (01 first)
    expect(r.renames).toEqual([
      { from: '01', to: '12' },
      { from: '02', to: '11' },
      { from: '03', to: '10' },
      { from: '04', to: '09' },
      { from: '05', to: '08' },
      { from: '06', to: '07' },
      { from: '07', to: '06' },
      { from: '08', to: '05' },
      { from: '09', to: '04' },
      { from: '10', to: '03' },
      { from: '11', to: '02' },
      { from: '12', to: '01' },
    ]);
  });

  test('ids containing dots are renumbered (id is basename minus extension)', () => {
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>one</section>' },
      { path: '/slides/foo.bar.html', content: '<section>dotted</section>' },
      { path: '/slides/02.html', content: '<section>two</section>' },
    ];
    const r = reorderSlideFiles(files, ['01', 'foo.bar', '02']);
    expect(r.ok).toBe(true);
    expect([...idsOf(r.files!)].sort(naturalCompare)).toEqual(['01', '02', '03']);
    // foo.bar now occupies id 02
    expect(contentAt(r.files!, '/slides/02.html')).toBe('<section>dotted</section>');
    expect(contentAt(r.files!, '/slides/03.html')).toBe('<section>two</section>');
    expect(r.renames).toEqual([
      { from: 'foo.bar', to: '02' },
      { from: '02', to: '03' },
    ]);
  });

  test('orphan .css is preserved when unclaimed, not clobbered by a rename', () => {
    // Deck 01,02,zz + an orphan /slides/03.css (no 03.html). Reorder places zz→02,
    // 02→03, so 02.css is renamed onto /slides/03.css — the orphan must not be
    // blindly overwritten by that rename (it is superseded, not clobbered mid-flight).
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>one</section>' },
      { path: '/slides/02.html', content: '<section>two</section>' },
      { path: '/slides/02.css', content: '/* two */' },
      { path: '/slides/zz.html', content: '<section>new</section>' },
      { path: '/slides/zz.css', content: '/* new */' },
      { path: '/slides/03.css', content: '/* orphan */' },
    ];
    const r = reorderSlideFiles(files, ['01', 'zz', '02']);
    expect(r.ok).toBe(true);
    // 02.css (renamed) wins the /slides/03.css path; the orphan is superseded.
    expect(contentAt(r.files!, '/slides/03.css')).toBe('/* two */');
    // the orphan's slot is not double-written: exactly one file holds 03.css
    expect(r.files!.filter((f) => f.path === '/slides/03.css').length).toBe(1);
  });

  test('orphan .css is preserved at its own path when no rename claims it', () => {
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>one</section>' },
      { path: '/slides/02.html', content: '<section>two</section>' },
      { path: '/slides/07.css', content: '/* orphan */' },
    ];
    const r = reorderSlideFiles(files, ['01', '02']);
    expect(r.ok).toBe(true);
    expect(contentAt(r.files!, '/slides/07.css')).toBe('/* orphan */');
    expect(r.renames).toEqual([]);
  });

  test('rename to identical path is a no-op and reports no renames', () => {
    const files: SlideFile[] = [
      { path: '/slides/01.html', content: '<section>a</section>' },
      { path: '/slides/01.css', content: '/* a */' },
    ];
    const r = reorderSlideFiles(files, ['01']);
    expect(r.ok).toBe(true);
    expect(r.renames).toEqual([]);
    expect(contentAt(r.files!, '/slides/01.html')).toBe('<section>a</section>');
  });

  test('single-slide deck reorders trivially', () => {
    const files: SlideFile[] = [{ path: '/slides/01.html', content: '<section>solo</section>' }];
    const r = reorderSlideFiles(files, ['01']);
    expect(r.ok).toBe(true);
    expect(idsOf(r.files!)).toEqual(['01']);
    expect(r.renames).toEqual([]);
  });

  test('returns a new array and never mutates the input', () => {
    const files = deckWithZz();
    const before = JSON.stringify(files);
    const r = reorderSlideFiles(files, ['01', '02', 'zz', '03', '04', '05']);
    expect(r.ok).toBe(true);
    expect(r.files).not.toBe(files);
    expect(JSON.stringify(files)).toBe(before);
  });

  test('rejects a non-array or non-string order', () => {
    const files = deckWithZz();
    expect(reorderSlideFiles(files, '01,02,zz,03,04,05').ok).toBe(false);
    expect(reorderSlideFiles(files, [1, 2]).ok).toBe(false);
    expect(reorderSlideFiles(files, ['01', '02', 'zz', '03', '04', 5]).ok).toBe(false);
  });
});
