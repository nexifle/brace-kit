import { useCallback, useState } from 'react';
import { MAX_FILE_SIZE } from '../types/index.ts';
import { MAX_SLIDE_IMAGE_SOURCE_BYTES, resizeSlideImageFile } from '../utils/slideImageResize.ts';
import {
  MAX_SLIDE_COMPOSER_ATTACHMENTS,
  type SlidePendingAttachment,
} from '../utils/slideUploads.ts';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function newId(): string {
  return `slatt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function classify(file: File): 'image' | 'text' | null {
  if (file.type.startsWith('image/') || IMAGE_TYPES.has(file.type)) return 'image';
  const name = file.name.toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp)$/.test(name)) return 'image';
  if (file.type === 'text/plain' || name.endsWith('.txt')) return 'text';
  return null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function processImage(file: File): Promise<SlidePendingAttachment> {
  if (file.size > MAX_SLIDE_IMAGE_SOURCE_BYTES) {
    throw new Error('Image is too large (max 12MB)');
  }
  const original = await readAsDataUrl(file);
  let preview = original;
  try {
    preview = (await resizeSlideImageFile(file)).dataUrl;
  } catch {
    // Keep the original as the vision/chip payload if compress fails (e.g. 300KB jpeg).
  }
  return {
    id: newId(),
    type: 'image',
    name: file.name,
    data: original,
    preview,
  };
}

async function processText(file: File): Promise<SlidePendingAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve({
        id: newId(),
        type: 'text',
        name: file.name,
        data: e.target?.result as string,
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function useSlideComposerAttachments() {
  const [attachments, setAttachments] = useState<SlidePendingAttachment[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);

  const addProcessed = useCallback((att: SlidePendingAttachment) => {
    setAttachments((prev) => {
      if (prev.filter((a) => a.type !== 'error').length >= MAX_SLIDE_COMPOSER_ATTACHMENTS) {
        return prev;
      }
      return [...prev, att];
    });
  }, []);

  const processFile = useCallback(async (file: File) => {
    const kind = classify(file);
    if (!kind) {
      addProcessed({ id: newId(), type: 'error', name: file.name, error: 'Unsupported file type' });
      return;
    }
    // Txt stays on the 2MB cap. Images keep the original in VFS (preview is resized separately).
    if (kind === 'text' && file.size > MAX_FILE_SIZE) {
      addProcessed({ id: newId(), type: 'error', name: file.name, error: 'File too large (max 2MB)' });
      return;
    }
    setLoadingCount((n) => n + 1);
    try {
      addProcessed(kind === 'image' ? await processImage(file) : await processText(file));
    } catch (err) {
      addProcessed({
        id: newId(),
        type: 'error',
        name: file.name,
        error: (err as Error).message,
      });
    } finally {
      setLoadingCount((n) => Math.max(0, n - 1));
    }
  }, [addProcessed]);

  const handleFileSelect = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      for (const file of Array.from(list)) await processFile(file);
    },
    [processFile],
  );

  const handlePaste = useCallback(
    async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const images = Array.from(items).filter((item) => item.type.startsWith('image/'));
      if (images.length === 0) return;
      e.preventDefault();
      for (const item of images) {
        const file = item.getAsFile();
        if (file) await processFile(file);
      }
    },
    [processFile],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => setAttachments([]), []);

  const valid = attachments.filter((a) => a.type !== 'error' && a.data);

  return {
    attachments,
    valid,
    handleFileSelect,
    handlePaste,
    processFile,
    removeAttachment,
    clearAttachments,
    loading: loadingCount > 0,
  };
}
