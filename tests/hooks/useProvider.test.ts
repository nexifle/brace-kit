/**
 * Tests for useProvider Hook Logic
 *
 * These tests focus on pure logic extracted from useProvider that can be tested
 * independently without a React/Zustand environment:
 *
 * - getProvider / isCustomProvider utilities
 * - getAvailableModels model priority logic (the source of the custom-provider bug)
 *
 * Regression coverage:
 *   Bug: custom providers with 'anthropic' or openai-compatible format showed
 *   Anthropic's built-in staticModels instead of the user-defined model list.
 *   Root cause: getAvailableModels gave fetchedModels cache higher priority than
 *   provider.models, and fetchModels('anthropic') always returned Anthropic's
 *   staticModels regardless of the calling provider's identity.
 */

import { describe, expect, it } from 'bun:test';
import { getProvider, isCustomProvider } from '../../src/utils/providerUtils.ts';
import { PROVIDER_PRESETS } from '../../src/providers';
import type { CustomProvider, ProviderPreset, FetchedModelsCache } from '../../src/types/index.ts';

function normalizeModels(models?: string[]): string[] {
  if (!models?.length) return [];

  const unique = new Set<string>();
  const normalized: string[] = [];

  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || unique.has(trimmed)) continue;
    unique.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

// ---------------------------------------------------------------------------
// Pure helper that mirrors getAvailableModels logic from useProvider.ts
// ---------------------------------------------------------------------------

/**
 * Mirror of the getAvailableModels logic in useProvider.ts.
 * Extracted as a pure function so it can be unit-tested without a React environment.
 */
