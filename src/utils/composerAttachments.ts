/**
 * Shared composer attachment policy for main chat + slide rail.
 * Single source of truth for size caps, MIME classify, and clipboard normalize.
 */

export const MAX_COMPOSER_TEXT_BYTES = 2 * 1024 * 1024; // 2MB — txt/pdf/csv
/** Raw image source may be large; callers shrink before sending to the model. */
export const MAX_COMPOSER_IMAGE_SOURCE_BYTES = 12 * 1024 * 1024; // 12MB
/** Long-edge cap when re-encoding images for the model / preview. */
export const MAX_COMPOSER_IMAGE_EDGE = 1024;
/** Target max size for compressed JPEG data URLs sent to the model. */
export const MAX_COMPOSER_IMAGE_DATA_BYTES = 180 * 1024;

export type ComposerAttachmentKind = 'image' | 'text' | 'pdf';

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TEXT_MIME = new Set(['text/plain', 'text/csv']);
const PDF_MIME = new Set(['application/pdf']);

const IMAGE_EXT = /\.(jpe?g|png|gif|webp)$/i;
const TEXT_EXT = /\.(txt|csv)$/i;
const PDF_EXT = /\.pdf$/i;

export type ClassifyComposerFileOptions = {
  /** Main chat accepts PDF; slide composer does not. Default true. */
  allowPdf?: boolean;
};

function basename(name: string): string {
  return name.split(/[/\\]/).pop() ?? name;
}

function isAllowedRasterMime(type: string): boolean {
  if (!type) return false;
  if (IMAGE_MIME.has(type)) return true;
  // Some browsers report image/jpg
  if (type === 'image/jpg') return true;
  return false;
}

/**
 * Classify a user File for composer attach. Prefers MIME, falls back to extension
 * (important for clipboard Files that sometimes arrive with an empty `type`).
 */
export function classifyComposerFile(
  file: Pick<File, 'type' | 'name'>,
  options: ClassifyComposerFileOptions = {},
): ComposerAttachmentKind | null {
  const allowPdf = options.allowPdf !== false;
  const type = (file.type || '').toLowerCase();
  const name = basename(file.name || '').toLowerCase();

  // Allowed rasters only (canvas-encodable). Extension covers empty MIME after paste normalize.
  if (isAllowedRasterMime(type) || IMAGE_EXT.test(name)) return 'image';
  // Other image/* (svg, heic, …) → unsupported
  if (type.startsWith('image/')) return null;

  if (TEXT_MIME.has(type) || TEXT_EXT.test(name)) return 'text';
  if (allowPdf && (PDF_MIME.has(type) || PDF_EXT.test(name))) return 'pdf';
  return null;
}

/** Human-readable size error, or null if within policy. */
export function composerFileSizeError(
  kind: ComposerAttachmentKind,
  size: number,
): string | null {
  if (kind === 'image') {
    if (size > MAX_COMPOSER_IMAGE_SOURCE_BYTES) {
      return 'Image is too large (max 12MB)';
    }
    return null;
  }
  if (size > MAX_COMPOSER_TEXT_BYTES) {
    return 'File too large (max 2MB)';
  }
  return null;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * Clipboard `getAsFile()` often yields empty `name` and sometimes empty `type`
 * even when the DataTransferItem MIME is `image/png`. Rebuild a usable File.
 */
export function normalizeClipboardImageFile(item: DataTransferItem): File | null {
  if (!item.type.startsWith('image/')) return null;
  const raw = item.getAsFile();
  if (!raw) return null;

  const type = (raw.type || item.type || '').toLowerCase() || item.type;
  if (!type.startsWith('image/')) return null;

  const ext = MIME_TO_EXT[type] ?? (type.includes('jpeg') || type.includes('jpg') ? 'jpg' : 'png');
  const name = raw.name?.trim() || `pasted-image.${ext}`;

  if (raw.type === type && raw.name === name) return raw;
  return new File([raw], name, { type, lastModified: raw.lastModified });
}

/** Collect image Files from a paste event (normalized). */
export function clipboardImageFiles(clipboardData: DataTransfer | null): File[] {
  const items = clipboardData?.items;
  if (!items) return [];
  const out: File[] = [];
  for (const item of Array.from(items)) {
    const file = normalizeClipboardImageFile(item);
    if (file) out.push(file);
  }
  return out;
}
