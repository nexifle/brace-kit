/** Built-in fallback specs (context, max output, modalities, capabilities). */

import type { ModelSpec } from '../types/index.ts';

const TEXT: ModelSpec['modalities'] = { input: ['text'], output: ['text'] };
const TEXT_IMAGE_IN: ModelSpec['modalities'] = { input: ['text', 'image'], output: ['text'] };
const IMAGE_OUT: ModelSpec['modalities'] = { input: ['text', 'image'], output: ['image'] };

function chat(
  id: string,
  context: number,
  output: number,
  extra: Partial<ModelSpec> = {},
): ModelSpec {
  const { capabilities: extraCaps, limit: extraLimit, modalities, reasoningControl, ...rest } = extra;
  return {
    mode: 'chat',
    ...rest,
    id,
    modalities: modalities ?? TEXT_IMAGE_IN,
    capabilities: {
      tools: true,
      vision: true,
      reasoning: true,
      structuredOutput: true,
      ...extraCaps,
    },
    reasoningControl: reasoningControl ?? 'effort',
    limit: { context, output, ...extraLimit },
  };
}

function imageGen(id: string, extra: Partial<ModelSpec> = {}): ModelSpec {
  const { capabilities: extraCaps, limit: extraLimit, modalities, ...rest } = extra;
  return {
    mode: 'image_generation',
    ...rest,
    id,
    modalities: modalities ?? IMAGE_OUT,
    capabilities: {
      tools: false,
      vision: true,
      reasoning: false,
      imageGeneration: true,
      googleSearch: false,
      ...extraCaps,
    },
    limit: { context: extraLimit?.context ?? 1024, output: extraLimit?.output },
  };
}

export const MODEL_CATALOG: Record<string, Record<string, ModelSpec>> = {
  openai: Object.fromEntries(
    [
      chat('gpt-5.6-sol', 1_050_000, 128_000),
      chat('gpt-5.6-terra', 1_050_000, 128_000),
      chat('gpt-5.6-luna', 1_050_000, 128_000),
      chat('gpt-5.5', 1_050_000, 128_000),
      chat('gpt-5.4', 1_050_000, 128_000),
      chat('gpt-oss', 131_072, 131_072, { modalities: { ...TEXT }, capabilities: { vision: false } }),
    ].map((s) => [s.id, s]),
  ),
  anthropic: Object.fromEntries(
    [
      chat('claude-fable-5', 1_000_000, 128_000),
      chat('claude-opus-5', 1_000_000, 128_000),
      chat('claude-sonnet-5', 1_000_000, 128_000),
      chat('claude-haiku-4-5', 200_000, 64_000),
      chat('claude-opus-4-8', 1_000_000, 128_000),
      chat('claude-opus-4-7', 1_000_000, 128_000),
      chat('claude-opus-4-6', 1_000_000, 128_000),
      chat('claude-sonnet-4-6', 1_000_000, 128_000),
      chat('claude-opus-4-5', 200_000, 64_000, { reasoningControl: 'budget' }),
      chat('claude-sonnet-4-5', 200_000, 64_000, { reasoningControl: 'budget' }),
    ].map((s) => [s.id, s]),
  ),
  gemini: Object.fromEntries(
    [
      chat('gemini-3.6-flash', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-3.5-flash', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-3.5-flash-lite', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-3.1-pro', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-3.1-flash', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-3.1-flash-lite', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-3-flash', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'effort',
      }),
      chat('gemini-2.5-pro', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'budget',
      }),
      chat('gemini-2.5-flash', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'budget',
      }),
      chat('gemini-2.5-flash-lite', 1_048_576, 65_536, {
        capabilities: { googleSearch: true, tools: true, vision: true, reasoning: true, structuredOutput: true },
        reasoningControl: 'budget',
      }),
      imageGen('gemini-2.5-flash-image'),
      imageGen('gemini-3-pro-image'),
      imageGen('gemini-3.1-flash-image'),
      imageGen('gemini-3.1-flash-lite-image'),
    ].map((s) => [s.id, s]),
  ),
  xai: Object.fromEntries(
    [
      chat('grok-4.6', 500_000, 128_000),
      chat('grok-4.5', 500_000, 128_000),
      chat('grok-4.3', 1_000_000, 128_000),
      chat('grok-4.20-0309-reasoning', 2_000_000, 128_000),
      chat('grok-4.20-0309-non-reasoning', 2_000_000, 128_000, {
        capabilities: { reasoning: false },
        reasoningControl: undefined,
      }),
      chat('grok-4.20-multi-agent-0309', 2_000_000, 128_000),
      chat('grok-build-0.1', 256_000, 128_000),
      imageGen('grok-imagine-image'),
      imageGen('grok-imagine-image-pro'),
      imageGen('grok-imagine-image-quality'),
    ].map((s) => [s.id, s]),
  ),
  groq: Object.fromEntries(
    [
      chat('groq/compound', 131_072, 8_192, { modalities: { ...TEXT } }),
      chat('groq/compound-mini', 131_072, 8_192, { modalities: { ...TEXT } }),
      chat('openai/gpt-oss-120b', 131_072, 32_768, { modalities: { ...TEXT } }),
      chat('openai/gpt-oss-20b', 131_072, 32_768, { modalities: { ...TEXT } }),
      chat('qwen/qwen3.6-27b', 262_144, 16_384, { modalities: { ...TEXT } }),
      chat('moonshotai/kimi-k2-instruct', 131_072, 16_384, { modalities: { ...TEXT } }),
      chat('minimaxai/minimax-m2.7', 196_608, 16_384, { modalities: { ...TEXT } }),
    ].map((s) => [s.id, s]),
  ),
  deepseek: Object.fromEntries(
    [
      chat('deepseek-v4-flash', 128_000, 64_000, { modalities: { ...TEXT } }),
      chat('deepseek-v4-pro', 128_000, 64_000, { modalities: { ...TEXT } }),
    ].map((s) => [s.id, s]),
  ),
  grok: Object.fromEntries(
    [
      chat('grok-build-0.1', 256_000, 128_000),
      chat('grok-4.6', 500_000, 128_000),
      chat('grok-4.5', 500_000, 128_000),
      chat('grok-4.3', 1_000_000, 128_000),
      chat('grok-4.20-0309-reasoning', 2_000_000, 128_000),
      chat('grok-4.20-0309-non-reasoning', 2_000_000, 128_000, {
        capabilities: { reasoning: false },
      }),
      chat('grok-4.20-multi-agent-0309', 2_000_000, 128_000),
      chat('grok-3-mini', 131_072, 8_192),
      chat('grok-3-mini-fast', 131_072, 8_192),
      chat('grok-composer-2.5-fast', 256_000, 32_768),
    ].map((s) => [s.id, s]),
  ),
};

export function catalogIds(providerId: string): string[] {
  const cat = MODEL_CATALOG[providerId];
  return cat ? Object.keys(cat) : [];
}

export function catalogSpec(providerId: string, modelId: string): ModelSpec | undefined {
  return MODEL_CATALOG[providerId]?.[modelId];
}
