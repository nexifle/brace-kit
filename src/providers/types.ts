/**
 * Provider Types Module
 *
 * Type definitions for provider abstraction layer.
 */

import type { ProviderPreset, MCPTool, Message } from '../types/index.ts';

// ==================== Chat Options ====================

/**
 * Options for chat request formatting
 */
export interface ChatOptions {
  /** Enable Google Search grounding (Gemini-specific) */
  enableGoogleSearch?: boolean;
  /** Image aspect ratio for generation models */
  aspectRatio?: string;
  /** Enable streaming response */
  stream?: boolean;
  /** Enable reasoning/thinking mode */
  enableReasoning?: boolean;
}

// ==================== Stream Chunk ====================

/**
 * Normalized token usage metadata from API responses
 *
 * This is a unified format that provider-specific parsers convert to.
 * Different providers have different field names:
 * - Gemini: promptTokenCount, candidatesTokenCount, thoughtsTokenCount
 * - OpenAI: prompt_tokens, completion_tokens (when available in streaming)
 * - Anthropic: input_tokens, output_tokens (via message_start event)
 *
 * Currently implemented for: Gemini
 * Future: OpenAI, Anthropic (when they provide usage in streaming)
 */
export interface TokenUsage {
  /** Input/prompt tokens (Gemini: promptTokenCount, OpenAI: prompt_tokens, Anthropic: input_tokens) */
  promptTokenCount: number;
  /** Output/candidate tokens (Gemini: candidatesTokenCount, OpenAI: completion_tokens, Anthropic: output_tokens) */
  candidatesTokenCount: number;
  /** Total tokens (prompt + candidates) */
  totalTokenCount: number;
  /** Thinking/reasoning tokens for thinking models (Gemini-specific, optional) */
  thoughtsTokenCount?: number;
  /** Cached content tokens when using context caching (Gemini/Anthropic-specific, optional) */
  cachedContentTokenCount?: number;
}

/**
 * Types of streaming chunks
 */
export type StreamChunkType =
  | 'text'
  | 'tool_call'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'grounding_metadata'
  | 'image'
  | 'error'
  | 'reasoning'
  | 'usage';

/**
 * Streaming response chunk
 */
export interface StreamChunk {
  /** Type of chunk content */
  type: StreamChunkType;
  /** Text or content data */
  content?: string;
  /** Tool call ID */
  id?: string;
  /** Tool call index for streaming */
  index?: number;
  /** Tool name */
  name?: string;
  /** Tool arguments (JSON string) */
  arguments?: string;
  /** Google Search grounding metadata */
  groundingMetadata?: unknown;
  /** Image MIME type */
  mimeType?: string;
  /** Base64 image data */
  imageData?: string;
  /** Token usage metadata */
  usage?: TokenUsage;
}

// ==================== Request Configuration ====================

/**
 * HTTP request configuration returned by format functions
 */
export interface RequestConfig {
  /** Request URL */
  url: string;
  /** Fetch options */
  options: RequestInit;
}

// ==================== Provider Format Types ====================

/**
 * Supported provider format types
 */
export type ProviderFormatType = 'openai' | 'anthropic' | 'gemini';

/**
 * Extended provider with runtime configuration
 */
export type ProviderWithConfig = ProviderPreset & {
  apiKey?: string;
  model?: string;
};

// ==================== Format Function Types ====================

/**
 * Function signature for request formatting
 */
export type FormatFunction = (
  provider: ProviderWithConfig,
  messages: Message[],
  tools: MCPTool[],
  options: ChatOptions
) => RequestConfig;

/**
 * Function signature for stream parsing
 */
export type StreamParserFunction = (
  response: Response,
  signal?: AbortSignal
) => AsyncGenerator<StreamChunk>;

/**
 * Function signature for model fetching
 */
export type ModelFetchFunction = (
  apiUrl: string,
  apiKey: string
) => Promise<{ models: string[] }>;

// ==================== Unified Model Fetch Result ====================

/**
 * Result of model fetching operation
 */
export interface ModelFetchResult {
  /** Available models */
  models?: string[];
  /** Error message if fetch failed */
  error?: string;
}

// ==================== Internal Format Types ====================

/**
 * Gemini API part structure
 */
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
  functionResponse?: { name: string; response: unknown };
}

/**
 * Gemini API content structure
 */
export interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

/**
 * OpenAI tool call delta structure
 */
export interface OpenAIToolCallDelta {
  id?: string;
  index: number;
  function?: {
    name?: string;
    arguments?: string;
  };
}

/**
 * Anthropic content block structure
 */
export interface AnthropicContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  partial_json?: string;
  id?: string;
  name?: string;
}

// ==================== Re-export from main types ====================

export type { ProviderPreset, MCPTool, Message } from '../types/index.ts';
