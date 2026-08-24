import { describe, expect, test } from 'bun:test';
import { fitBox, fitScale } from '../../src/utils/slideFit.ts';

describe('fitBox', () => {
  test('letterboxes a 16:9 canvas into a wider pane', () => {
    // 1000x400 pane, 16:9 → height-limited: h=400-0, w=400*(16/9)
    const box = fitBox(1000, 400, 16 / 9, 0);
    expect(box.height).toBeCloseTo(400, 5);
    expect(box.width).toBeCloseTo(400 * (16 / 9), 5);
  });

  test('pillarboxes a 16:9 canvas into a taller pane', () => {
    // 400x1000 pane, 16:9 → width-limited
    const box = fitBox(400, 1000, 16 / 9, 0);
    expect(box.width).toBeCloseTo(400, 5);
    expect(box.height).toBeCloseTo(400 / (16 / 9), 5);
  });

  test('applies uniform inset before fitting', () => {
    const box = fitBox(800, 600, 1, 100);
    // usable 700x500 → square limited by height → 500x500
    expect(box.width).toBeCloseTo(500, 5);
    expect(box.height).toBeCloseTo(500, 5);
  });

  test('returns a 1x1 floor for empty/invalid panes', () => {
    expect(fitBox(0, 0, 16 / 9, 0)).toEqual({ width: 1, height: 1 });
    expect(fitBox(100, 100, 0, 0)).toEqual({ width: 1, height: 1 });
    expect(fitBox(10, 10, 16 / 9, 100)).toEqual({ width: 1, height: 1 });
  });
});

describe('fitScale', () => {
  test('maps fitted width onto native canvas width', () => {
    expect(fitScale(960, 1920)).toBeCloseTo(0.5, 5);
    expect(fitScale(1920, 1920)).toBeCloseTo(1, 5);
  });

  test('guards zero native width', () => {
    expect(fitScale(100, 0)).toBe(1);
  });
});
