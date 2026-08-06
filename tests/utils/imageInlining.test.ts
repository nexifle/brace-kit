import { describe, expect, it, mock } from 'bun:test';
import {
  blobToDataUrl,
  bytesToBase64,
  inferMimeType,
  inlineAllImages,
  inlineImage,
  isExternalImageUrl,
} from '../../src/utils/imageInlining';

function pngBlob(bytes = [137, 80, 78, 71]): Blob {
  return new Blob([Uint8Array.from(bytes)], { type: 'image/png' });
}

function mockFetch(pngUrl: string) {
  return mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === pngUrl) return new Response(pngBlob(), { status: 200 });
    return new Response('not found', { status: 404 });
  });
}

describe('isExternalImageUrl', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(isExternalImageUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isExternalImageUrl('http://x.dev/img.jpg')).toBe(true);
  });
  it('accepts protocol-relative URLs', () => {
    expect(isExternalImageUrl('//cdn.example.com/a.png')).toBe(true);
  });
  it('rejects data:/blob: and relative URLs', () => {
    expect(isExternalImageUrl('data:image/png;base64,xxx')).toBe(false);
    expect(isExternalImageUrl('blob:http://x/abc')).toBe(false);
    expect(isExternalImageUrl('/img.png')).toBe(false);
    expect(isExternalImageUrl('img.png')).toBe(false);
  });
});

describe('bytesToBase64 / blobToDataUrl', () => {
  it('encodes bytes to base64 without blowing the stack', () => {
    expect(bytesToBase64(Uint8Array.from([137, 80, 78, 71]))).toBe('iVBORw==');
  });
  it('produces a data URL with the blob mime', async () => {
    const url = await blobToDataUrl(pngBlob());
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('uses fallback mime when blob has none', async () => {
    const url = await blobToDataUrl(new Blob([Uint8Array.from([1, 2])]));
    expect(url.startsWith('data:application/octet-stream;base64,')).toBe(true);
  });
});

describe('inferMimeType', () => {
  it('maps common extensions', () => {
    expect(inferMimeType('https://x/a.webp?q=1')).toBe('image/webp');
    expect(inferMimeType('https://x/a.svg')).toBe('image/svg+xml');
    expect(inferMimeType('https://x/a.unknownext')).toBe('');
  });
});

describe('inlineImage', () => {
  it('returns a data URL for a fetchable external image', async () => {
    const fetchImpl = mockFetch('https://cdn.example.com/a.png');
    const result = await inlineImage('https://cdn.example.com/a.png', fetchImpl);
    expect(result.startsWith('data:image/png;base64,')).toBe(true);
  });
  it('leaves the src on a 404', async () => {
    const src = 'https://cdn.example.com/missing.png';
    const result = await inlineImage(src, mockFetch('https://cdn.example.com/a.png'));
    expect(result).toBe(src);
  });
  it('leaves the src when fetch throws', async () => {
    const src = 'https://cdn.example.com/net.png';
    const throwing = mock(async () => {
      throw new Error('network down');
    }) as unknown as typeof globalThis.fetch;
    expect(await inlineImage(src, throwing)).toBe(src);
  });
  it('does not touch non-external urls', async () => {
    const fetchImpl = mock(async () => new Response(pngBlob()));
    expect(await inlineImage('data:image/png;base64,abc', fetchImpl)).toBe(
      'data:image/png;base64,abc',
    );
    expect(await inlineImage('/local.png', fetchImpl)).toBe('/local.png');
  });
});

describe('inlineAllImages', () => {
  const PNG = 'https://cdn.example.com/a.png';

  it('rewrites an external img src to a data URL', async () => {
    const html = `<div><img src="${PNG}" alt="x"></div>`;
    const out = await inlineAllImages(html, { fetch: mockFetch(PNG) });
    expect(out).not.toContain(PNG);
    expect(out).toContain('src="data:image/png;base64,');
  });

  it('rewrites multiple imgs independently', async () => {
    const html = `<img src="${PNG}"><img src="${PNG}">`;
    const out = await inlineAllImages(html, { fetch: mockFetch(PNG) });
    expect(out).not.toContain('https://cdn');
    expect(out).toContain('data:image/png;base64,');
  });

  it('rewrites css url() by default', async () => {
    const html = `<style>.bg{background-image:url(${PNG})}</style>`;
    const out = await inlineAllImages(html, { fetch: mockFetch(PNG) });
    expect(out).not.toContain('https://cdn');
    expect(out).toContain('url("data:image/png;base64,');
  });

  it('skips css url() when includeCss is false', async () => {
    const html = `<style>.bg{background-image:url(${PNG})}</style>`;
    const out = await inlineAllImages(html, {
      fetch: mockFetch(PNG),
      includeCss: false,
    });
    expect(out).toContain(PNG);
  });

  it('leaves relative, data, and unfetchable references untouched', async () => {
    const html = `<img src="/rel.png"><img src="rel.png"><img src="data:image/png;base64,abc"><style>.bg{background-image:url(data:image/png;base64,zzz)}</style>`;
    const fetchImpl = mockFetch(PNG);
    const out = await inlineAllImages(html, { fetch: fetchImpl });
    expect(out).toContain('src="/rel.png"');
    expect(out).toContain('src="rel.png"');
    expect(out).toContain('src="data:image/png;base64,abc"');
    expect(out).toContain('url(data:image/png;base64,zzz)');
  });

  it('does not call fetch when there is nothing external to inline', async () => {
    const fetchImpl = mock(async () => new Response(pngBlob()));
    await inlineAllImages('<img src="a.png"><p>hi</p>', { fetch: fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('guards quote styles inside img src', async () => {
    const html = `<img src='${PNG}'>`;
    const out = await inlineAllImages(html, { fetch: mockFetch(PNG) });
    expect(out).toContain('src="data:image/png;base64,');
  });
});
