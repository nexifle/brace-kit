import { describe, expect, it } from 'bun:test';
import { buildZip, crc32, dataUrlToBytes, slugify, type ZipEntry } from '../../src/utils/zipWriter.ts';

/** Minimal ZIP local-file-header parser to prove the archive is well-formed. */
function parseLocalHeaders(bytes: Uint8Array): { name: string; crc: number; size: number }[] {
  const view = new DataView(bytes.buffer);
  const out: { name: string; crc: number; size: number }[] = [];
  let cursor = 0;
  while (cursor + 4 <= bytes.length) {
    const sig = view.getUint32(cursor, true);
    if (sig !== 0x04034b50) break; // not a local header
    const method = view.getUint16(cursor + 8, true);
    const crc = view.getUint32(cursor + 14, true);
    const size = view.getUint32(cursor + 18, true);
    const nameLen = view.getUint16(cursor + 26, true);
    const extraLen = view.getUint16(cursor + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 30, cursor + 30 + nameLen));
    out.push({ name, crc, size });
    cursor += 30 + nameLen + extraLen + size;
  }
  return out;
}

describe('crc32', () => {
  it('matches known CRC-32 values', () => {
    expect(crc32(new TextEncoder().encode(''))).toBe(0);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode('hello world'))).toBe(0x0d4a1185);
  });
});

describe('buildZip', () => {
  it('emits local + central headers and an end-of-central record', () => {
    const data = new TextEncoder().encode('slide-one-png-bytes');
    const archive = buildZip([{ name: '01-my-deck.png', data }]);
    // Signature of EOCD at the tail.
    const view = new DataView(archive.buffer);
    const eocdOffset = archive.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    // Entry count in EOCD.
    expect(view.getUint16(eocdOffset + 8, true)).toBe(1);
    expect(view.getUint16(eocdOffset + 10, true)).toBe(1);
  });

  it('stores each entry uncompressed with matching name, crc, and size', () => {
    const a = new TextEncoder().encode('aaa');
    const b = new TextEncoder().encode('bbbbb');
    const archive = buildZip([
      { name: '01.png', data: a },
      { name: '02.png', data: b },
    ]);
    const locals = parseLocalHeaders(archive);
    expect(locals).toEqual([
      { name: '01.png', crc: crc32(a), size: 3 },
      { name: '02.png', crc: crc32(b), size: 5 },
    ]);
  });

  it('handles an empty archive (no entries)', () => {
    const archive = buildZip([]);
    const view = new DataView(archive.buffer);
    const eocdOffset = archive.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(0);
  });

  it('reproduces entry payloads after local headers (round-trips stored content)', () => {
    const payload = new TextEncoder().encode('payload-bytes');
    const archive = buildZip([{ name: 'f.png', data: payload }]);
    const locals = parseLocalHeaders(archive);
    const localEnd = 30 + 5 + 0; // header + name + extra
    const extracted = archive.subarray(localEnd, localEnd + payload.length);
    expect(extracted).toEqual(payload);
    expect(locals[0].name).toBe('f.png');
  });

  it('is deterministic for identical inputs', () => {
    const data = new TextEncoder().encode('same');
    const entries: ZipEntry[] = [
      { name: 'a.png', data },
      { name: 'b.png', data },
    ];
    expect(buildZip(entries)).toEqual(buildZip(entries));
  });
});

describe('dataUrlToBytes', () => {
  it('decodes a base64 PNG data URL', () => {
    const raw = new TextEncoder().encode('PNGBYTES');
    const b64 = Buffer.from(raw).toString('base64');
    const { mimeType, data } = dataUrlToBytes(`data:image/png;base64,${b64}`);
    expect(mimeType).toBe('image/png');
    expect(data).toEqual(raw);
  });

  it('rejects non-base64 data URLs', () => {
    expect(() => dataUrlToBytes('data:text/plain,hello')).toThrow(/base64/);
    expect(() => dataUrlToBytes('http://example.com/x.png')).toThrow(/base64/);
  });
});

describe('slugify', () => {
  it('lowercases and dashes non-alphanumerics', () => {
    expect(slugify('My Deck Title!')).toBe('my-deck-title');
    expect(slugify('  Product Launch  2026 ')).toBe('product-launch-2026');
  });
  it('returns empty string for non-alphanumerics only', () => {
    expect(slugify('!!!')).toBe('');
  });
});
