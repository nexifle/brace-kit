import { describe, expect, test } from 'bun:test';
import {
  fitInsideBox,
  jpegUploadName,
  pickCompressedJpeg,
  utf8ByteLength,
} from '../../src/utils/slideImageResize.ts';

describe('fitInsideBox', () => {
  test('leaves small images alone', () => {
    expect(fitInsideBox(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  test('scales the long edge down', () => {
    expect(fitInsideBox(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(fitInsideBox(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
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
  test('stops at the first encode under the byte cap', () => {
    const encode = (w: number, h: number, q: number) => `data:image/jpeg;base64,${'A'.repeat(Math.round(80 * q + w / 20))}`;
    const picked = pickCompressedJpeg(4000, 3000, encode, 200);
    expect(picked.width).toBeLessThanOrEqual(1024);
    expect(picked.height).toBeLessThanOrEqual(1024);
    expect(utf8ByteLength(picked.dataUrl)).toBeLessThanOrEqual(200);
  });

  test('throws when even the smallest encode exceeds the cap', () => {
    const encode = () => `data:image/jpeg;base64,${'B'.repeat(5000)}`;
    expect(() => pickCompressedJpeg(100, 100, encode, 50)).toThrow(/too large/i);
  });
});
