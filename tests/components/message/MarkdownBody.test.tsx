import { beforeAll, describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  MARKDOWN_BODY_PROSE_CLASS,
  MarkdownBody,
  markdownTextLength,
  wrapStreamingSuffix,
} from '../../../src/components/message/MarkdownBody.tsx';
import { renderMarkdown } from '../../../src/utils/markdown.ts';

beforeAll(() => {
  // renderMarkdown touches window.hljs for fenced code; SSR tests have no DOM.
  const g = globalThis as typeof globalThis & {
    window?: { hljs?: unknown };
  };
  g.window ??= {};
  g.window.hljs ??= undefined;
});
describe('MarkdownBody', () => {
  it('exports the shared prose class used by chat bubbles', () => {
    expect(MARKDOWN_BODY_PROSE_CLASS).toContain('prose');
    expect(MARKDOWN_BODY_PROSE_CLASS).toContain('prose-sm');
    expect(MARKDOWN_BODY_PROSE_CLASS).toContain('dark:prose-invert');
  });

  it('renders the same HTML as renderMarkdown for assistant prose', () => {
    const md = [
      'The font change is applied.',
      '',
      '## Summary',
      '',
      '- **Change made** — `/theme.css`',
      '- Loaded **Plus Jakarta Sans** and **Lora**',
      '',
      '```css',
      '@import url("https://fonts.googleapis.com");',
      '```',
    ].join('\n');

    const expected = renderMarkdown(md, false);
    const html = renderToStaticMarkup(
      createElement(MarkdownBody, { content: md, isStreaming: false }),
    );

    // Outer shell carries prose chrome; inner body is the markdown HTML.
    expect(html).toContain('prose dark:prose-invert');
    expect(html).toContain(expected);
    expect(html).toMatch(/<h2[\s>]/); // heading rendered
    expect(html).toMatch(/<strong>Plus Jakarta Sans<\/strong>/);
    expect(html).toMatch(/<code[\s>]|class="[^"]*language-/); // fenced code
  });

  it('bare variant omits prose shell so parents own bubble chrome', () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownBody, {
        content: '**bold**',
        variant: 'bare',
        className: 'text-sm leading-relaxed',
      }),
    );
    expect(html).toContain('text-sm leading-relaxed');
    // bare must not inject the shared prose class on the root
    expect(html.startsWith('<div class="prose')).toBe(false);
    expect(html).toContain('<strong>bold</strong>');
  });

  it('streaming mode still emits markdown HTML (parse path)', () => {
    const md = 'Hello **world**';
    const html = renderToStaticMarkup(
      createElement(MarkdownBody, { content: md, isStreaming: true }),
    );
    expect(html).toMatch(/<strong[\s>][\s\S]*world/);
  });

  it('streaming wrap keeps markdown tags on the new suffix', () => {
    const wrapped = wrapStreamingSuffix(
      createElement('p', null, ['Hello ', createElement('strong', null, 'world')]),
      5,
    );
    const html = renderToStaticMarkup(createElement('div', null, wrapped.node));
    expect(html).toContain('bk-stream-chunk');
    expect(html).toContain('<strong>');
    expect(html).toContain('world');
    expect(markdownTextLength(wrapped.node)).toBe(11);
  });

  it('streaming headings and fences still render as markdown, not plaintext', () => {
    const md = ['## Title', '', '```js', 'const x = 1', '```'].join('\n');
    const html = renderToStaticMarkup(
      createElement(MarkdownBody, { content: md, isStreaming: true }),
    );
    expect(html).toMatch(/<h2[\s>]/);
    expect(html).toMatch(/<code[\s>]|language-/);
    expect(html).toContain('bk-stream-chunk');
  });
});
