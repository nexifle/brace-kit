/**
 * Provider Brand Identity
 *
 * Small visual identity per provider: a colored monogram chip + soft accent tint.
 * Used by the ProviderSelect component to make each provider instantly recognizable.
 */

export interface ProviderBrand {
  /** Background of the monogram chip (hex or CSS gradient) */
  color: string;
  /** Foreground (monogram letter) color */
  fg: string;
}

export const PROVIDER_BRANDS: Record<string, ProviderBrand> = {
  openai: { color: '#10a37f', fg: '#ffffff' },
  anthropic: { color: '#d97757', fg: '#ffffff' },
  gemini: { color: '#4285f4', fg: '#ffffff' },
  xai: { color: '#18181b', fg: '#ffffff' },
  groq: { color: '#f55036', fg: '#ffffff' },
  deepseek: { color: '#4d6bfe', fg: '#ffffff' },
  ollama: { color: '#3f3f46', fg: '#ffffff' },
};

/** Fallback identity for user-added custom providers */
export const CUSTOM_BRAND: ProviderBrand = {
  color: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  fg: '#ffffff',
};

/**
 * Distinct palette for user-defined providers. Each custom provider id is
 * hashed onto this palette (stable), so every custom provider gets its own
 * recognizable color instead of sharing one fallback. 700-level shades keep
 * white monogram text readable.
 */
export const CUSTOM_PALETTE: string[] = [
  '#b91c1c', // red
  '#c2410c', // orange
  '#b45309', // amber
  '#4d7c0f', // lime
  '#047857', // emerald
  '#0f766e', // teal
  '#0e7490', // cyan
  '#1d4ed8', // blue
  '#4338ca', // indigo
  '#6d28d9', // violet
  '#be185d', // pink
  '#334155', // slate
];

/**
 * Resolve the brand identity for a provider id.
 * Built-ins use their real brand color; anything else (custom providers,
 * gateways) is hashed onto CUSTOM_PALETTE so the color is stable per id and
 * distinct across different custom providers.
 */
export function resolveProviderBrand(id: string): ProviderBrand {
  const builtIn = PROVIDER_BRANDS[id];
  if (builtIn) return builtIn;
  if (!id) return CUSTOM_BRAND;

  // FNV-1a — deterministic 32-bit hash.
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const color = CUSTOM_PALETTE[(hash >>> 0) % CUSTOM_PALETTE.length];
  return { color, fg: '#ffffff' };
}
