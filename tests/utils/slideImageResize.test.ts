import { describe, expect, test } from 'bun:test';
import {
  dataUrlBinaryBytes,
  fitEncodeSize,
  fitInsideBox,
  jpegUploadName,
  pickCompressedJpeg,
  utf8ByteLength,
  vfsNeedsReencode,
} from '../../src/utils/slideImageResize.ts';
import {
  MAX_COMPOSER_IMAGE_DATA_BYTES,
  MAX_COMPOSER_IMAGE_EDGE,
  MAX_VFS_IMAGE_BYTES,
  MAX_VFS_IMAGE_SIDE_PX,
} from '../../src/utils/composerAttachments.ts';

describe('fitInsideBox', () => {
  test('leaves small images alone', () => {
    expect(fitInsideBox(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  test('scales the long edge down', () => {
    expect(fitInsideBox(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitInsideBox(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });
});

describe('fitEncodeSize', () => {
  test('applies both side and pixel caps', () => {
    const { width, height } = fitEncodeSize(4000, 3000, 2000, 2_408_448);
    expect(width).toBeLessThanOrEqual(2000);
    expect(height).toBeLessThanOrEqual(2000);
    expect(width * height).toBeLessThanOrEqual(2_408_448);
  });

  test('does not upscale', () => {
    expect(fitEncodeSize(800, 600, 2000, 2_408_448)).toEqual({ width: 800, height: 600 });
  });
});

describe('dataUrlBinaryBytes', () => {
  test('counts payload not UTF-8 of the data URL', () => {
    const payload = 'AAAA'; // 4 chars → 3 bytes
    const url = `data:image/jpeg;base64,${payload}`;
    expect(dataUrlBinaryBytes(url)).toBe(3);
    expect(utf8ByteLength(url)).toBeGreaterThan(dataUrlBinaryBytes(url));
  });
});

describe('jpegUploadName', () => {
  test('replaces any extension with .jpg', () => {
    expect(jpegUploadName('Logo.PNG')).toBe('Logo.jpg');
    expect(jpegUploadName('hero.webp')).toBe('hero.jpg');
    expect(jpegUploadName('noext')).toBe('noext.jpg');
  });
});

describe('pickCompressedJpeg', () => {
  test('stops at the first encode under the binary byte cap', () => {
    const encode = (_w: number, _h: number, q: number) => {
      const n = Math.round(80 * q + 40);
      return `data:image/jpeg;base64,${'A'.repeat(n)}`;
    };
    const picked = pickCompressedJpeg(4000, 3000, encode, 80, {
      maxSide: 2000,
      maxPixels: 2_408_448,
      qualitySteps: [0.88, 0.8, 0.32],
    });
    expect(picked.width).toBeLessThanOrEqual(2000);
    expect(picked.height).toBeLessThanOrEqual(2000);
    expect(dataUrlBinaryBytes(picked.dataUrl)).toBeLessThanOrEqual(80);
  });

  test('quality-only keeps native size', () => {
    const encode = (w: number, h: number) =>
      `data:image/jpeg;base64,${'A'.repeat(4)}`;
    const picked = pickCompressedJpeg(3000, 2000, encode, 1000, {
      qualityOnly: true,
      qualitySteps: [0.88],
    });
    expect(picked.width).toBe(3000);
    expect(picked.height).toBe(2000);
  });

  test('throws when even the smallest encode exceeds the cap', () => {
    const encode = () => `data:image/jpeg;base64,${'B'.repeat(5000)}`;
    expect(() => pickCompressedJpeg(100, 100, encode, 50)).toThrow(/too large/i);
  });

  test('vision defaults use 2000px and 1.5MB', () => {
    expect(MAX_COMPOSER_IMAGE_EDGE).toBe(2000);
    expect(MAX_COMPOSER_IMAGE_DATA_BYTES).toBe(1_500_000);
  });
});

describe('vfsNeedsReencode', () => {
  test('keeps originals at or under 4K and 9MB', () => {
    expect(vfsNeedsReencode(4096, 2160, MAX_VFS_IMAGE_BYTES)).toBeNull();
    expect(vfsNeedsReencode(800, 600, 1000)).toBeNull();
  });

  test('quality-only when over 9MB but not over 4K', () => {
    expect(vfsNeedsReencode(1920, 1080, MAX_VFS_IMAGE_BYTES + 1)).toEqual({ qualityOnly: true });
  });

  test('scales when over 4K', () => {
    expect(vfsNeedsReencode(MAX_VFS_IMAGE_SIDE_PX + 1, 3000, 1000)).toEqual({ qualityOnly: false });
  });
});
