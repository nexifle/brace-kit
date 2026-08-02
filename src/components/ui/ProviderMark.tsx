import { PROVIDER_BRANDS, CUSTOM_BRAND } from '../settings/providerBrands.ts';

/**
 * Colored monogram chip for a provider. Falls back to the custom-provider
 * gradient identity when the provider id has no brand entry.
 */
export function ProviderMark({ id, name, size = 30 }: { id: string; name: string; size?: number }) {
  const brand = PROVIDER_BRANDS[id] ?? CUSTOM_BRAND;
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <span
      className="flex items-center justify-center font-bold shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: brand.color,
        color: brand.fg,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.16), 0 1px 2px rgba(0,0,0,0.18)`,
      }}
    >
      {letter}
    </span>
  );
}
