import { beforeAll, describe, expect, it } from 'bun:test';
import {
  escapeCodeHtml,
  highlightSlideSource,
  slideCodeFromVfs,
  slideCodeHighlightedLines,
  splitHighlightedHtmlLines,
} from '../../../src/components/slides/SlideCodeViewer.tsx';
import type { Slide, SlideFile } from '../../../src/types/index.ts';

function file(path: string, content: string): SlideFile {
  return { path, content };
}

describe('slideCodeFromVfs (US-031)', () => {
  const files: SlideFile[] = [
    file('/slides/01.html', '<section>Hello</section>'),
    file('/slides/01.css', '.slide { color: red; }'),
    file('/theme.css', 'body { margin: 0; }'),
  ];
  const slide: Slide = { id: '01', htmlPath: '/slides/01.html', cssPath: '/slides/01.css' };

  it('returns empty content when no slide is selected', () => {
    const r = slideCodeFromVfs(files, undefined);
    expect(r).toEqual({ html: '', css: '', hasCss: false });
  });

  it('resolves the slide HTML and CSS from VFS', () => {
    const r = slideCodeFromVfs(files, slide);
    expect(r.html).toBe('<section>Hello</section>');
    expect(r.css).toBe('.slide { color: red; }');
    expect(r.hasCss).toBe(true);
    expect(r.htmlPath).toBe('/slides/01.html');
  });

  it('marks missing CSS as absent when a slide has no cssPath', () => {
    const noCss: Slide = { id: '02', htmlPath: '/slides/02.html' };
    const r = slideCodeFromVfs(files, noCss);
    expect(r.hasCss).toBe(false);
    expect(r.css).toBe('');
    expect(r.html).toBe('');
  });

  it('returns empty html/css when the on-disk files are missing', () => {
    const r = slideCodeFromVfs(files, { id: '99', htmlPath: '/slides/99.html', cssPath: '/slides/99.css' });
    expect(r.html).toBe('');
    expect(r.css).toBe('');
    expect(r.hasCss).toBe(false);
  });
});

describe('slide code highlight helpers', () => {
  beforeAll(() => {
    const g = globalThis as typeof globalThis & {
      window?: {
        hljs?: {
          highlight: (code: string, options: { language: string }) => { value: string };
          getLanguage: (lang: string) => unknown;
          highlightAuto: (code: string) => { value: string };
        };
      };
    };
    g.window ??= {};
    // Minimal stand-in for window.hljs (same surface chat markdown uses).
    g.window.hljs = {
      getLanguage: (lang: string) => (lang === 'html' || lang === 'css' ? {} : undefined),
      highlight: (code: string, { language }: { language: string }) => {
        if (language === 'html') {
          // Span that intentionally crosses a newline — splitter must re-open it.
          return {
            value: code
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(
                /(&lt;section)([\s\S]*?)(&gt;)/,
                '<span class="hljs-tag">$1$2$3</span>'
              ),
          };
        }
        return {
          value: code.replace(
            /(\.[a-zA-Z_-][\w-]*)/g,
            '<span class="hljs-selector-class">$1</span>'
          ),
        };
      },
      highlightAuto: (code: string) => ({ value: escapeCodeHtml(code) }),
    };
  });

  it('escapes plain text when no highlighting is applied', () => {
    expect(escapeCodeHtml('<div class="x">')).toBe('&lt;div class=&quot;x&quot;&gt;');
  });

  it('highlights html via window.hljs language path', () => {
    const out = highlightSlideSource('<section>\n  hi\n</section>', 'html');
    expect(out).toContain('hljs-tag');
    expect(out).toContain('&lt;section');
  });

  it('reopens spans that cross newlines so each line is self-contained', () => {
    const html = '<span class="hljs-tag">&lt;section\n class="x"&gt;</span>';
    const lines = splitHighlightedHtmlLines(html);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('<span class="hljs-tag">&lt;section</span>');
    expect(lines[1]).toBe('<span class="hljs-tag"> class="x"&gt;</span>');
  });

  it('returns one highlighted line per source line including trailing blank', () => {
    const src = '<section>\n</section>\n';
    const lines = slideCodeHighlightedLines(src, 'html');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('hljs-tag');
  });

  it('highlights css selectors', () => {
    const lines = slideCodeHighlightedLines('.hero { color: red; }', 'css');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('hljs-selector-class');
    expect(lines[0]).toContain('.hero');
  });

  it('falls back to escaped text when hljs is absent', () => {
    const g = globalThis as typeof globalThis & { window?: { hljs?: unknown } };
    const prev = g.window?.hljs;
    if (g.window) g.window.hljs = undefined;
    try {
      expect(highlightSlideSource('<b>', 'html')).toBe('&lt;b&gt;');
    } finally {
      if (g.window) g.window.hljs = prev;
    }
  });
});
