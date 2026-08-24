import { useCallback, useState } from 'react';
import {
  classifyComposerFile,
  clipboardImageFiles,
  composerFileSizeError,
} from '../utils/composerAttachments.ts';
import { encodeImageForVision, encodeImageForVfs } from '../utils/slideImageResize.ts';
import {
  MAX_SLIDE_COMPOSER_ATTACHMENTS,
  type SlidePendingAttachment,
} from '../utils/slideUploads.ts';

function newId(): string {
  return `slatt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
  const sizeError = composerFileSizeError('image', file.size);
  if (sizeError) throw new Error(sizeError);
  const original = await readAsDataUrl(file);
  let data = original;
  try {
    data = await encodeImageForVfs(file, original);
  } catch {
    // Keep the original bytes in VFS if archive encode fails.
  }
  let preview = data;
  try {
    preview = (await encodeImageForVision(file, original)).dataUrl;
  } catch {
    // Keep the VFS payload as vision if compress fails.
  }
  return {
    id: newId(),
    type: 'image',
    name: file.name || 'pasted-image.jpg',
    data,
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
    const kind = classifyComposerFile(file, { allowPdf: false });
    if (!kind || kind === 'pdf') {
      addProcessed({
        id: newId(),
        type: 'error',
        name: file.name || 'Attachment',
        error: 'Unsupported file type',
      });
      return;
    }
    const sizeError = composerFileSizeError(kind, file.size);
    if (sizeError) {
      addProcessed({
        id: newId(),
        type: 'error',
        name: file.name || 'Attachment',
        error: sizeError,
      });
      return;
    }
    setLoadingCount((n) => n + 1);
    try {
      addProcessed(kind === 'image' ? await processImage(file) : await processText(file));
    } catch (err) {
      addProcessed({
        id: newId(),
        type: 'error',
        name: file.name || 'Attachment',
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
      const images = clipboardImageFiles(e.clipboardData);
      if (images.length === 0) return;
      e.preventDefault();
      for (const file of images) await processFile(file);
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
