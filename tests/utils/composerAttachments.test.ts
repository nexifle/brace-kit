import { describe, expect, test } from 'bun:test';
import {
  MAX_COMPOSER_IMAGE_SOURCE_BYTES,
  MAX_COMPOSER_TEXT_BYTES,
  classifyComposerFile,
  clipboardComposerFiles,
  composerFileSizeError,
  normalizeClipboardImageFile,
} from '../../src/utils/composerAttachments.ts';

describe('classifyComposerFile', () => {
  test('accepts raster MIME types', () => {
    expect(classifyComposerFile({ type: 'image/png', name: '' })).toBe('image');
    expect(classifyComposerFile({ type: 'image/jpeg', name: 'x' })).toBe('image');
    expect(classifyComposerFile({ type: 'image/webp', name: 'x' })).toBe('image');
  });

  test('falls back to extension when MIME is empty (clipboard quirk)', () => {
    expect(classifyComposerFile({ type: '', name: 'pasted-image.png' })).toBe('image');
    expect(classifyComposerFile({ type: '', name: 'notes.txt' })).toBe('text');
    expect(classifyComposerFile({ type: '', name: 'doc.pdf' }, { allowPdf: true })).toBe('pdf');
  });

  test('rejects svg/heic and unknown types', () => {
    expect(classifyComposerFile({ type: 'image/svg+xml', name: 'a.svg' })).toBeNull();
    expect(classifyComposerFile({ type: 'image/heic', name: 'a.heic' })).toBeNull();
    expect(classifyComposerFile({ type: 'application/zip', name: 'a.zip' })).toBeNull();
  });

  test('respects allowPdf', () => {
    expect(classifyComposerFile({ type: 'application/pdf', name: 'a.pdf' }, { allowPdf: false })).toBeNull();
    expect(classifyComposerFile({ type: 'application/pdf', name: 'a.pdf' }, { allowPdf: true })).toBe('pdf');
  });
});

describe('composerFileSizeError', () => {
  test('allows images under the 12MB source cap (including >2MB)', () => {
    expect(composerFileSizeError('image', 3 * 1024 * 1024)).toBeNull();
    expect(composerFileSizeError('image', MAX_COMPOSER_IMAGE_SOURCE_BYTES)).toBeNull();
  });

  test('rejects images over the source cap', () => {
    expect(composerFileSizeError('image', MAX_COMPOSER_IMAGE_SOURCE_BYTES + 1)).toMatch(/12MB/i);
  });

  test('keeps the 2MB cap for text and pdf', () => {
    expect(composerFileSizeError('text', MAX_COMPOSER_TEXT_BYTES)).toBeNull();
    expect(composerFileSizeError('text', MAX_COMPOSER_TEXT_BYTES + 1)).toMatch(/2MB/i);
    expect(composerFileSizeError('pdf', MAX_COMPOSER_TEXT_BYTES + 1)).toMatch(/2MB/i);
  });
});

describe('normalizeClipboardImageFile', () => {
  test('returns null for non-image items', () => {
    const item = {
      type: 'text/plain',
      getAsFile: () => new File(['hi'], 'a.txt', { type: 'text/plain' }),
    } as unknown as DataTransferItem;
    expect(normalizeClipboardImageFile(item)).toBeNull();
  });

  test('fills empty name/type from the clipboard item MIME', () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: '' });
    const raw = new File([blob], '', { type: '' });
    const item = {
      type: 'image/png',
      getAsFile: () => raw,
    } as unknown as DataTransferItem;

    const normalized = normalizeClipboardImageFile(item);
    expect(normalized).not.toBeNull();
    expect(normalized!.type).toBe('image/png');
    expect(normalized!.name).toBe('pasted-image.png');
  });

  test('keeps an already-complete file', () => {
    const raw = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    const item = {
      type: 'image/png',
      getAsFile: () => raw,
    } as unknown as DataTransferItem;
    expect(normalizeClipboardImageFile(item)).toBe(raw);
  });
});

