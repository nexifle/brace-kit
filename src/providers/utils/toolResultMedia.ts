import type { Message, MessageContent } from '../../types/index.ts';

export interface ToolResultImage {
  mimeType: string;
  /** Raw base64 payload, without a data-URL prefix. */
  data: string;
  dataUrl: string;
  displayName: string;
}

export interface ToolResultMedia {
  text: string;
  images: ToolResultImage[];
}

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function toImage(raw: string, displayName: string): ToolResultImage | null {
  if (raw.startsWith('data:')) {
    const parsed = parseDataUrl(raw);
    if (!parsed) return null;
    return {
      mimeType: parsed.mimeType,
      data: parsed.data,
      dataUrl: raw,
      displayName,
    };
  }
  return {
    mimeType: 'image/png',
    data: raw,
    dataUrl: `data:image/png;base64,${raw}`,
    displayName,
  };
}

function pushUnique(images: ToolResultImage[], next: ToolResultImage): void {
  if (images.some((existing) => existing.data === next.data)) return;
  images.push(next);
}

/** Split a tool message into answer text + inline images for provider formatters. */
export function extractToolResultMedia(msg: Message): ToolResultMedia {
  const content = msg.content as MessageContent | unknown;
  let text = '';
  const images: ToolResultImage[] = [];

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const item of content) {
      if (item.type === 'text' && item.text) texts.push(item.text);
      if (item.type === 'image_url') {
        const imageUrl = item.image_url?.url || (item.image_url as unknown as string);
        if (typeof imageUrl === 'string') {
          const image = toImage(imageUrl, `ask-ref-${images.length + 1}`);
          if (image) pushUnique(images, image);
        }
      }
    }
    text = texts.join('\n');
  } else if (content != null) {
    text = JSON.stringify(content);
  }

  if (msg.attachments) {
    for (const att of msg.attachments) {
      if (att.type !== 'image' || !att.data) continue;
      const image = toImage(att.data, att.name || `ask-ref-${images.length + 1}`);
      if (image) pushUnique(images, image);
    }
  }

  return { text, images };
}
