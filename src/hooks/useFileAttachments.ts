import { useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { FileAttachment } from '../types/index.ts';
import {
  classifyComposerFile,
  clipboardImageFiles,
  composerFileSizeError,
} from '../utils/composerAttachments.ts';
import { encodeImageForVision } from '../utils/slideImageResize.ts';

function newId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function useFileAttachments() {
  const store = useStore();

  const processFile = useCallback(async (file: File): Promise<void> => {
    const kind = classifyComposerFile(file, { allowPdf: true });
    if (!kind) {
      store.addAttachment({
        id: newId(),
        file,
        type: 'error',
        name: file.name || 'Attachment',
        error: 'Unsupported file type',
      });
      return;
    }

    const sizeError = composerFileSizeError(kind, file.size);
    if (sizeError) {
      store.addAttachment({
        id: newId(),
        file,
        type: 'error',
        name: file.name || 'Attachment',
        error: sizeError,
      });
      return;
    }

    try {
      if (kind === 'image') {
        await processImageFile(file, store.addAttachment);
      } else if (kind === 'text') {
        await processTextFile(file, store.addAttachment);
      } else {
        await processPdfFile(file, store.addAttachment);
      }
    } catch (err) {
      store.addAttachment({
        id: newId(),
        file,
        type: 'error',
        name: file.name || 'Attachment',
        error: (err as Error).message,
      });
    }
  }, [store]);

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      await processFile(file);
    }
  }, [processFile]);

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const images = clipboardImageFiles(e.clipboardData);
    if (images.length > 0) {
      e.preventDefault();
      for (const file of images) await processFile(file);
      return;
    }

    // Long pasted text becomes a .txt attachment
    const pastedText = e.clipboardData?.getData('text');
    if (!pastedText) return;

    const lineCount = pastedText.split('\n').length;
    if (lineCount > 250) {
      e.preventDefault();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = new File([pastedText], `pasted-text-${timestamp}.txt`, { type: 'text/plain' });
      await processFile(file);
    }
  }, [processFile]);

  const removeAttachment = useCallback((id: string) => {
    store.removeAttachment(id);
  }, [store]);

  const clearAllAttachments = useCallback(() => {
    store.clearAttachments();
  }, [store]);

  return {
    attachments: store.attachments,
    processFile,
    handleFileSelect,
    handlePaste,
    removeAttachment,
    clearAllAttachments,
  };
}

async function processImageFile(
  file: File,
  addAttachment: (att: FileAttachment) => void,
): Promise<void> {
  const { dataUrl, width, height } = await encodeImageForVision(file);
  addAttachment({
    id: newId(),
    file,
    type: 'image',
    name: file.name || 'pasted-image.jpg',
    data: dataUrl,
    width,
    height,
  });
}

async function processTextFile(
  file: File,
  addAttachment: (att: FileAttachment) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addAttachment({
        id: newId(),
        file,
        type: 'text',
        name: file.name,
        data: e.target?.result as string,
      });
      resolve();
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

async function processPdfFile(
  file: File,
  addAttachment: (att: FileAttachment) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addAttachment({
        id: newId(),
        file,
        type: 'pdf',
        name: file.name,
        data: e.target?.result as string,
      });
      resolve();
    };
    reader.onerror = () => reject(new Error('Failed to read PDF'));
    reader.readAsDataURL(file);
  });
}