describe('clipboardComposerFiles', () => {
  test('collects a screenshot item and an OS-pasted txt file without duplicating', () => {
    const png = new File([new Uint8Array([1, 2])], '', { type: '' });
    const txt = new File(['notes'], 'brief.txt', { type: 'text/plain' });
    const items = [
      {
        kind: 'file',
        type: 'image/png',
        getAsFile: () => png,
      },
      {
        kind: 'file',
        type: 'text/plain',
        getAsFile: () => txt,
      },
    ] as unknown as DataTransferItemList;
    const files = {
      length: 1,
      0: txt,
      item: (i: number) => (i === 0 ? txt : null),
      [Symbol.iterator]: function* () {
        yield txt;
      },
    } as unknown as FileList;

    const dt = { items, files } as unknown as DataTransfer;
    const out = clipboardComposerFiles(dt, { allowPdf: false });
    expect(out).toHaveLength(2);
    expect(out.some((f) => f.name === 'pasted-image.png' && f.type === 'image/png')).toBe(true);
    expect(out.some((f) => f.name === 'brief.txt')).toBe(true);
  });

  test('does not double a screenshot present in both items and files', () => {
    const png = new File([new Uint8Array([1, 2])], '', { type: '' });
    const items = [
      {
        kind: 'file',
        type: 'image/png',
        getAsFile: () => png,
      },
    ] as unknown as DataTransferItemList;
    const files = {
      length: 1,
      0: png,
      item: (i: number) => (i === 0 ? png : null),
      [Symbol.iterator]: function* () {
        yield png;
      },
    } as unknown as FileList;

    const dt = { items, files } as unknown as DataTransfer;
    const out = clipboardComposerFiles(dt, { allowPdf: false });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('pasted-image.png');
    expect(out[0]!.type).toBe('image/png');
  });

  test('does not double a named image present in both lists', () => {
    const img = new File([new Uint8Array([9])], 'logo.png', { type: 'image/png' });
    const items = [
      { kind: 'file', type: 'image/png', getAsFile: () => img },
    ] as unknown as DataTransferItemList;
    const files = {
      length: 1,
      0: img,
      item: (i: number) => (i === 0 ? img : null),
      [Symbol.iterator]: function* () {
        yield img;
      },
    } as unknown as FileList;
    const dt = { items, files } as unknown as DataTransfer;
    expect(clipboardComposerFiles(dt, { allowPdf: false })).toHaveLength(1);
  });

  test('does not take a second image from files when items already has one', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const raw = new File([bytes], '', { type: '' });
    const named = new File([bytes], 'image.png', { type: 'image/png' });
    const items = [
      { kind: 'file', type: 'image/png', getAsFile: () => raw },
    ] as unknown as DataTransferItemList;
    const files = {
      length: 1,
      0: named,
      item: (i: number) => (i === 0 ? named : null),
      [Symbol.iterator]: function* () {
        yield named;
      },
    } as unknown as FileList;
    const dt = { items, files } as unknown as DataTransfer;
    const out = clipboardComposerFiles(dt, { allowPdf: false });
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('pasted-image.png');
  });

  test('still attaches two named images of different sizes', () => {
    const a = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
    const b = new File([new Uint8Array([1, 2])], 'b.png', { type: 'image/png' });
    const items = [
      { kind: 'file', type: 'image/png', getAsFile: () => a },
      { kind: 'file', type: 'image/png', getAsFile: () => b },
    ] as unknown as DataTransferItemList;
    const files = {
      length: 2,
      0: a,
      1: b,
      item: (i: number) => (i === 0 ? a : i === 1 ? b : null),
      [Symbol.iterator]: function* () {
        yield a;
        yield b;
      },
    } as unknown as FileList;
    const dt = { items, files } as unknown as DataTransfer;
    expect(clipboardComposerFiles(dt, { allowPdf: false })).toHaveLength(2);
  });

  test('rejects pdf when allowPdf is false', () => {
    const pdf = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
    const items = [
      { kind: 'file', type: 'application/pdf', getAsFile: () => pdf },
    ] as unknown as DataTransferItemList;
    const dt = { items, files: { length: 0, [Symbol.iterator]: function* () {} } } as unknown as DataTransfer;
    expect(clipboardComposerFiles(dt, { allowPdf: false })).toEqual([]);
  });
});
