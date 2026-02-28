/**
 * Provider Presets Module
 *
 * Provider configurations, model constants, and feature detection utilities.
 */

import type { ProviderPreset } from '../types/index.ts';

// ==================== Model Constants ====================

/**
 * Gemini models that do not support function calling or Google Search
 */
export const GEMINI_NO_TOOLS_MODELS = ['gemini-2.5-flash-image'];

/**
 * Gemini models that support Google Search but not function calling
 */
export const GEMINI_SEARCH_ONLY_MODELS = ['gemini-3-pro-image-preview'];

/**
 * Gemini image generation models that support aspect ratio selection
 */
export const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];

/**
 * xAI image generation models
 */
export const XAI_IMAGE_MODELS = ['grok-2-image-1212', 'grok-imagine-image', 'grok-imagine-image-pro'];

/**
 * Models that support reasoning/thinking capabilities
 * Note: For Anthropic, ALL Claude models support extended thinking
 * For other providers, we check specific model patterns
 */
export const REASONING_MODELS = {
  anthropic: ['claude', 'claude-sonnet', 'claude-opus', 'claude-haiku', 'glm', 'k2.5', 'openai/gpt-oss-120b'], // All Claude models + GLM models
  openai: ['o1', 'o3'], // o1-preview, o1-mini, o3-mini, o3
  gemini: ['thinking', 'gemini-2.5-pro'], // Thinking models
  deepseek: ['reasoner', 'r1'], // deepseek-reasoner, deepseek-r1
  xai: ['grok'], // Grok models have reasoning
  ollama: ['deepseek-r1', 'qwq', 'marco-o1', 'think'], // Ollama thinking models
} as const;

/**
 * Provider type for reasoning models lookup
 */
type ReasoningProvider = keyof typeof REASONING_MODELS;

// ==================== Feature Detection ====================

/**
 * Check if a model supports reasoning/thinking capabilities
 *
 * @param providerId - Provider identifier (anthropic, openai, gemini, etc.)
 * @param model - Model name to check
 * @returns true if the model supports reasoning
 */
export function supportsReasoning(providerId: string, model: string): boolean {
  const providerModels = REASONING_MODELS[providerId as ReasoningProvider];
  if (!providerModels) return false;

  const modelLower = model.toLowerCase();
  return providerModels.some((m) => modelLower.includes(m.toLowerCase()));
}

/**
 * Check if a Gemini model supports Google Search grounding
 *
 * @param model - Gemini model name
 * @returns true if the model supports Google Search
 */
export function supportsGoogleSearch(model: string): boolean {
  return !GEMINI_NO_TOOLS_MODELS.includes(model);
}

/**
 * Check if a Gemini model supports function calling
 *
 * @param model - Gemini model name
 * @returns true if the model supports function calling
 */
export function supportsFunctionCalling(model: string): boolean {
  return !GEMINI_NO_TOOLS_MODELS.includes(model) && !GEMINI_SEARCH_ONLY_MODELS.includes(model);
}

/**
 * Check if a model is a Gemini image generation model
 *
 * @param model - Model name
 * @returns true if the model is a Gemini image generation model
 */
export function isGeminiImageModel(model: string): boolean {
  return GEMINI_IMAGE_MODELS.includes(model);
}

/**
 * Check if a model is an xAI image generation model
 *
 * @param model - Model name
 * @returns true if the model is an xAI image generation model
 */
export function isXAIImageModel(model: string): boolean {
  return XAI_IMAGE_MODELS.includes(model);
}

// ==================== Provider Presets ====================

/**
 * Default provider configurations
 */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    format: 'anthropic',
    models: [],
    supportsModelFetch: false,
    staticModels: [
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    format: 'gemini',
    models: [],
    supportsModelFetch: true,
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    apiUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-1-fast-non-reasoning',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
    staticModels: [
      'grok-4-1-fast-non-reasoning',
      'grok-2-image-1212',
      'grok-imagine-image',
      'grok-imagine-image-pro',
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    apiUrl: '',
    defaultModel: '',
    format: 'openai',
    models: [],
    supportsModelFetch: false,
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama',
    apiUrl: 'http://localhost:11434',
    defaultModel: '',
    format: 'ollama',
    models: [],
    supportsModelFetch: true,
  },
};

// ==================== Aspect Ratio Mapping ====================

/**
 * Supported aspect ratios for image generation
 */
export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9'] as const;

/**
 * Map aspect ratios to Gemini format
 */
export const GEMINI_ASPECT_RATIO_MAP: Record<string, string> = {
  '1:1': '1:1',
  '16:9': '16:9',
  '9:16': '9:16',
  '4:3': '4:3',
  '3:4': '3:4',
  '3:2': '3:2',
  '2:3': '2:3',
  '4:5': '4:5',
  '5:4': '5:4',
  '21:9': '21:9',
};
