import { describe, expect, test } from 'bun:test';
import {
  checkResolvedIps,
  htmlToMarkdown,
  isNonPublicIp,
  parseAndNormalizeUrl,
  policyErrorMessage,
  resolveHostDoH,
  truncateMarkdown,
} from '../../../src/background/tools/web-fetch.ts';
import { MAX_CONTENT_LENGTH, readBodyCapped } from '../../../src/background/tools/web-fetch.ts';
import { handleWebFetch, runWebFetch } from '../../../src/background/tools/handlers/web-fetch.handler.ts';

const publicResolve = async () => ['1.1.1.1'];

function ip4(dotted: string): { v: 4; n: number } {
  const p = dotted.split('.').map(Number);
  return { v: 4, n: ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]! };
}

describe('web_fetch URL policy', () => {
  test('upgrades http to https', () => {
    const r = parseAndNormalizeUrl('http://example.com/a');
    expect('url' in r && r.url.protocol).toBe('https:');
  });

  test('rejects credentials', () => {
    const r = parseAndNormalizeUrl('https://user:pass@example.com/');
    expect('error' in r && r.error.kind).toBe('credentials');
  });

  test('rejects single-label hosts', () => {
    const r = parseAndNormalizeUrl('https://intranet/secret');
    expect('error' in r && r.error.kind).toBe('single_label');
  });

  test('blocks loopback and private IP literals', () => {
    expect('error' in parseAndNormalizeUrl('http://127.0.0.1/')).toBe(true);
    expect('error' in parseAndNormalizeUrl('https://10.0.0.1/')).toBe(true);
    expect('error' in parseAndNormalizeUrl('https://192.168.1.1/')).toBe(true);
    expect('error' in parseAndNormalizeUrl('https://169.254.169.254/')).toBe(true);
    expect('error' in parseAndNormalizeUrl('http://localhost/')).toBe(true);
  });

  test('blocks IPv4-mapped IPv6 hex literals', () => {
    expect('error' in parseAndNormalizeUrl('https://[::ffff:7f00:1]/')).toBe(true);
    expect('error' in parseAndNormalizeUrl('https://[::ffff:0a00:1]/')).toBe(true);
    expect('error' in parseAndNormalizeUrl('https://[::ffff:c0a8:1]/')).toBe(true);
  });

  test('blocks metadata hostname', () => {
    const r = parseAndNormalizeUrl('https://metadata.google.internal/');
    expect('error' in r && r.error.kind).toBe('ssrf');
  });

  test('allows public host', () => {
    const r = parseAndNormalizeUrl('https://docs.python.org/3/');
    expect('url' in r).toBe(true);
  });

  test('policyErrorMessage covers ssrf', () => {
    expect(policyErrorMessage({ kind: 'ssrf', host: '10.0.0.1' })).toContain('SSRF');
  });
});

describe('checkResolvedIps', () => {
  test('ignores CNAME hostnames mixed with public A records (detik-style DoH)', () => {
    expect(
      checkResolvedIps('www.detik.com', ['detik.com.', '203.190.242.211', '103.49.221.211']),
    ).toBeNull();
  });

  test('still blocks a private A among answers', () => {
    const err = checkResolvedIps('evil.example.com', ['1.1.1.1', '127.0.0.1']);
    expect(err?.kind).toBe('ssrf');
  });

  test('empty or CNAME-only is DNS failure, not SSRF', () => {
    expect(checkResolvedIps('www.detik.com', ['detik.com.'])?.kind).toBe('dns');
    expect(checkResolvedIps('www.detik.com', [])?.kind).toBe('dns');
  });
});

describe('resolveHostDoH', () => {
  test('keeps only A/AAAA data from a CNAME chain', async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('type=AAAA')) {
        return mockResponse({
          body: JSON.stringify({
            Answer: [
              { name: 'www.detik.com', type: 5, data: 'detik.com.' },
              { name: 'detik.com', type: 28, data: '2402:a000:103::211' },
            ],
          }),
        });
      }
      if (u.includes('type=A')) {
        return mockResponse({
          body: JSON.stringify({
            Answer: [
              { name: 'www.detik.com', type: 5, data: 'detik.com.' },
              { name: 'detik.com', type: 1, data: '203.190.242.211' },
            ],
          }),
        });
      }
      return mockResponse({ body: JSON.stringify({ Answer: [] }) });
    }) as typeof fetch;
    const ips = await resolveHostDoH('www.detik.com', fetchImpl);
    expect(ips).toEqual(['203.190.242.211', '2402:a000:103::211']);
    expect(checkResolvedIps('www.detik.com', ips)).toBeNull();
  });
});

describe('web_fetch SSRF IP ranges', () => {
  test('rfc1918 and specials', () => {
    expect(isNonPublicIp(ip4('10.0.0.1'))).toBe(true);
    expect(isNonPublicIp(ip4('172.16.0.1'))).toBe(true);
    expect(isNonPublicIp(ip4('172.31.255.255'))).toBe(true);
    expect(isNonPublicIp(ip4('172.15.0.1'))).toBe(false);
    expect(isNonPublicIp(ip4('192.168.0.1'))).toBe(true);
    expect(isNonPublicIp(ip4('100.64.0.1'))).toBe(true);
    expect(isNonPublicIp(ip4('192.0.2.1'))).toBe(true);
    expect(isNonPublicIp(ip4('8.8.8.8'))).toBe(false);
    expect(isNonPublicIp(ip4('1.1.1.1'))).toBe(false);
  });
});

