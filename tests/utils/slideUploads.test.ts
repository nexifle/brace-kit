import { describe, expect, test } from 'bun:test';
import {
  MAX_SLIDE_VFS_BYTES,
  rewriteUploadSrcs,
} from '../../src/utils/slideVfs.ts';
import {
  apiMessageText,
  materializeUploads,
  persistableAttachment,
  safeUploadPath,
  sanitizeUploadBasename,
  slideApiUserMessage,
  slideDisplayText,
} from '../../src/utils/slideUploads.ts';

describe('safeUploadPath', () => {
  test('sanitizes and prefixes /uploads/', () => {
    expect(sanitizeUploadBasename('../../foo bar.PNG')).toBe('foo-bar.PNG');
    expect(safeUploadPath('logo.png', [])).toBe('/uploads/logo.png');
  });

  test('de-dupes collisions', () => {
    const existing = ['/uploads/logo.png', '/uploads/logo-2.png'];
    expect(safeUploadPath('logo.png', existing)).toBe('/uploads/logo-3.png');
  });
});

describe('materializeUploads', () => {
  test('upserts pending files into the VFS', () => {
    const { files, attachments, rejected } = materializeUploads([], [
      { id: '1', type: 'text', name: 'notes.txt', data: 'hello' },
    ]);
    expect(rejected).toEqual([]);
    expect(files).toEqual([{ path: '/uploads/notes.txt', content: 'hello' }]);
    expect(attachments[0]?.path).toBe('/uploads/notes.txt');
  });

  test('persistableAttachment keeps preview for later API turns, not original data', () => {
    const persisted = persistableAttachment({
      id: '1',
      type: 'image',
      name: 'logo.png',
      path: '/uploads/logo.png',
      data: 'data:image/png;base64,ORIGINAL',
      preview: 'data:image/jpeg;base64,SMALL',
    });
    expect(persisted.data).toBeUndefined();
    expect(persisted.preview).toBe('data:image/jpeg;base64,SMALL');
    expect(persisted.path).toBe('/uploads/logo.png');
  });

  test('writes the original image to VFS, not the resized preview', () => {
    const original = 'data:image/png;base64,ORIGINAL';
    const preview = 'data:image/jpeg;base64,SMALL';
    const { files, attachments } = materializeUploads([], [
      { id: '1', type: 'image', name: 'logo.png', data: original, preview },
    ]);
    expect(files).toEqual([{ path: '/uploads/logo.png', content: original }]);
    expect(attachments[0]?.preview).toBe(preview);
    expect(attachments[0]?.data).toBe(original);
  });

  test('still writes /uploads when the rest of the VFS is already large', () => {
    const huge = 'x'.repeat(MAX_SLIDE_VFS_BYTES);
    const { files, attachments, rejected } = materializeUploads(
      [{ path: '/brief.md', content: huge }],
      [{ id: '1', type: 'text', name: 'more.txt', data: 'notes' }],
    );
    expect(rejected).toEqual([]);
    expect(attachments[0]?.path).toBe('/uploads/more.txt');
    expect(files.some((f) => f.path === '/uploads/more.txt' && f.content === 'notes')).toBe(true);
  });
});

describe('rewriteUploadSrcs', () => {
  const files = [
    { path: '/uploads/hero.jpg', content: 'data:image/jpeg;base64,AAA' },
  ];

  test('rewrites img src and css url', () => {
    const html = '<img src="/uploads/hero.jpg"><div style="background:url(/uploads/hero.jpg)"></div>';
    const out = rewriteUploadSrcs(html, files);
    expect(out).toContain('src="data:image/jpeg;base64,AAA"');
    expect(out).toContain('url(data:image/jpeg;base64,AAA)');
    expect(out).not.toContain('/uploads/hero.jpg');
  });

  test('leaves other srcs alone', () => {
    const html = '<img src="https://cdn.example/x.png">';
    expect(rewriteUploadSrcs(html, files)).toBe(html);
  });
});

describe('slideApiUserMessage', () => {
  test('txt stays a string with inlined body', () => {
    const msg = slideApiUserMessage('hi', [
      { id: '1', type: 'text', name: 'n.txt', path: '/uploads/n.txt', data: 'body' },
    ]);
    expect(typeof msg.content).toBe('string');
    expect(String(msg.content)).toContain('[File: n.txt]');
    expect(String(msg.content)).toContain('body');
  });

  test('images use multipart image_url', () => {
    const msg = slideApiUserMessage('hi', [
      { id: '1', type: 'image', name: 'a.jpg', path: '/uploads/a.jpg', data: 'data:image/jpeg;base64,xx' },
    ]);
    expect(Array.isArray(msg.content)).toBe(true);
    const parts = msg.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.some((p) => p.type === 'image_url' && p.image_url?.url.startsWith('data:image'))).toBe(true);
    expect(apiMessageText(msg.content)).toContain('/uploads/a.jpg');
  });

  test('model vision prefers the resized preview over the original VFS payload', () => {
    const msg = slideApiUserMessage('hi', [
      {
        id: '1',
        type: 'image',
        name: 'logo.png',
        path: '/uploads/logo.png',
        data: 'data:image/png;base64,ORIGINAL',
        preview: 'data:image/jpeg;base64,SMALL',
      },
    ]);
    const parts = msg.content as Array<{ type: string; image_url?: { url: string } }>;
    expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toBe('data:image/jpeg;base64,SMALL');
  });

  test('sendImageParts: false keeps VFS paths in text and omits image_url', () => {
    const msg = slideApiUserMessage(
      'place this logo',
      [
        {
          id: '1',
          type: 'image',
          name: 'logo.png',
          path: '/uploads/logo.png',
          data: 'data:image/png;base64,ORIGINAL',
          preview: 'data:image/jpeg;base64,SMALL',
        },
      ],
      { sendImageParts: false },
    );
    expect(typeof msg.content).toBe('string');
    expect(String(msg.content)).toContain('/uploads/logo.png');
    expect(String(msg.content)).not.toContain('data:image');
  });
});

describe('slideDisplayText', () => {
  test('falls back when only files are sent', () => {
    expect(slideDisplayText('', 1)).toBe('Attached 1 file');
    expect(slideDisplayText('', 2)).toBe('Attached 2 files');
    expect(slideDisplayText('  hello  ', 1)).toBe('hello');
  });
});
