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
  projectDeckSlides,
  slideHtmlPath,
  composeSlideHtml,
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

  test('missing or invalid deck.json degrades to empty deck', () => {
    expect(rebuildDeckProjection([{ path: '/brief.md', content: 'hi' }])).toMatchObject({
      title: expect.any(String),
      canvas: DEFAULT_SLIDE_CANVAS,
      slideOrder: [],
    });

    const bad = rebuildDeckProjection([
      { path: '/deck.json', content: '{ not valid json' },
    ]);
    expect(bad.slideOrder).toEqual([]);
    expect(bad.canvas).toBe(DEFAULT_SLIDE_CANVAS);
  });

  test('claims a default canvas when deck.json omits an invalid preset', () => {
    const deck = rebuildDeckProjection([
      { path: '/deck.json', content: JSON.stringify({ canvas: '99:99', slideOrder: [] }) },
    ]);
    expect(deck.canvas).toBe(DEFAULT_SLIDE_CANVAS);
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
});
