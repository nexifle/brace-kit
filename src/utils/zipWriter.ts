/**
 * Minimal STORED-method ZIP writer (no compression).
 *
 * Historically a ZIP entry is either compressed (DEFLATE) or stored verbatim
 * (method 0). PNG slides are ALREADY deflate-compressed internally, so re-compressing
 * them gains nothing — storing them byte-for-byte is valid ZIP, lossless, and avoids
 * pulling in a zip dependency (fflate/jszip). This module emits a spec-conformant
 * ZIP archive (local headers + central directory + end-of-central-directory) with
 * every entry stored at 0 bytes of extra output.
 *
 * Only ASCII entry names are supported (non-ASCII bytes are passed through raw with
 * the UTF-8 flag clear); slide export names are ASCII-slugified by the caller.
 */

/** CRC-32 (IEEE 802.3), table-driven; matches zlib's crc32. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** A file to place inside the archive. `name` must be a relative path (no leading `/`). */
export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const LOCAL_HEADER_SIG = 0x04034b50;
const CENTRAL_HEADER_SIG = 0x02014b50;
const END_CENTRAL_SIG = 0x06054b50;
const VERSION_NEEDED = 20;
const METHOD_STORED = 0;

function u16(value: number, out: DataView, offset: number): void {
  out.setUint16(offset, value, true);
}
function u32(value: number, out: DataView, offset: number): void {
  out.setUint32(offset, value >>> 0, true);
}

/**
 * Build a ZIP archive from the given entries. Every entry is stored uncompressed
 * (METHOD_STORED) with a CRC-32 placed in both its local header and central
 * directory. Returns the complete archive bytes.
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  // Per-entry fixed sizes: 30-byte local header + name + data; 46-byte central header + name.
  let centralSize = 0;
  for (const e of entries) centralSize += 46 + e.name.length;

  const total =
    entries.reduce((acc, e) => acc + 30 + e.name.length + e.data.length, 0) +
    centralSize +
    22; // end-of-central-directory

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const encoder = new TextEncoder();

  let cursor = 0;
  const centralOffsets: number[] = [];

  // Local file headers + data.
  for (const e of entries) {
    const nameBytes = encoder.encode(e.name);
    centralOffsets.push(cursor);
    const crc = crc32(e.data);

    u32(LOCAL_HEADER_SIG, view, cursor);
    u16(VERSION_NEEDED, view, cursor + 4);
    u16(0, view, cursor + 6); // flags
    u16(METHOD_STORED, view, cursor + 8);
    u16(0, view, cursor + 10); // mod time
    u16(0, view, cursor + 12); // mod date
    u32(crc, view, cursor + 14);
    u32(e.data.length, view, cursor + 18); // compressed size == stored size
    u32(e.data.length, view, cursor + 22); // uncompressed size
    u16(nameBytes.length, view, cursor + 26);
    u16(0, view, cursor + 28); // extra len
    cursor += 30;

    out.set(nameBytes, cursor);
    cursor += nameBytes.length;

    out.set(e.data, cursor);
    cursor += e.data.length;
  }

  // Central directory.
  const centralStart = cursor;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const nameBytes = encoder.encode(e.name);
    const crc = crc32(e.data);

    u32(CENTRAL_HEADER_SIG, view, cursor);
    u16(VERSION_NEEDED, view, cursor + 4); // version made by
    u16(VERSION_NEEDED, view, cursor + 6); // version needed
    u16(0, view, cursor + 8); // flags
    u16(METHOD_STORED, view, cursor + 10);
    u16(0, view, cursor + 12); // mod time
    u16(0, view, cursor + 14); // mod date
    u32(crc, view, cursor + 16);
    u32(e.data.length, view, cursor + 20);
    u32(e.data.length, view, cursor + 24);
    u16(nameBytes.length, view, cursor + 28);
    u16(0, view, cursor + 30); // extra len
    u16(0, view, cursor + 32); // comment len
    u16(0, view, cursor + 34); // disk number start
    u16(0, view, cursor + 36); // internal attrs
    u32(0, view, cursor + 38); // external attrs
    u32(centralOffsets[i], view, cursor + 42); // local header offset
    cursor += 46;

    out.set(nameBytes, cursor);
    cursor += nameBytes.length;
  }
  const centralEnd = cursor;

  // End of central directory.
  u32(END_CENTRAL_SIG, view, cursor);
  u16(0, view, cursor + 4); // disk number
  u16(0, view, cursor + 6); // central dir disk
  u16(entries.length, view, cursor + 8);
  u16(entries.length, view, cursor + 10);
  u32(centralEnd - centralStart, view, cursor + 12);
  u32(centralStart, view, cursor + 16);
  u16(0, view, cursor + 20); // comment len

  return out;
}

/**
 * Parse a `data:` URL into bytes and a mime type. Throws on anything that is not a
 * base64 `data:` URL so a malformed capture surface fails loudly rather than
 * producing a corrupt zip entry.
 */
export function dataUrlToBytes(dataUrl: string): { mimeType: string; data: Uint8Array } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match || match[2] !== ';base64') {
    throw new Error(`Unsupported data URL (expected base64 data URL)`);
  }
  const mimeType = match[1] ?? 'application/octet-stream';
  const binary = atob(match[3]);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) data[i] = binary.charCodeAt(i);
  return { mimeType, data };
}

/** Encode a VFS file for a ZIP, decoding uploaded data-URL images to binary. */
export function fileContentToZipBytes(path: string, content: string): Uint8Array {
  if (path.startsWith('/uploads/') && content.startsWith('data:')) {
    return dataUrlToBytes(content).data;
  }
  return new TextEncoder().encode(content);
}

/**
 * Slugify a string into a safe ZIP entry basename (ASCII, dashed). Empty input
 * yields `""` — callers should fall back to a stable token.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
