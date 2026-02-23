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
