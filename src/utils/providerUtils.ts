import { PROVIDER_PRESETS } from '../providers';
import type { ProviderPreset, CustomProvider } from '../types/index.ts';

export function getProvider(
  providerId: string,
  customProviders: CustomProvider[]
): ProviderPreset | CustomProvider {
  if (PROVIDER_PRESETS[providerId]) return PROVIDER_PRESETS[providerId];
  const custom = customProviders.find((cp) => cp.id === providerId);
  if (custom) return custom;
  return PROVIDER_PRESETS.openai;
}

export function isCustomProvider(providerId: string, customProviders: CustomProvider[]): boolean {
  return customProviders.some((cp) => cp.id === providerId);
}

/**
 * Check if a provider is Ollama running on localhost
 * Localhost Ollama doesn't require an API key
 *
 * @param format - Provider format (e.g., 'ollama', 'openai')
 * @param apiUrl - API URL to check
 * @returns true if format is 'ollama' and URL points to localhost
 */
export function isOllamaLocalhost(format: string | undefined, apiUrl: string | undefined): boolean {
  if (format !== 'ollama' || !apiUrl) return false;
  return apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1');
}
