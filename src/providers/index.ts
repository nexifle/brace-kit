/**
 * Providers Module
 *
 * Unified provider abstraction layer for LLM API interactions.
 * Supports OpenAI, Anthropic, Gemini, xAI, and DeepSeek providers.
 *
 * @example
 * ```typescript
 * import { formatRequest, parseStream, fetchModels, PROVIDER_PRESETS } from './providers';
 *
 * // Format request
 * const config = formatRequest(provider, messages, tools, options);
 *
 * // Make request and parse stream
 * const response = await fetch(config.url, config.options);
 * for await (const chunk of parseStream(provider, response, signal)) {
 *   console.log(chunk);
 * }
 * ```
 */

// ==================== Re-exports for Public API ====================

// Types
export type {
  ChatOptions,
  StreamChunk,
  StreamChunkType,
  RequestConfig,
  ProviderFormatType,
  ProviderWithConfig,
  FormatFunction,
  StreamParserFunction,
  ModelFetchFunction,
  ModelFetchResult,
  GeminiPart,
  GeminiContent,
  TokenUsage,
} from './types.ts';

// Presets and constants
export {
  PROVIDER_PRESETS,
  GEMINI_NO_TOOLS_MODELS,
  GEMINI_SEARCH_ONLY_MODELS,
  GEMINI_IMAGE_MODELS,
  XAI_IMAGE_MODELS,
  REASONING_MODELS,
  ASPECT_RATIOS,
  GEMINI_ASPECT_RATIO_MAP,
  supportsReasoning,
  supportsGoogleSearch,
  supportsFunctionCalling,
  isGeminiImageModel,
  isXAIImageModel,
} from './presets.ts';

// Utilities
export { cleanSchema, convertToGeminiSchema } from './utils/schema.ts';
export { isOllamaLocalhost } from '../utils/providerUtils.ts';

// OpenAI format (also used by xAI chat, DeepSeek, and custom OpenAI-compatible endpoints)
export { formatOpenAI, parseOpenAIStream, fetchOpenAIModels } from './formats/openai.ts';

// Anthropic format
export { formatAnthropic, parseAnthropicStream } from './formats/anthropic.ts';

// Gemini format
export { formatGemini, parseGeminiStream, fetchGeminiModels } from './formats/gemini.ts';

// xAI image generation format
export { formatXAIImageRequest, parseXAIImageResponse } from './formats/xai.ts';

// Ollama native format
export { formatOllama, parseOllamaStream, fetchOllamaModels } from './formats/ollama.ts';

// ==================== Internal Imports for Unified Interfaces ====================

import type { ProviderPreset, MCPTool, Message } from '../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk, ModelFetchResult } from './types.ts';
import { PROVIDER_PRESETS, XAI_IMAGE_MODELS } from './presets.ts';
import { isOllamaLocalhost } from '../utils/providerUtils.ts';
import { formatOpenAI } from './formats/openai.ts';
import { formatAnthropic } from './formats/anthropic.ts';
import { formatGemini } from './formats/gemini.ts';
import { formatXAIImageRequest } from './formats/xai.ts';
import { formatOllama } from './formats/ollama.ts';
import { parseOpenAIStream } from './formats/openai.ts';
import { parseAnthropicStream } from './formats/anthropic.ts';
import { parseGeminiStream } from './formats/gemini.ts';
import { parseOllamaStream } from './formats/ollama.ts';
import { fetchOpenAIModels } from './formats/openai.ts';
import { fetchGeminiModels } from './formats/gemini.ts';
import { fetchOllamaModels } from './formats/ollama.ts';

// ==================== Unified Interfaces ====================

/**
 * Unified request formatting function
 *
 * Automatically selects the correct formatter based on provider format:
 * - openai: OpenAI-compatible format (also xAI, DeepSeek, custom)
 * - anthropic: Anthropic Claude format
 * - gemini: Google Gemini format
 *
 * Special handling:
 * - xAI image generation models use separate image endpoint
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages
 * @param tools - Available MCP tools (optional)
 * @param options - Chat options (optional)
 * @returns Request configuration with URL and fetch options
 */
export function formatRequest(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  tools: MCPTool[] = [],
  options: ChatOptions = {}
): RequestConfig {
  // xAI image generation uses a separate non-streaming endpoint
  if (provider.id === 'xai' && XAI_IMAGE_MODELS.includes(provider.model || '')) {
    return formatXAIImageRequest(provider, messages, options);
  }

  const { format } = provider;

  switch (format) {
    case 'openai':
      return formatOpenAI(provider, messages, tools, options);
    case 'anthropic':
      return formatAnthropic(provider, messages, tools, options);
    case 'gemini':
      return formatGemini(provider, messages, tools, options);
    case 'ollama':
      return formatOllama(provider, messages, tools, options);
    default:
      return formatOpenAI(provider, messages, tools, options);
  }
}

/**
 * Unified stream parsing function
 *
 * Automatically selects the correct parser based on provider format:
 * - openai: OpenAI SSE format
 * - anthropic: Anthropic SSE format
 * - gemini: Gemini SSE format
 *
 * @param provider - Provider configuration
 * @param response - Fetch response with streaming body
 * @param signal - Optional abort signal for cancellation
 * @yields StreamChunk objects for each parsed element
 */
export async function* parseStream(
  provider: ProviderPreset,
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  switch (provider.format) {
    case 'openai':
      yield* parseOpenAIStream(response, signal);
      break;
    case 'anthropic':
      yield* parseAnthropicStream(response, signal);
      break;
    case 'gemini':
      yield* parseGeminiStream(response, signal);
      break;
    case 'ollama':
      yield* parseOllamaStream(response, signal);
      break;
    default:
      yield* parseOpenAIStream(response, signal);
  }
}

/**
 * Unified model fetching function
 *
 * Automatically selects the correct fetcher based on provider format:
 * - openai: OpenAI /models endpoint
 * - anthropic: Returns static model list
 * - gemini: Gemini /models endpoint
 *
 * @param provider - Provider configuration with API key
 * @returns Object with models array or error message
 */
export async function fetchModels(
  provider: ProviderPreset & { apiKey?: string }
): Promise<ModelFetchResult> {
  const { format, apiUrl, apiKey } = provider;

  // Ollama localhost doesn't require API key
  if (!apiKey && !isOllamaLocalhost(format, apiUrl)) {
    return { error: 'API key required' };
  }

  try {
    switch (format) {
      case 'openai':
        return await fetchOpenAIModels(apiUrl, apiKey || '');
      case 'anthropic':
        return { models: PROVIDER_PRESETS.anthropic.staticModels || [] };
      case 'gemini':
        return await fetchGeminiModels(apiUrl, apiKey || '');
      case 'ollama':
        return await fetchOllamaModels(apiUrl, apiKey);
      default:
        return await fetchOpenAIModels(apiUrl, apiKey || '');
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
}
