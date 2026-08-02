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