describe('htmlToMarkdown', () => {
  test('strips script/style and keeps heading + link', () => {
    const md = htmlToMarkdown(
      '<html><head><style>p{}</style></head><body><script>alert(1)</script><h1>Hello</h1><p>See <a href="https://ex.com">ex</a></p></body></html>',
    );
    expect(md).toContain('# Hello');
    expect(md).toContain('[ex](https://ex.com)');
    expect(md).not.toContain('alert');
    expect(md).not.toContain('p{}');
  });
});

describe('truncateMarkdown', () => {
  test('appends footer when over cap', () => {
    const out = truncateMarkdown('abcdef', 4);
    expect(out.startsWith('abcd')).toBe(true);
    expect(out).toContain('truncated');
  });
});

function mockResponse(init: {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  url?: string;
}): Response {
  return new Response(init.body ?? '', {
    status: init.status ?? 200,
    headers: init.headers,
  });
}

describe('handleWebFetch', () => {
  test('requires url', async () => {
    const r = await runWebFetch({}, async () => mockResponse({}), { resolveHost: publicResolve });
    expect(r.content[0].text).toContain('url parameter is required');
  });

  test('does not treat ToolExecutionContext as fetch', async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('dns-query')) {
        return mockResponse({
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ Answer: [{ type: 1, data: '1.1.1.1' }] }),
        });
      }
      return mockResponse({
        headers: { 'content-type': 'text/plain' },
        body: 'from-global-fetch',
      });
    }) as typeof fetch;
    try {
      const r = await handleWebFetch(
        { url: 'https://example.com/context-not-fetch' },
        { grokAccessToken: 'tok', grokModel: 'grok-4.6' },
      );
      expect(r.content[0].text).toBe('from-global-fetch');
      expect(r.content[0].text).not.toContain('is not a function');
    } finally {
      globalThis.fetch = orig;
    }
  });

  test('returns markdown for HTML', async () => {
    const fetchImpl = (async () =>
      mockResponse({
        headers: { 'content-type': 'text/html' },
        body: '<h1>Title</h1><p>Body</p>',
      })) as typeof fetch;
    const r = await runWebFetch({ url: 'https://example.com/page' }, fetchImpl, {
      resolveHost: publicResolve,
    });
    expect(r.content[0].text).toContain('# Title');
    expect(r.content[0].text).toContain('Body');
  });

  test('HTTP 404 is an error string', async () => {
    const fetchImpl = (async () =>
      mockResponse({ status: 404, headers: { 'content-type': 'text/plain' }, body: 'nope' })) as typeof fetch;
    const r = await runWebFetch({ url: 'https://example.com/missing' }, fetchImpl, {
      resolveHost: publicResolve,
    });
    expect(r.content[0].text).toContain('HTTP 404');
  });

  test('cross-host redirect tells the model to re-call', async () => {
    const fetchImpl = (async () =>
      mockResponse({
        status: 302,
        headers: { location: 'https://other.com/x' },
      })) as typeof fetch;
    const r = await runWebFetch({ url: 'https://example.com/redirect-away' }, fetchImpl, {
      resolveHost: publicResolve,
    });
    expect(r.content[0].text).toContain('cross-host redirect');
    expect(r.content[0].text).toContain('https://other.com/x');
  });

  test('rejects pdf', async () => {
    const fetchImpl = (async () =>
      mockResponse({
        headers: { 'content-type': 'application/pdf' },
        body: '%PDF',
      })) as typeof fetch;
    const r = await runWebFetch({ url: 'https://example.com/a.pdf' }, fetchImpl, {
      resolveHost: publicResolve,
    });
    expect(r.content[0].text).toContain('unsupported content type');
  });

  test('same-host redirect is followed', async () => {
    let n = 0;
    const fetchImpl = (async (_url: RequestInfo | URL) => {
      n += 1;
      if (n === 1) {
        return mockResponse({
          status: 301,
          headers: { location: '/next' },
        });
      }
      return mockResponse({
        headers: { 'content-type': 'text/plain' },
        body: 'ok-next',
      });
    }) as typeof fetch;
    const r = await runWebFetch({ url: 'https://example.com/same-host-hop' }, fetchImpl, {
      resolveHost: publicResolve,
    });
    expect(n).toBe(2);
    expect(r.content[0].text).toBe('ok-next');
  });

  test('blocks hostnames that resolve to private IPs', async () => {
    const fetchImpl = (async () =>
      mockResponse({ headers: { 'content-type': 'text/plain' }, body: 'nope' })) as typeof fetch;
    const r = await runWebFetch({ url: 'https://evil.example.com/' }, fetchImpl, {
      resolveHost: async () => ['127.0.0.1'],
    });
    expect(r.content[0].text).toContain('SSRF');
  });

  test('readBodyCapped aborts oversize streams', async () => {
    const chunk = new Uint8Array(1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const n = Math.ceil(MAX_CONTENT_LENGTH / chunk.byteLength) + 2;
        for (let i = 0; i < n; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const resp = new Response(stream, { headers: { 'content-type': 'text/plain' } });
    const capped = await readBodyCapped(resp, MAX_CONTENT_LENGTH);
    expect(capped.ok).toBe(false);
  });
});
