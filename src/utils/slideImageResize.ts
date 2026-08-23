/**
 * Compress user-uploaded composer images so they stay small in the VFS and in
 * multimodal API turns. Always re-encodes as JPEG; drops long edge then
 * quality until the data URL is under {@link MAX_COMPOSER_IMAGE_DATA_BYTES}.
 */

import {
  MAX_COMPOSER_IMAGE_DATA_BYTES,
  MAX_COMPOSER_IMAGE_EDGE,
  MAX_COMPOSER_IMAGE_SOURCE_BYTES,
} from './composerAttachments.ts';

const QUALITY_STEPS = [0.82, 0.7, 0.58, 0.45];
const EDGE_STEPS = [MAX_COMPOSER_IMAGE_EDGE, 768, 640, 512];

export function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

export function fitInsideBox(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const r = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(w * r)),
    height: Math.max(1, Math.round(h * r)),
  };
}

/** Force a jpeg basename so VFS paths match the re-encoded payload. */
export function jpegUploadName(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() ?? 'image';
  const stem = base.replace(/\.[^.]+$/, '').trim() || 'image';
  return `${stem}.jpg`;
}

export type EncodeJpeg = (width: number, height: number, quality: number) => string;

/**
 * Pick the largest edge × quality whose encoded data URL is under `maxBytes`.
 * `encode` is injected so the loop can be unit-tested without a real canvas.
 */
export function pickCompressedJpeg(
  naturalWidth: number,
  naturalHeight: number,
  encode: EncodeJpeg,
  maxBytes: number = MAX_COMPOSER_IMAGE_DATA_BYTES,
): { dataUrl: string; width: number; height: number; quality: number } {
  let last: { dataUrl: string; width: number; height: number; quality: number } | null = null;
  for (const edge of EDGE_STEPS) {
    const { width, height } = fitInsideBox(naturalWidth, naturalHeight, edge);
    for (const quality of QUALITY_STEPS) {
      const dataUrl = encode(width, height, quality);
      last = { dataUrl, width, height, quality };
      if (utf8ByteLength(dataUrl) <= maxBytes) return last;
    }
  }
  if (!last) throw new Error('Failed to encode image');
  if (utf8ByteLength(last.dataUrl) > maxBytes) {
    throw new Error('Image is still too large after compressing');
  }
  return last;
}

function canvasEncode(img: CanvasImageSource, width: number, height: number, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/** Read a user File/Blob, resize, and return a JPEG data URL under the byte cap. */
export async function resizeComposerImageFile(file: Blob): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  if (file.size > MAX_COMPOSER_IMAGE_SOURCE_BYTES) {
    throw new Error('Image is too large (max 12MB)');
  }
  const dataUrlIn = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
  const img = await loadImageElement(dataUrlIn);
  const picked = pickCompressedJpeg(img.naturalWidth || img.width, img.naturalHeight || img.height, (w, h, q) =>
    canvasEncode(img, w, h, q),
  );
  return { dataUrl: picked.dataUrl, width: picked.width, height: picked.height };
}
