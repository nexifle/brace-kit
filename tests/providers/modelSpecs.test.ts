import { describe, expect, it } from 'bun:test';
import {
  parseOpenAICompatModel,
  parseAnthropicModel,
  parseGeminiModel,
  parseOllamaShow,
  resolveModelSpec,
  overlayCatalog,
  mergeSpecs,
  specSupportsTools,
  specSupportsReasoning,
  specAllowsComposerKind,
  migrateCustomProvider,
} from '../../src/providers/modelSpecs.ts';
import { MODEL_CATALOG } from '../../src/providers/modelCatalog.ts';
import { PROVIDER_PRESETS } from '../../src/providers/presets.ts';

describe('MODEL_CATALOG', () => {
  it('merges partial capability patches without dropping chat defaults', () => {
    const oss = MODEL_CATALOG.openai['gpt-oss'];
    expect(oss.capabilities?.vision).toBe(false);
    expect(oss.capabilities?.tools).toBe(true);
    expect(oss.capabilities?.reasoning).toBe(true);
    const nonReason = MODEL_CATALOG.xai['grok-4.20-0309-non-reasoning'];
    expect(nonReason.capabilities?.reasoning).toBe(false);
    expect(nonReason.capabilities?.tools).toBe(true);
  });

  it('covers every static model id with a context limit', () => {
    for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
      for (const modelId of preset.staticModels || []) {
        const spec = MODEL_CATALOG[id]?.[modelId];
        expect(spec).toBeDefined();
        expect(spec.id).toBe(modelId);
        expect(spec.limit?.context).toBeGreaterThan(0);
      }
    }
  });
});

describe('parseOpenAICompatModel', () => {
  it('maps OpenRouter-style fields', () => {
    const spec = parseOpenAICompatModel({
      id: 'openai/gpt-4',
      name: 'GPT-4',
      context_length: 8192,
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
      top_provider: { max_completion_tokens: 4096 },
      supported_parameters: ['temperature', 'tools'],
    });
    expect(spec?.id).toBe('openai/gpt-4');
    expect(spec?.limit?.context).toBe(8192);
    expect(spec?.limit?.output).toBe(4096);
    expect(spec?.capabilities?.tools).toBe(true);
    expect(spec?.modalities?.input).toContain('image');
  });

  it('maps xAI context_length and imagine image_price', () => {
    const spec = parseOpenAICompatModel({
      id: 'grok-imagine-image',
      context_length: 1024,
      image_price: 200000000,
    });
    expect(spec?.mode).toBe('image_generation');
    expect(spec?.limit?.context).toBe(1024);
  });

  it('ignores official OpenAI objects with no limits', () => {
    const spec = parseOpenAICompatModel({
      id: 'gpt-5.2',
      object: 'model',
      created: 1,
      owned_by: 'openai',
    });
    expect(spec?.id).toBe('gpt-5.2');
    expect(spec?.limit).toBeUndefined();
  });
});

describe('parseAnthropicModel', () => {
  it('maps ModelInfo capabilities and treats 0 as missing', () => {
    const spec = parseAnthropicModel({
      id: 'claude-opus-4-6',
      display_name: 'Claude Opus 4.6',
      max_input_tokens: 0,
      max_tokens: 0,
      capabilities: {
        image_input: { supported: true },
        thinking: { supported: true },
        effort: { supported: true },
      },
    });
    expect(spec?.name).toBe('Claude Opus 4.6');
    expect(spec?.limit).toBeUndefined();
    expect(spec?.capabilities?.vision).toBe(true);
    expect(spec?.reasoningControl).toBe('effort');
  });
});

describe('parseGeminiModel', () => {
  it('maps token limits and strips models/ prefix', () => {
    const spec = parseGeminiModel({
      name: 'models/gemini-2.5-flash',
      displayName: 'Gemini 2.5 Flash',
      inputTokenLimit: 1048576,
      outputTokenLimit: 65536,
      supportedGenerationMethods: ['generateContent'],
      thinking: true,
    });
    expect(spec?.id).toBe('gemini-2.5-flash');
    expect(spec?.limit?.context).toBe(1048576);
    expect(spec?.limit?.output).toBe(65536);
    expect(spec?.capabilities?.tools).toBe(true);
  });

  it('skips models without generateContent', () => {
    expect(parseGeminiModel({
      name: 'models/embedding-001',
      supportedGenerationMethods: ['embedContent'],
    })).toBeNull();
  });
});

