/**
 * Canvas JPEG re-encode for vision ingest vs VFS archive.
 *
 * Vision path (chat, slide preview, read_file tool result) matches the
 * ingest caps: 1.5 MB binary, 2000px side, 2_408_448 pixels, quality 88→32.
 * VFS keeps originals unless over 4K or 9 MB.
 */

import {
  MAX_COMPOSER_IMAGE_DATA_BYTES,
  MAX_COMPOSER_IMAGE_EDGE,
  MAX_COMPOSER_IMAGE_SOURCE_BYTES,
  MAX_VFS_IMAGE_BYTES,
  MAX_VFS_IMAGE_SIDE_PX,
} from './composerAttachments.ts';

export const MAX_ENCODE_PIXELS = 2_408_448;
export const MIN_VISION_SIDE_PX = 8;
export const MIN_VISION_TOTAL_PX = 512;
export const JPEG_QUALITY_STEPS: readonly number[] = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.32];

export function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/** Binary size of a data-URL payload (JPEG/PNG bytes, not UTF-8 of the string). */
export function dataUrlBinaryBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
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

/** Fit inside max side AND max pixel count. Never upscales. */
export function fitEncodeSize(
  width: number,
  height: number,
  maxSide: number,
  maxPixels: number,
): { width: number; height: number } {
  let { width: w, height: h } = fitInsideBox(width, height, maxSide);
  const pixels = w * h;
  if (pixels <= maxPixels) return { width: w, height: h };
  const r = Math.sqrt(maxPixels / pixels);
  return {
    width: Math.max(1, Math.round(w * r)),
    height: Math.max(1, Math.round(h * r)),
  };
}

export function jpegUploadName(originalName: string): string {
  const base = originalName.split(/[/\\]/).pop() ?? 'image';
  const stem = base.replace(/\.[^.]+$/, '').trim() || 'image';
  return `${stem}.jpg`;
}

export type EncodeJpeg = (width: number, height: number, quality: number) => string;

export type PickJpegOptions = {
  maxBytes?: number;
  maxSide?: number;
  maxPixels?: number;
  qualitySteps?: readonly number[];
  /** When true, do not shrink below native size (quality-only). */
  qualityOnly?: boolean;
};

/**
 * One fitted size, then quality ladder until binary payload ≤ maxBytes.
 */
export function pickCompressedJpeg(
  naturalWidth: number,
  naturalHeight: number,
  encode: EncodeJpeg,
  maxBytes: number = MAX_COMPOSER_IMAGE_DATA_BYTES,
  options: PickJpegOptions = {},
): { dataUrl: string; width: number; height: number; quality: number } {
  const maxSide = options.maxSide ?? MAX_COMPOSER_IMAGE_EDGE;
  const maxPixels = options.maxPixels ?? MAX_ENCODE_PIXELS;
  const qualitySteps = options.qualitySteps ?? JPEG_QUALITY_STEPS;
  const size = options.qualityOnly
    ? { width: Math.max(1, Math.round(naturalWidth)), height: Math.max(1, Math.round(naturalHeight)) }
    : fitEncodeSize(naturalWidth, naturalHeight, maxSide, maxPixels);

  let last: { dataUrl: string; width: number; height: number; quality: number } | null = null;
  for (const quality of qualitySteps) {
    const dataUrl = encode(size.width, size.height, quality);
    last = { dataUrl, width: size.width, height: size.height, quality };
    if (dataUrlBinaryBytes(dataUrl) <= maxBytes) return last;
  }
  if (!last) throw new Error('Failed to encode image');
  if (dataUrlBinaryBytes(last.dataUrl) > maxBytes) {
    throw new Error('Image is still too large after compressing');
  }
  return last;
}

function assertVisionGeometry(width: number, height: number): void {
  const w = Math.max(0, Math.round(width));
  const h = Math.max(0, Math.round(height));
  if (w < MIN_VISION_SIDE_PX || h < MIN_VISION_SIDE_PX) {
    throw new Error('Image is too small for vision');
  }
  if (w * h < MIN_VISION_TOTAL_PX) {
    throw new Error('Image is too small for vision');
  }
}

function canvasEncode(img: CanvasImageSource, width: number, height: number, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  // First frame only: GIF/WebP animation is flattened. Fine for vision.
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

function readBlobAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export async function encodeImageForVision(
  file: Blob,
  alreadyReadDataUrl?: string,
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  if (file.size > MAX_COMPOSER_IMAGE_SOURCE_BYTES) {
    throw new Error('Image is too large (max 12MB)');
  }
  const dataUrlIn = alreadyReadDataUrl ?? (await readBlobAsDataUrl(file));
  return encodeImageForVisionDataUrl(dataUrlIn);
}

/** Vision-normalize a data URL (read_file / already-read composer). */
export async function encodeImageForVisionDataUrl(dataUrlIn: string): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  const img = await loadImageElement(dataUrlIn);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  assertVisionGeometry(nw, nh);
  const picked = pickCompressedJpeg(nw, nh, (w, h, q) => canvasEncode(img, w, h, q), MAX_COMPOSER_IMAGE_DATA_BYTES, {
    maxSide: MAX_COMPOSER_IMAGE_EDGE,
    maxPixels: MAX_ENCODE_PIXELS,
    qualitySteps: JPEG_QUALITY_STEPS,
  });
  return { dataUrl: picked.dataUrl, width: picked.width, height: picked.height };
}

/** null = keep original; qualityOnly = JPEG at native size; otherwise scale to 4K. */
export function vfsNeedsReencode(
  width: number,
  height: number,
  binaryBytes: number,
): { qualityOnly: boolean } | null {
  const overSide = Math.max(width, height) > MAX_VFS_IMAGE_SIDE_PX;
  const overBytes = binaryBytes > MAX_VFS_IMAGE_BYTES;
  if (!overSide && !overBytes) return null;
  return { qualityOnly: !overSide };
}

/**
 * VFS archive: keep original if ≤4K and ≤9 MB; quality-only JPEG if ≤4K and
 * over 9 MB; downscale into 4K then quality if over 4K.
 */
export async function encodeImageForVfs(file: Blob, originalDataUrl?: string): Promise<string> {
  if (file.size > MAX_COMPOSER_IMAGE_SOURCE_BYTES) {
    throw new Error('Image is too large (max 12MB)');
  }
  const dataUrlIn = originalDataUrl ?? (await readBlobAsDataUrl(file));
  const img = await loadImageElement(dataUrlIn);
  const nw = img.naturalWidth || img.width;
  const nh = img.naturalHeight || img.height;
  const binaryBytes = Math.max(file.size, dataUrlBinaryBytes(dataUrlIn));
  const plan = vfsNeedsReencode(nw, nh, binaryBytes);
  if (!plan) return dataUrlIn;

  const picked = pickCompressedJpeg(nw, nh, (w, h, q) => canvasEncode(img, w, h, q), MAX_VFS_IMAGE_BYTES, {
    maxSide: MAX_VFS_IMAGE_SIDE_PX,
    maxPixels: Number.MAX_SAFE_INTEGER,
    qualitySteps: JPEG_QUALITY_STEPS,
    qualityOnly: plan.qualityOnly,
  });
  return picked.dataUrl;
}
