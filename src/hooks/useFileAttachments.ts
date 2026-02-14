import { useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { FileAttachment } from '../types/index.ts';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_IMAGE_DIMENSION = 1024;

const ALLOWED_FILE_TYPES: Record<string, 'image' | 'text' | 'pdf'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'text/plain': 'text',
  'text/csv': 'text',
  'application/pdf': 'pdf',
};

export function useFileAttachments() {
  const store = useStore();

  const processFile = useCallback(async (file: File): Promise<void> => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      store.addAttachment({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        type: 'error',
        name: file.name,
        error: 'File too large (max 2MB)',
      });
      return;
    }

    const fileType = ALLOWED_FILE_TYPES[file.type];
    if (!fileType) {
      store.addAttachment({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        type: 'error',
        name: file.name,
        error: 'Unsupported file type',
      });
      return;
    }

    try {
      if (fileType === 'image') {
        await processImageFile(file, store.addAttachment);
      } else if (fileType === 'text') {
        await processTextFile(file, store.addAttachment);
      } else if (fileType === 'pdf') {
        await processPdfFile(file, store.addAttachment);
      }
    } catch (err) {
      store.addAttachment({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        file,
        type: 'error',
        name: file.name,
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
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (imageItems.length > 0) {
      // Ada gambar di clipboard — cegah paste teks default supaya tidak dobel
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) await processFile(file);
      }
      return;
    }

    // Cek apakah teks yang di-paste melebihi 250 baris
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
  addAttachment: (att: FileAttachment) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Resize image if needed
        let { width, height } = img;
        if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
          const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Draw to canvas and get base64
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        // Get base64 data (JPEG for smaller size)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

        addAttachment({
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          file,
          type: 'image',
          name: file.name,
          data: dataUrl,
          width,
          height,
        });
        resolve();
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

async function processTextFile(
  file: File,
  addAttachment: (att: FileAttachment) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addAttachment({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
  addAttachment: (att: FileAttachment) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      addAttachment({
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
