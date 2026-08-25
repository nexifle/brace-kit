/**
 * Shape persisted slide phase transcripts for the live model:
 * vision on → `image_url` from that turn's attachments and `/uploads` paths
 * named in its text; vision off → strip `image_url`, keep path listings.
 */

import type { APIMessage } from '../types/index.ts';
import type { SlideMainMessage, SlideProject, SlideFile, SlideUserAttachment } from '../types/slides.ts';
import {
  apiMessageText,
  attachmentKindFromPath,
  hydrateAttachments,
  listUploadFiles,
  slideApiUserMessage,
} from './slideUploads.ts';

export function hasVisionParts(content: APIMessage['content']): boolean {
  return Array.isArray(content) && content.some((p) => p.type === 'image_url' && p.image_url?.url);
}

function stripVisionParts(msg: APIMessage): APIMessage {
  if (!hasVisionParts(msg.content)) return msg;
  return { ...msg, content: apiMessageText(msg.content) };
}

const UPLOAD_PATH_RE = /\/uploads\/[A-Za-z0-9._-]+/g;

function imageAttachmentByPath(project: SlideProject): Map<string, SlideUserAttachment> {
  const map = new Map<string, SlideUserAttachment>();
  for (const f of listUploadFiles(project.files)) {
    if (attachmentKindFromPath(f.path, f.content) !== 'image') continue;
    map.set(f.path, {
      id: f.path,
      type: 'image',
      name: f.path.replace(/^\/uploads\//, ''),
      path: f.path,
      data: f.content,
    });
  }
  for (const m of project.messages) {
    if (m.role !== 'user') continue;
    for (const a of hydrateAttachments(m.attachments, project.files)) {
      if (a.type !== 'image' || !(a.preview || a.data)) continue;
      map.set(a.path, a);
    }
  }
  return map;
}

function mainUserTurnFor(msg: APIMessage, project: SlideProject): SlideMainMessage | undefined {
  const text = apiMessageText(msg.content);
  const users = project.messages.filter((m) => m.role === 'user');
  const exact = users.filter((m) => m.content === text);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return exact[exact.length - 1];
  return users.find((m) => text.startsWith(m.content) && m.attachments?.some((a) => a.type === 'image'));
}

function imagesForUserTurn(msg: APIMessage, project: SlideProject): SlideUserAttachment[] {
  const byPath = imageAttachmentByPath(project);
  const seen = new Set<string>();
  const out: SlideUserAttachment[] = [];
  const add = (att: SlideUserAttachment | undefined) => {
    if (!att?.path || seen.has(att.path)) return;
    if (att.type !== 'image' || !(att.preview || att.data)) return;
    seen.add(att.path);
    out.push(att);
  };
  const main = mainUserTurnFor(msg, project);
  for (const a of hydrateAttachments(main?.attachments, project.files)) add(a);
  const text = apiMessageText(msg.content);
  for (const path of text.match(UPLOAD_PATH_RE) ?? []) add(byPath.get(path));
  return out;
}

function attachVisionToUserMessage(msg: APIMessage, images: SlideUserAttachment[]): APIMessage {
  if (images.length === 0 || hasVisionParts(msg.content)) return msg;
  const text = apiMessageText(msg.content);
  return {
    ...msg,
    content: [
      { type: 'text', text },
      ...images.map((a) => ({
        type: 'image_url' as const,
        image_url: { url: (a.preview || a.data) as string },
      })),
    ],
  };
}

function workspaceUploadListing(files: SlideFile[]): string {
  const uploads = listUploadFiles(files);
  if (uploads.length === 0) return '';
  const lines = uploads.map((f) => `- ${f.path} (${attachmentKindFromPath(f.path, f.content)})`);
  return (
    '\n\n[Uploaded files already in this workspace]\n' +
    lines.join('\n') +
    '\nThese files stay at those paths. This model cannot view image pixels. Do not paste data URLs. ' +
    'Only put a file on a slide if the user asked to use it on the deck — a screenshot may be context only.'
  );
}

function transcriptMentionsUploads(transcript: APIMessage[], files: SlideFile[]): boolean {
  const uploads = listUploadFiles(files);
  if (uploads.length === 0) return true;
  const blob = transcript.map((m) => apiMessageText(m.content)).join('\n');
  if (blob.includes('[Uploaded files]')) return true;
  return uploads.some((f) => blob.includes(f.path));
}

function ensureUploadPathsInTranscript(
  transcript: APIMessage[],
  project: SlideProject,
): APIMessage[] {
  if (transcriptMentionsUploads(transcript, project.files)) return transcript;
  const listing = workspaceUploadListing(project.files);
  if (!listing) return transcript;
  const out = transcript.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role !== 'user') continue;
    const text = apiMessageText(out[i].content);
    out[i] = { ...out[i], content: text + listing };
    return out;
  }
  return [...out, { role: 'user', content: listing.trim() }];
}

export function apiUserFromMainMessage(
  m: SlideMainMessage,
  files: SlideFile[],
  sendImageParts = true,
): APIMessage {
  return slideApiUserMessage(m.content, hydrateAttachments(m.attachments, files), { sendImageParts });
}

export function prepareTranscriptForModel(
  transcript: APIMessage[],
  project: SlideProject,
  sendImageParts: boolean,
): APIMessage[] {
  if (sendImageParts) {
    return transcript.map((msg) => {
      if (msg.role !== 'user') return msg;
      if (hasVisionParts(msg.content)) return msg;
      return attachVisionToUserMessage(msg, imagesForUserTurn(msg, project));
    });
  }
  return ensureUploadPathsInTranscript(transcript.map(stripVisionParts), project);
}

/**
 * Isolated plan-session user turns from the main transcript.
 * Retries must include the original deck prompt — never only "continue"/Retry.
 */
export function buildPlanSessionMessages(
  project: SlideProject,
  extraUser?: string,
  sendImageParts = true,
): APIMessage[] {
  if (project.planTranscript?.length) {
    const out = prepareTranscriptForModel(project.planTranscript, project, sendImageParts);
    const extra = extraUser?.trim();
    const newestMain = [...project.messages].reverse().find((m) => m.role === 'user');
    const newestMsg: APIMessage | undefined = extra
      ? { role: 'user', content: extra }
      : newestMain
        ? apiUserFromMainMessage(newestMain, project.files, sendImageParts)
        : undefined;
    const newestText = newestMsg ? apiMessageText(newestMsg.content) : '';
    const tail = out[out.length - 1];
    const tailText = tail ? apiMessageText(tail.content) : '';
    if (newestText && !(tail?.role === 'user' && tailText === newestText)) {
      out.push(newestMsg!);
    } else if (!newestText) {
      out.push({
        role: 'user',
        content: 'Continue planning this deck from the current workspace.',
      });
    }
    return out;
  }

  const out: APIMessage[] = [];
  for (const m of project.messages) {
    if (m.role !== 'user') continue;
    const msg = apiUserFromMainMessage(m, project.files, sendImageParts);
    if (!apiMessageText(msg.content).trim()) continue;
    out.push(msg);
  }
  const extra = extraUser?.trim();
  if (extra) {
    const last = out[out.length - 1];
    if (!last || apiMessageText(last.content) !== extra) {
      out.push({ role: 'user', content: extra });
    }
  }
  if (out.length === 0) {
    out.push({
      role: 'user',
      content: 'Continue planning this deck from the current workspace.',
    });
  }
  return out;
}
