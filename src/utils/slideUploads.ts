import type { APIMessage, MessageContent } from '../types/index.ts';
import type { SlideFile, SlideUserAttachment } from '../types/slides.ts';
import {
  getSlideFile,
  rewriteUploadSrcs,
  safeSlidePath,
  upsertSlideFile,
} from './slideVfs.ts';
import { MAX_COMPOSER_IMAGE_SOURCE_BYTES } from './composerAttachments.ts';
import { dataUrlBinaryBytes } from './slideImageResize.ts';

export { rewriteUploadSrcs };

export const SLIDE_UPLOADS_PREFIX = '/uploads/';
export const MAX_SLIDE_COMPOSER_ATTACHMENTS = 8;

export type SlidePendingAttachment = {
  id: string;
  type: 'image' | 'text' | 'error';
  name: string;
  /** Bytes written to `/uploads`: original if ≤4K and ≤9MB, else VFS-capped JPEG. */
  data?: string;
  /** Compressed JPEG for chips + the model; never stored in the VFS. */
  preview?: string;
  error?: string;
};

export function isUploadPath(path: string): boolean {
  const p = safeSlidePath(path);
  return !!p && p.startsWith(SLIDE_UPLOADS_PREFIX) && p.length > SLIDE_UPLOADS_PREFIX.length;
}

export function listUploadFiles(files: SlideFile[]): SlideFile[] {
  return files.filter((f) => isUploadPath(f.path));
}

export function vfsByteLength(files: SlideFile[]): number {
  let n = 0;
  for (const f of files) n += utf8Bytes(f.content);
  return n;
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

export function sanitizeUploadBasename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return cleaned.slice(0, 80);
}

export function safeUploadPath(originalName: string, existingPaths: Iterable<string>): string {
  const name = sanitizeUploadBasename(originalName);
  const paths = new Set(existingPaths);
  const first = `${SLIDE_UPLOADS_PREFIX}${name}`;
  if (!paths.has(first)) return first;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  for (;;) {
    const candidate = `${SLIDE_UPLOADS_PREFIX}${stem}-${i}${ext}`;
    if (!paths.has(candidate)) return candidate;
    i += 1;
  }
}

export function persistableAttachment(att: SlideUserAttachment): SlideUserAttachment {
  // Keep `preview` (small JPEG) so later API turns can send vision parts
  // without hydrating the original VFS blob. Never persist `data` — that's in
  // `/uploads` already.
  return {
    id: att.id,
    type: att.type,
    name: att.name,
    path: att.path,
    ...(att.preview ? { preview: att.preview } : {}),
  };
}

export function materializeUploads(
  files: SlideFile[],
  pending: SlidePendingAttachment[],
): { files: SlideFile[]; attachments: SlideUserAttachment[]; rejected: string[] } {
  if (pending.length === 0) return { files, attachments: [], rejected: [] };
  let next = files.slice();
  const attachments: SlideUserAttachment[] = [];
  const rejected: string[] = [];
  const existing = new Set(next.map((f) => f.path));

  for (const p of pending) {
    if (p.type === 'error' || !p.data) {
      rejected.push(p.name);
      continue;
    }
    const path = safeUploadPath(p.name, existing);
    // `/uploads` is user-owned original bytes — do NOT apply the 2MiB agent-VFS
    // soft cap (that cap is for HTML/CSS the model writes). A single original
    // phone photo as a data URL already exceeds 2MiB and was silently dropped.
    const storedBytes = p.data.startsWith('data:')
      ? dataUrlBinaryBytes(p.data)
      : utf8Bytes(p.data);
    if (storedBytes > MAX_COMPOSER_IMAGE_SOURCE_BYTES) {
      rejected.push(p.name);
      continue;
    }
    next = upsertSlideFile(next, path, p.data);
    existing.add(path);
    attachments.push({
      id: p.id,
      type: p.type,
      name: p.name,
      path,
      data: p.data,
      ...(p.preview ? { preview: p.preview } : {}),
    });
  }

  return { files: next, attachments, rejected };
}

export function hydrateAttachment(
  att: SlideUserAttachment,
  files: SlideFile[],
): SlideUserAttachment {
  const file = att.data ? undefined : getSlideFile(files, att.path);
  return {
    ...att,
    data: att.data ?? file?.content,
    preview: att.preview,
  };
}

export function hydrateAttachments(
  attachments: SlideUserAttachment[] | undefined,
  files: SlideFile[],
): SlideUserAttachment[] {
  if (!attachments?.length) return [];
  return attachments.map((a) => hydrateAttachment(a, files));
}

export function attachmentKindFromPath(path: string, content: string): 'image' | 'text' {
  if (content.startsWith('data:image/')) return 'image';
  const lower = path.toLowerCase();
  if (/\.(jpe?g|png|gif|webp)$/.test(lower)) return 'image';
  return 'text';
}

export function slideDisplayText(text: string, attachmentCount: number): string {
  const t = text.trim();
  if (t) return t;
  if (attachmentCount <= 0) return '';
  return attachmentCount === 1 ? 'Attached 1 file' : `Attached ${attachmentCount} files`;
}

export function apiMessageText(content: MessageContent): string {
  if (typeof content === 'string') return content;
  const texts = content
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text as string);
  return texts.join('\n');
}

export function slideApiUserMessage(
  displayText: string,
  attachments: SlideUserAttachment[] = [],
): APIMessage {
  let text = displayText;
  if (attachments.length > 0) {
    text +=
      '\n\n[Uploaded files]\n' +
      attachments.map((a) => `- ${a.path} (${a.type})`).join('\n');
  }
  for (const a of attachments) {
    if (a.type === 'text' && a.data) {
      text += `\n\n[File: ${a.name}]\n${a.data}`;
    }
  }
  const images = attachments.filter((a) => a.type === 'image' && (a.preview || a.data));
  if (images.length === 0) return { role: 'user', content: text };
  return {
    role: 'user',
    content: [
      { type: 'text', text },
      ...images.map((a) => ({
        type: 'image_url' as const,
        // Prefer the vision JPEG; `data` is VFS (original unless 4K/9MB caps).
        image_url: { url: (a.preview || a.data) as string },
      })),
    ],
  };
}
