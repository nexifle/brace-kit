import { describe, expect, it } from 'bun:test';
import { slideCodeFromVfs } from '../../../src/components/slides/SlideCodeViewer.tsx';
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
