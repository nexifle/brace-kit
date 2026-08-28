import { describe, expect, test } from 'bun:test';
import {
  composeSitePreviewDocument,
  isHashOnlyHref,
  matchSitePageIndex,
  parseSitePreviewSearch,
  resolveSitePreviewHref,
  sitePreviewHash,
  sitePreviewPath,
  withSitePreviewNavInterceptor,
} from '../../src/utils/sitePreview.ts';

describe('sitePreviewPath / parseSitePreviewSearch', () => {
  test('round-trips project id and page path', () => {
    const path = sitePreviewPath('proj-1', '/about');
    expect(path.startsWith('site-preview.html?')).toBe(true);
    const q = path.slice(path.indexOf('?'));
    expect(parseSitePreviewSearch(q)).toEqual({
      projectId: 'proj-1',
      pagePath: '/about',
    });
  });

  test('encodes special characters in page path', () => {
    const path = sitePreviewPath('id', '/foo bar');
    expect(path).toContain('page=%2Ffoo+bar');
    expect(parseSitePreviewSearch(path.slice(path.indexOf('?')))).toEqual({
      projectId: 'id',
      pagePath: '/foo bar',
    });
  });

  test('returns null without project', () => {
    expect(parseSitePreviewSearch('?page=/')).toBeNull();
    expect(parseSitePreviewSearch('')).toBeNull();
  });

  test('defaults page to /', () => {
    expect(parseSitePreviewSearch('?project=abc')).toEqual({
      projectId: 'abc',
      pagePath: '/',
    });
  });
});

describe('resolveSitePreviewHref', () => {
  test('maps root-relative site paths', () => {
    expect(resolveSitePreviewHref('/plants', '/')).toBe('/plants');
    expect(resolveSitePreviewHref('/plants/', '/')).toBe('/plants');
    expect(resolveSitePreviewHref('/plants?x=1#y', '/')).toBe('/plants');
  });

  test('resolves relative hrefs against the current page', () => {
    expect(resolveSitePreviewHref('about.html', '/')).toBe('/about.html');
    expect(resolveSitePreviewHref('sensors', '/plants')).toBe('/plants/sensors');
  });

  test('returns null for hash-only, external, and special schemes', () => {
    expect(resolveSitePreviewHref('#section', '/')).toBeNull();
    expect(resolveSitePreviewHref('https://example.com', '/')).toBeNull();
    expect(resolveSitePreviewHref('mailto:a@b.c', '/')).toBeNull();
    expect(resolveSitePreviewHref('javascript:void(0)', '/')).toBeNull();
    expect(resolveSitePreviewHref('', '/')).toBeNull();
  });
});

describe('sitePreviewHash / isHashOnlyHref', () => {
  test('reads fragment ids', () => {
    expect(sitePreviewHash('#overview')).toBe('overview');
    expect(sitePreviewHash('/plants#overview')).toBe('overview');
    expect(sitePreviewHash('#')).toBeNull();
    expect(sitePreviewHash('/plants')).toBeNull();
  });

  test('detects hash-only hrefs', () => {
    expect(isHashOnlyHref('#overview')).toBe(true);
    expect(isHashOnlyHref('/plants#overview')).toBe(false);
  });
});

describe('matchSitePageIndex', () => {
  const pages = [
    { path: '/', htmlPath: '/pages/index.html' },
    { path: '/plants', htmlPath: '/pages/plants.html' },
  ];

  test('matches manifest path or htmlPath', () => {
    expect(matchSitePageIndex(pages, '/plants')).toBe(1);
    expect(matchSitePageIndex(pages, '/pages/plants.html')).toBe(1);
    expect(matchSitePageIndex(pages, '/missing')).toBe(-1);
  });
});

describe('withSitePreviewNavInterceptor', () => {
  test('injects a click interceptor before </body>', () => {
    const html = withSitePreviewNavInterceptor(
      '<html><body><a href="/plants">Plants</a></body></html>',
      '/',
    );
    expect(html).toContain('data-bk-preview-nav');
    expect(html).toContain('fromSitePreview');
    expect(html).toContain('scrollIntoView');
    expect(html).toContain('data-bk-preview-hash');
    expect(html).toContain('</body>');
    expect(html.indexOf('data-bk-preview-nav')).toBeLessThan(html.lastIndexOf('</body>'));
  });

  test('appends when there is no body close tag', () => {
    const html = withSitePreviewNavInterceptor('<a href="/plants">Plants</a>', '/');
    expect(html.endsWith('</script>')).toBe(true);
    expect(html).toContain('data-bk-preview-nav');
  });
});

describe('composeSitePreviewDocument', () => {
  const files = [
    { path: '/pages/index.html', content: '<h1>Home</h1>' },
    { path: '/pages/about.html', content: '<h1>About</h1>' },
  ];

  test('composes the requested page', () => {
    const doc = composeSitePreviewDocument(files, 'site', '/about');
    expect(doc?.html).toContain('<h1>About</h1>');
    expect(doc?.html).not.toContain('<h1>Home</h1>');
  });

  test('falls back to home when page is unknown', () => {
    const doc = composeSitePreviewDocument(files, 'site', '/missing');
    expect(doc?.html).toContain('<h1>Home</h1>');
  });

  test('returns null for slides kind', () => {
    expect(composeSitePreviewDocument(files, 'slides', '/')).toBeNull();
  });

  test('returns null with no pages', () => {
    expect(composeSitePreviewDocument([], 'site', '/')).toBeNull();
  });
});
