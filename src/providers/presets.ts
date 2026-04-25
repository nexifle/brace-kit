/**
 * Provider Presets Module
 *
 * Provider configurations, model constants, and feature detection utilities.
 */

import type { ProviderPreset } from '../types/index.ts';

// ==================== Model Constants ====================

/**
 * Gemini models that do not support function calling or Google Search
 * Pattern: models with "-image" in the name that are Flash-based
 */
export const GEMINI_NO_TOOLS_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-flash-image',
  'gemini-3.1-flash-image-preview',
];

/**
 * Gemini models that support Google Search but not function calling
 */
export const GEMINI_SEARCH_ONLY_MODELS = [
  'gemini-3-pro-image-preview',
  'gemini-3.1-pro-image-preview',
];

/**
 * Gemini image generation models that support native image output.
 * Pattern-based: any Gemini model name containing "-image" supports image generation.
 */
export const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-flash-image',
  'gemini-3-pro-image-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-3.1-pro-image-preview',
];

/**
 * xAI image generation models
 */
export const XAI_IMAGE_MODELS = ['grok-2-image-1212', 'grok-imagine-image', 'grok-imagine-image-pro'];

/**
 * Groq built-in provider tools available via compound_custom
 * https://console.groq.com/docs/compound
 */
export const GROQ_BUILTIN_TOOLS: { id: string; label: string; description: string }[] = [
  { id: 'web_search', label: 'Web Search', description: 'Access real-time web content with automatic citations' },
  { id: 'visit_website', label: 'Visit Website', description: 'Fetch and analyze content from specific web pages' },
  { id: 'browser_automation', label: 'Browser Automation', description: 'Interact with web pages through automated browser actions' },
  { id: 'code_interpreter', label: 'Code Execution', description: 'Execute Python code in secure sandboxed environments' },
  { id: 'wolfram_alpha', label: 'Wolfram Alpha', description: 'Access computational knowledge and mathematical calculations' },
];

// ==================== Feature Detection ====================

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
 * Uses pattern-based detection: any Gemini model with "-image" in the name
 * supports native image generation via responseModalities.
 *
 * @param model - Model name
 * @returns true if the model is a Gemini image generation model
 */
export function isGeminiImageModel(model: string): boolean {
  // Pattern-based: any Gemini model containing "-image" supports image generation
  return model.includes('-image');
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

/**
 * Check if a Gemini model is a Gemini 3+ series (uses thinkingLevel instead of thinkingBudget)
 *
 * @param model - Gemini model name
 * @returns true if the model is Gemini 3 or later
 */
export function isGemini3Model(model: string): boolean {
  return /^gemini-[3-9]/.test(model);
}

/**
 * Gemini image resolution options
 */
export const GEMINI_IMAGE_SIZES = ['512', '1K', '2K', '4K'] as const;

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
    defaultModel: 'claude-sonnet-4-6',
    format: 'anthropic',
    models: [],
    supportsModelFetch: false,
    staticModels: [
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
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
      // Grok 4.1 Series (Latest)
      'grok-4-1-fast-reasoning',
      'grok-4-1-fast-non-reasoning',
      // Grok 4 Series
      'grok-4-0709',
      'grok-4-fast-reasoning',
      'grok-4-fast-non-reasoning',
      // Grok 3 Series
      'grok-3',
      'grok-3-mini',
      // Image Generation
      'grok-2-image-1212',
      'grok-imagine-image',
      'grok-imagine-image-pro',
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq',
    apiUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'groq/compound-mini',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
    supportsReasoningContent: true,
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
export const ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '4:5', '5:4', '21:9', '1:4', '4:1', '1:8', '8:1'] as const;

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
  '1:4': '1:4',
  '4:1': '4:1',
  '1:8': '1:8',
  '8:1': '8:1',
};
