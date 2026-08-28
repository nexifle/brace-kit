import { describe, expect, test } from 'bun:test';
import {
  isSitePreviewNavigateMessage,
  isSitePreviewReadyMessage,
  isSitePreviewRenderMessage,
  postSitePreviewNavigate,
  postSitePreviewRender,
} from '../../src/utils/sitePreviewProtocol.ts';

describe('isSitePreviewRenderMessage', () => {
  test('accepts render + html string', () => {
    expect(isSitePreviewRenderMessage({ type: 'render', html: '<h1>x</h1>' })).toBe(true);
  });

  test('rejects missing or non-string html', () => {
    expect(isSitePreviewRenderMessage({ type: 'render' })).toBe(false);
    expect(isSitePreviewRenderMessage({ type: 'render', html: 1 })).toBe(false);
    expect(isSitePreviewRenderMessage({ type: 'ready' })).toBe(false);
    expect(isSitePreviewRenderMessage(null)).toBe(false);
  });
});

describe('isSitePreviewReadyMessage', () => {
  test('requires fromSitePreview flag', () => {
    expect(isSitePreviewReadyMessage({ type: 'ready', fromSitePreview: true })).toBe(true);
    expect(isSitePreviewReadyMessage({ type: 'ready' })).toBe(false);
    expect(isSitePreviewReadyMessage({ type: 'ready', fromSandbox: true })).toBe(false);
  });
});

describe('isSitePreviewNavigateMessage', () => {
  test('requires fromSitePreview and a path', () => {
    expect(
      isSitePreviewNavigateMessage({
        type: 'navigate',
        path: '/plants',
        fromSitePreview: true,
      }),
    ).toBe(true);
    expect(isSitePreviewNavigateMessage({ type: 'navigate', path: '/plants' })).toBe(
      false,
    );
    expect(
      isSitePreviewNavigateMessage({
        type: 'navigate',
        path: '',
        fromSitePreview: true,
      }),
    ).toBe(false);
    expect(isSitePreviewNavigateMessage({ type: 'ready', fromSitePreview: true })).toBe(
      false,
    );
  });
});

describe('postSitePreviewRender', () => {
  test('posts render payload to *', () => {
    const calls: unknown[] = [];
    const target = {
      postMessage(data: unknown, origin: string) {
        calls.push([data, origin]);
      },
    } as unknown as Window;
    postSitePreviewRender(target, '<p>hi</p>');
    expect(calls).toEqual([[{ type: 'render', html: '<p>hi</p>' }, '*']]);
  });

  test('includes pagePath when provided', () => {
    const calls: unknown[] = [];
    const target = {
      postMessage(data: unknown, origin: string) {
        calls.push([data, origin]);
      },
    } as unknown as Window;
    postSitePreviewRender(target, '<p>hi</p>', '/plants');
    expect(calls).toEqual([
      [{ type: 'render', html: '<p>hi</p>', pagePath: '/plants' }, '*'],
    ]);
  });
});

describe('postSitePreviewNavigate', () => {
  test('posts navigate payload to *', () => {
    const calls: unknown[] = [];
    const target = {
      postMessage(data: unknown, origin: string) {
        calls.push([data, origin]);
      },
    } as unknown as Window;
    postSitePreviewNavigate(target, '/plants');
    expect(calls).toEqual([
      [{ type: 'navigate', path: '/plants', fromSitePreview: true }, '*'],
    ]);
  });
});