describe('parseOllamaShow', () => {
  it('reads family.context_length and vision capability', () => {
    const spec = parseOllamaShow('llama3.2', {
      details: { family: 'llama' },
      model_info: { 'llama.context_length': 131072 },
      capabilities: ['completion', 'vision'],
    });
    expect(spec?.limit?.context).toBe(131072);
    expect(spec?.capabilities?.vision).toBe(true);
  });
});

describe('resolveModelSpec', () => {
  it('prefers custom user spec over live and catalog', () => {
    const spec = resolveModelSpec({
      providerId: 'openai',
      modelId: 'gpt-5.6-sol',
      custom: {
        id: 'custom_1',
        name: 'Mine',
        apiUrl: '',
        apiKey: '',
        model: 'gpt-5.6-sol',
        defaultModel: 'gpt-5.6-sol',
        format: 'openai',
        models: ['gpt-5.6-sol'],
        modelSpecs: { 'gpt-5.6-sol': { id: 'gpt-5.6-sol', limit: { context: 99 } } },
      },
      fetched: {
        models: ['gpt-5.6-sol'],
        fetchedAt: 1,
        specs: { 'gpt-5.6-sol': { id: 'gpt-5.6-sol', limit: { context: 123 } } },
      },
    });
    expect(spec.limit?.context).toBe(99);
  });

  it('uses catalog when fetch has no limits', () => {
    const spec = overlayCatalog('openai', { id: 'gpt-5.6-sol' });
    expect(spec.limit?.context).toBe(1_050_000);
  });
});

describe('capability helpers', () => {
  it('blocks tools and reasoning when the spec says so', () => {
    const spec = {
      id: 'x',
      capabilities: { tools: false, reasoning: false },
      modalities: { input: ['text' as const], output: ['text' as const] },
    };
    expect(specSupportsTools(spec)).toBe(false);
    expect(specSupportsReasoning(spec)).toBe(false);
    expect(specAllowsComposerKind(spec, 'image')).toBe(false);
    expect(specAllowsComposerKind(spec, 'text')).toBe(true);
  });
});

describe('migrateCustomProvider', () => {
  it('copies provider-level contextWindow onto every model without a spec context', () => {
    const migrated = migrateCustomProvider({
      id: 'custom_1',
      name: 'Mine',
      apiUrl: '',
      apiKey: '',
      model: 'a',
      defaultModel: 'a',
      format: 'openai',
      models: ['a', 'b'],
      contextWindow: 32000,
      modelSpecs: { a: { id: 'a' }, b: { id: 'b' } },
    });
    expect(migrated.modelSpecs?.a.limit?.context).toBe(32000);
    expect(migrated.modelSpecs?.b.limit?.context).toBe(32000);
  });

  it('does not overwrite a model that already has context', () => {
    const migrated = migrateCustomProvider({
      id: 'custom_1',
      name: 'Mine',
      apiUrl: '',
      apiKey: '',
      model: 'a',
      defaultModel: 'a',
      format: 'openai',
      models: ['a', 'b'],
      contextWindow: 32000,
      modelSpecs: {
        a: { id: 'a', limit: { context: 8000 } },
        b: { id: 'b' },
      },
    });
    expect(migrated.modelSpecs?.a.limit?.context).toBe(8000);
    expect(migrated.modelSpecs?.b.limit?.context).toBe(32000);
  });
});

describe('mergeSpecs', () => {
  it('merges nested limit objects', () => {
    const merged = mergeSpecs(
      { id: 'a', limit: { context: 100, output: 10 } },
      { id: 'a', limit: { output: 20 } },
    );
    expect(merged.limit?.context).toBe(100);
    expect(merged.limit?.output).toBe(20);
  });
});
