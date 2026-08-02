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
  /** Soft tint used for active-row accents */
  soft: string;
}

export const PROVIDER_BRANDS: Record<string, ProviderBrand> = {
  openai: { color: '#10a37f', fg: '#ffffff', soft: 'rgba(16, 163, 127, 0.14)' },
  anthropic: { color: '#d97757', fg: '#ffffff', soft: 'rgba(217, 119, 87, 0.14)' },
  gemini: { color: '#4285f4', fg: '#ffffff', soft: 'rgba(66, 133, 244, 0.14)' },
  xai: { color: '#18181b', fg: '#ffffff', soft: 'rgba(24, 24, 27, 0.14)' },
  groq: { color: '#f55036', fg: '#ffffff', soft: 'rgba(245, 80, 54, 0.14)' },
  deepseek: { color: '#4d6bfe', fg: '#ffffff', soft: 'rgba(77, 107, 254, 0.14)' },
  ollama: { color: '#3f3f46', fg: '#ffffff', soft: 'rgba(63, 63, 70, 0.14)' },
};

/** Fallback identity for user-added custom providers */
export const CUSTOM_BRAND: ProviderBrand = {
  color: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  fg: '#ffffff',
  soft: 'rgba(99, 102, 241, 0.14)',
};