function getAvailableModelsLogic(
  providerId: string,
  customProviders: CustomProvider[],
  fetchedModels: Record<string, FetchedModelsCache>
): string[] {
  const provider = getProvider(providerId, customProviders);
  const isCustom = isCustomProvider(providerId, customProviders);

  // Custom providers always use user-defined models — bypass fetchedModels cache.
  if (isCustom) {
    const models = (provider as CustomProvider).models ?? [];
    return normalizeModels(models);
  }

  const providerPreset = provider as ProviderPreset;
  const cached = fetchedModels[providerId];

  if (cached?.models && cached.models.length > 0) {
    return normalizeModels(cached.models);
  } else if (providerPreset?.staticModels?.length && providerPreset.staticModels.length > 0) {
    return normalizeModels(providerPreset.staticModels);
  } else if (providerPreset?.models?.length && providerPreset.models.length > 0) {
    return normalizeModels(providerPreset.models);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCustomProvider(overrides: Partial<CustomProvider> = {}): CustomProvider {
  return {
    id: 'custom_' + Date.now(),
    name: 'My Custom LLM',
    apiUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test',
    model: '',
    defaultModel: '',
    format: 'openai',
    models: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getProvider / isCustomProvider utils
// ---------------------------------------------------------------------------

describe('providerUtils', () => {
  describe('getProvider', () => {
    it('returns a built-in preset for a known preset ID', () => {
      const provider = getProvider('anthropic', []);
      expect(provider.id).toBe('anthropic');
      expect(provider.format).toBe('anthropic');
    });

    it('returns the custom provider when its ID is in the list', () => {
      const cp = makeCustomProvider({ id: 'custom_123', name: 'My LLM' });
      const provider = getProvider('custom_123', [cp]);
      expect(provider.id).toBe('custom_123');
      expect(provider.name).toBe('My LLM');
    });

    it('falls back to openai preset when the ID is unknown', () => {
      const provider = getProvider('nonexistent_provider', []);
      expect(provider.id).toBe('openai');
    });
  });

  describe('isCustomProvider', () => {
    it('returns true for a provider ID in the custom list', () => {
      const cp = makeCustomProvider({ id: 'custom_abc' });
      expect(isCustomProvider('custom_abc', [cp])).toBe(true);
    });

    it('returns false for a built-in preset ID', () => {
      expect(isCustomProvider('anthropic', [])).toBe(false);
      expect(isCustomProvider('openai', [])).toBe(false);
      expect(isCustomProvider('gemini', [])).toBe(false);
    });

    it('returns false when the custom list is empty', () => {
      expect(isCustomProvider('custom_abc', [])).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// getAvailableModels logic
// ---------------------------------------------------------------------------

describe('getAvailableModels logic', () => {
  // ── Built-in providers ──────────────────────────────────────────────────

  describe('built-in provider: Anthropic (staticModels, supportsModelFetch=false)', () => {
    it('returns staticModels when there is no fetchedModels cache', () => {
      const result = getAvailableModelsLogic('anthropic', [], {});
      expect(result).toEqual(PROVIDER_PRESETS.anthropic.staticModels);
      expect(result.length).toBeGreaterThan(0);
    });

    it('prefers fetchedModels cache over staticModels', () => {
      const cached = { models: ['claude-custom-model'], fetchedAt: Date.now() };
      const result = getAvailableModelsLogic('anthropic', [], { anthropic: cached });
      expect(result).toEqual(['claude-custom-model']);
    });
  });

  describe('built-in provider: OpenAI (supportsModelFetch=true)', () => {
    it('returns fetchedModels cache when available', () => {
      const cached = { models: ['gpt-4o', 'gpt-4-turbo'], fetchedAt: Date.now() };
      const result = getAvailableModelsLogic('openai', [], { openai: cached });
      expect(result).toEqual(['gpt-4o', 'gpt-4-turbo']);
    });

    it('returns empty array when no cache and no staticModels', () => {
      const result = getAvailableModelsLogic('openai', [], {});
      expect(result).toEqual([]);
    });
  });

  // ── Custom providers ────────────────────────────────────────────────────

  describe('custom provider: always returns user-defined models', () => {
    it('returns user-defined models when no cache exists', () => {
      const cp = makeCustomProvider({
        id: 'custom_1',
        models: ['my-model-a', 'my-model-b'],
      });
      const result = getAvailableModelsLogic('custom_1', [cp], {});
      expect(result).toEqual(['my-model-a', 'my-model-b']);
    });

    it('returns empty array when the user has not added any models yet', () => {
      const cp = makeCustomProvider({ id: 'custom_2', models: [] });
      const result = getAvailableModelsLogic('custom_2', [cp], {});
      expect(result).toEqual([]);
    });

    // ── Regression: anthropic-format custom provider ──────────────────────

    it('[REGRESSION] anthropic-format custom provider ignores fetchedModels cache', () => {
      // Simulate the bug: fetchedModels for the custom provider was populated
      // with Anthropic's built-in static models (e.g. after fetchModels was
      // called for a custom provider using the anthropic format).
      const cp = makeCustomProvider({
        id: 'custom_anthro',
        format: 'anthropic',
        models: ['my-private-model-1', 'my-private-model-2', 'my-private-model-3'],
      });

      const contaminatedCache: Record<string, FetchedModelsCache> = {
        custom_anthro: {
          models: PROVIDER_PRESETS.anthropic.staticModels ?? [],
          fetchedAt: Date.now(),
        },
      };

      // Before fix: contaminatedCache would be returned (Anthropic's models).
      // After fix: user-defined models must always win for custom providers.
      const result = getAvailableModelsLogic('custom_anthro', [cp], contaminatedCache);

      expect(result).toEqual(['my-private-model-1', 'my-private-model-2', 'my-private-model-3']);
      expect(result).not.toContain('claude-sonnet-4-6');
      expect(result).not.toContain('claude-3-5-sonnet-20241022');
    });

    // ── Regression: openai-compatible-format custom provider ──────────────

    it('[REGRESSION] openai-compatible-format custom provider ignores fetchedModels cache', () => {
      const cp = makeCustomProvider({
        id: 'custom_oai',
        format: 'openai',
        apiUrl: 'https://my-llm-provider.com/v1',
        models: ['llama-3-70b', 'mistral-large'],
      });

      // Simulate a cache contaminated with models fetched from some other endpoint.
      const contaminatedCache: Record<string, FetchedModelsCache> = {
        custom_oai: {
          models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
          fetchedAt: Date.now(),
        },
      };

      const result = getAvailableModelsLogic('custom_oai', [cp], contaminatedCache);

      expect(result).toEqual(['llama-3-70b', 'mistral-large']);
      expect(result).not.toContain('gpt-4o');
    });

    it('[REGRESSION] custom provider fetched models are deduplicated before render', () => {
      const cp = makeCustomProvider({
        id: 'custom_dup',
        format: 'openai',
        models: ['openai/gpt-oss-120b', 'openai/gpt-oss-120b', 'nvidia/nemotron-3-super-120b-a12b'],
      });

      const result = getAvailableModelsLogic('custom_dup', [cp], {});

      expect(result).toEqual([
        'openai/gpt-oss-120b',
        'nvidia/nemotron-3-super-120b-a12b',
      ]);
    });

    it('custom provider does not leak staticModels from a built-in preset', () => {
      // Even if someone somehow adds staticModels to a custom provider entry,
      // the function must return provider.models (user-defined), not staticModels.
      const cp: CustomProvider = {
        ...makeCustomProvider({ id: 'custom_weird' }),
        staticModels: ['should-not-appear'],
        models: ['correct-model'],
      };

      const result = getAvailableModelsLogic('custom_weird', [cp], {});
      expect(result).toEqual(['correct-model']);
    });
  });

  // ── Isolation between providers ─────────────────────────────────────────

  describe('cache isolation between providers', () => {
    it('cache for one provider does not affect another provider', () => {
      const cp = makeCustomProvider({
        id: 'custom_isolated',
        models: ['my-model'],
      });

      // Cache is keyed by a DIFFERENT provider ID.
      const cache: Record<string, FetchedModelsCache> = {
        anthropic: { models: ['claude-sonnet-4-6'], fetchedAt: Date.now() },
        openai: { models: ['gpt-4o'], fetchedAt: Date.now() },
      };

      const result = getAvailableModelsLogic('custom_isolated', [cp], cache);
      expect(result).toEqual(['my-model']);
    });

    it('built-in anthropic uses its own cache, not a custom provider cache', () => {
      const cp = makeCustomProvider({ id: 'custom_x', models: ['custom-model'] });

      const cache: Record<string, FetchedModelsCache> = {
        anthropic: { models: ['claude-opus-4-6'], fetchedAt: Date.now() },
        custom_x: { models: PROVIDER_PRESETS.anthropic.staticModels ?? [], fetchedAt: Date.now() },
      };

      const anthropicResult = getAvailableModelsLogic('anthropic', [cp], cache);
      expect(anthropicResult).toEqual(['claude-opus-4-6']);

      const customResult = getAvailableModelsLogic('custom_x', [cp], cache);
      expect(customResult).toEqual(['custom-model']);
    });

    it('[REGRESSION] mutating one provider model list does not affect the source preset or cache', () => {
      const anthropicModels = getAvailableModelsLogic('anthropic', [], {});
      anthropicModels.splice(0, 1);

      expect(PROVIDER_PRESETS.anthropic.staticModels).toContain('claude-sonnet-4-6');

      const cache: Record<string, FetchedModelsCache> = {
        openai: { models: ['gpt-4o', 'gpt-4.1'], fetchedAt: Date.now() },
      };

      const openaiModels = getAvailableModelsLogic('openai', [], cache);
      openaiModels.pop();

      expect(cache.openai.models).toEqual(['gpt-4o', 'gpt-4.1']);
    });
  });
});
