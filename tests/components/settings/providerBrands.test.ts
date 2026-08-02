import { describe, test, expect } from 'bun:test';
import {
  PROVIDER_BRANDS,
  CUSTOM_BRAND,
  CUSTOM_PALETTE,
  resolveProviderBrand,
} from '../../../src/components/settings/providerBrands.ts';

describe('resolveProviderBrand', () => {
  test('built-in providers keep their real brand colors', () => {
    for (const [id, brand] of Object.entries(PROVIDER_BRANDS)) {
      expect(resolveProviderBrand(id)).toEqual(brand);
    }
  });

  test('empty id falls back to the legacy custom brand', () => {
    expect(resolveProviderBrand('')).toBe(CUSTOM_BRAND);
  });

  test('same custom id always resolves to the same color (stable hash)', () => {
    const a = resolveProviderBrand('custom_1700000000000');
    const b = resolveProviderBrand('custom_1700000000000');
    expect(a).toEqual(b);
  });

  test('custom ids resolve onto the palette with white foreground', () => {
    for (const id of ['custom', 'custom_1700000000000', 'gateway-a', 'my-openrouter']) {
      const brand = resolveProviderBrand(id);
      expect(brand.fg).toBe('#ffffff');
      expect(CUSTOM_PALETTE).toContain(brand.color);
    }
  });

  test('different custom ids spread across the palette (not all identical)', () => {
    const colors = new Set(
      Array.from({ length: 40 }, (_, i) => resolveProviderBrand(`custom_${i}`).color)
    );
    expect(colors.size).toBeGreaterThan(4);
  });
});
