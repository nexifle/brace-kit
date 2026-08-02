/**
 * Provider Presets Module
 *
 * Provider configurations, model constants, and feature detection utilities.
 */

import type { ProviderFormat, ProviderPreset } from '../types/index.ts';

// ==================== Provider Format Metadata ====================

/**
 * Human-readable label per provider format.
 * Single source of truth used by the provider select, add-provider form,
 * and settings UI — avoids drift between duplicated maps.
 */
export const FORMAT_LABELS: Record<ProviderFormat, string> = {
  openai: 'OpenAI API',
  anthropic: 'Anthropic API',
  gemini: 'Gemini API',
  ollama: 'Local · Ollama',
};

/**
 * Example base URL placeholder per provider format (add-provider form).
 */
export const FORMAT_PLACEHOLDERS: Record<ProviderFormat, string> = {
  openai: 'https://api.example.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://localhost:11434',
};

// ==================== Model Constants ====================

/**
 * Gemini models that do not support function calling or Google Search
 * Pattern: native image-generation models
 */
export const GEMINI_NO_TOOLS_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
];

/**
 * Gemini models that support Google Search but not function calling
 */
export const GEMINI_SEARCH_ONLY_MODELS: string[] = [
  // (none currently — native image models are covered by GEMINI_NO_TOOLS_MODELS)
];

/**
 * Gemini image generation models that support native image output.
 * Pattern-based: any Gemini model name containing "-image" supports image generation.
 */
export const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
];

/**
 * xAI image generation models
 */
export const XAI_IMAGE_MODELS = [
  'grok-imagine-image',
  'grok-imagine-image-pro',
  'grok-imagine-image-quality',
];

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
 *
 * Model lists refreshed July 2026 from each provider's official docs/API:
 * - staticModels: fallback list shown before a key is entered (and for
 *   providers where live fetching is unavailable)
 * - Live fetching (supportsModelFetch) refreshes the list automatically
 *   when an API key is present.
 */
export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.6-sol',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
    staticModels: [
      // GPT-5.6 family (aliases: gpt-5.6 → gpt-5.6-sol)
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      // Previous generation
      'gpt-5.5',
      'gpt-5.4',
      // Open-weight
      'gpt-oss',
    ],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-5',
    format: 'anthropic',
    models: [],
    supportsModelFetch: true,
    staticModels: [
      // Current generation (aliases)
      'claude-fable-5',
      'claude-opus-5',
      'claude-sonnet-5',
      'claude-haiku-4-5',
      // Previous generation (still available)
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-sonnet-4-6',
      'claude-opus-4-5',
      'claude-sonnet-4-5',
    ],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-3.6-flash',
    format: 'gemini',
    models: [],
    supportsModelFetch: true,
    staticModels: [
      // Gemini 3.x (stable)
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-pro',
      'gemini-3.1-flash',
      'gemini-3.1-flash-lite',
      'gemini-3-flash',
      // Gemini 2.5 (available until Oct 2026)
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      // Native image models
      'gemini-2.5-flash-image',
      'gemini-3-pro-image',
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
    ],
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    apiUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.5',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
    staticModels: [
      'grok-4.5',
      'grok-4.3',
      // Grok 4.20 (aliases: grok-4.20 → reasoning, grok-4.20-non-reasoning)
      'grok-4.20-0309-reasoning',
      'grok-4.20-0309-non-reasoning',
      'grok-4.20-multi-agent-0309',
      // Coding / agentic
      'grok-build-0.1',
      // Media generation
      'grok-imagine-image',
      'grok-imagine-image-pro',
      'grok-imagine-image-quality',
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
    staticModels: [
      // Groq compound models
      'groq/compound',
      'groq/compound-mini',
      // Hosted open-weight models
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'qwen/qwen3.6-27b',
      'moonshotai/kimi-k2-instruct',
      'minimaxai/minimax-m2.7',
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
    supportsReasoningContent: true,
    staticModels: ['deepseek-v4-flash', 'deepseek-v4-pro'],
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
