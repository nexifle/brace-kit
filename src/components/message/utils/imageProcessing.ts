import { resizeComposerImageFile } from '../../../utils/slideImageResize.ts';

/**
 * Process an image file for editing (resize/compress via shared composer path).
 */
export async function processImageForEdit(file: File): Promise<string> {
  const { dataUrl } = await resizeComposerImageFile(file);
  return dataUrl;
}

/**
 * Read file as data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Copy image to clipboard
 */
export function copyImageToClipboard(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(false);
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(false);
          return;
        }
        navigator.clipboard
          .write([new ClipboardItem({ 'image/png': blob })])
          .then(() => resolve(true))
          .catch(() => resolve(false));
      }, 'image/png');
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}
