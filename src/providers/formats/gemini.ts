/**
 * Gemini Format Module
 *
 * Request formatting, stream parsing, and model fetching for Google Gemini API.
 */

import type { MCPTool, Message } from '../../types/index.ts';
import type { ChatOptions, GeminiContent, GeminiPart, RequestConfig, StreamChunk, TokenUsage } from '../types.ts';
import {
  GEMINI_IMAGE_MODELS,
  GEMINI_NO_TOOLS_MODELS,
  GEMINI_SEARCH_ONLY_MODELS,
  GEMINI_ASPECT_RATIO_MAP,
  supportsReasoning,
} from '../presets.ts';
import { cleanSchema, convertToGeminiSchema } from '../utils/schema.ts';

// ==================== Request Formatting ====================

/**
 * Format request for Google Gemini API
 *
 * Handles:
 * - System instructions (extracted from system messages)
 * - Tool calls in assistant messages
 * - Tool result messages
 * - Image content (base64)
 * - Google Search grounding
 * - Extended thinking/reasoning mode
 * - Image generation with aspect ratios
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages
 * @param tools - Available MCP tools
 * @param options - Chat options including enableGoogleSearch, aspectRatio, enableReasoning
 * @returns Request configuration with URL and fetch options
 */
export function formatGemini(
  provider: { apiUrl: string; apiKey?: string; model?: string; defaultModel: string },
  messages: Message[],
  tools: MCPTool[],
  options: ChatOptions
): RequestConfig {
  let systemInstruction = '';
  const contents: GeminiContent[] = [];

  const model = provider.model || provider.defaultModel;
  const shouldEnableReasoning = options.enableReasoning && supportsReasoning('gemini', model);

  // Transform messages to Gemini format
  for (const msg of messages) {
    if (msg.role === 'system') {
      // Accumulate system instructions
      systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
    } else if (msg.role === 'assistant') {
      // Assistant messages → model role
      const parts: GeminiPart[] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          let args = {};
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {
            args = {};
          }
          parts.push({
            functionCall: {
              name: tc.name,
              args,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool') {
      // Tool results → functionResponse in user message
      // IMPORTANT: For parallel function calls (multiple functionCall parts in one model turn),
      // all functionResponse parts MUST be grouped in a SINGLE user turn.
      // Ref: https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/function-calling/parallel_function_calling.ipynb
      const functionResponsePart: GeminiPart = {
        functionResponse: {
          name: msg.name || 'unknown',
          response: typeof msg.content === 'string' ? { content: msg.content } : msg.content,
        },
      };

      const lastContent = contents[contents.length - 1];
      if (
        lastContent &&
        lastContent.role === 'user' &&
        lastContent.parts.length > 0 &&
        lastContent.parts.every((p) => p.functionResponse !== undefined)
      ) {
        // Append to existing function-response user turn (parallel function calls)
        lastContent.parts.push(functionResponsePart);
      } else {
        // Create new user turn for this tool result
        contents.push({
          role: 'user',
          parts: [functionResponsePart],
        });
      }
    } else if (msg.role === 'user' && Array.isArray(msg.content)) {
      // Multimodal content (text + images)
      const parts: GeminiPart[] = [];
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          const imageUrl = item.image_url?.url || item.image_url;
          if (imageUrl) {
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const [, mimeType, base64Data] = match;
              parts.push({
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              });
            }
          }
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'user', parts });
      }
    } else {
      // Simple text message
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const body: Record<string, unknown> = { contents };

  // Add system instructions if present
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Build generationConfig incrementally
  const genConfig: Record<string, unknown> = {};
  const p = options.modelParameters;

  // Apply optional generation parameters (only if set by user)
  if (p?.temperature !== undefined) genConfig.temperature = p.temperature;
  if (p?.maxTokens !== undefined) genConfig.maxOutputTokens = p.maxTokens;
  if (p?.topP !== undefined) genConfig.topP = p.topP;
  if (p?.topK !== undefined) genConfig.topK = p.topK;

  // Add thinking config for Gemini thinking models when reasoning is enabled
  if (shouldEnableReasoning) {
    genConfig.thinkingConfig = {
      thinkingBudget: p?.thinkingBudget ?? 24576,
      includeThoughts: true,
    };
  }

  // Add aspect ratio for Gemini image generation models
  if (options.aspectRatio && GEMINI_IMAGE_MODELS.includes(model)) {
    const geminiAspectRatio = GEMINI_ASPECT_RATIO_MAP[options.aspectRatio];
    if (geminiAspectRatio) {
      genConfig.responseModalities = ['TEXT', 'IMAGE'];
      genConfig.imageConfig = { aspectRatio: geminiAspectRatio };
    }
  }

  if (Object.keys(genConfig).length > 0) {
    body.generationConfig = genConfig;
  }

  // Determine tool support
  const supportsGoogleSearchFlag = !GEMINI_NO_TOOLS_MODELS.includes(model);
  const supportsFunctionCallingFlag =
    !GEMINI_NO_TOOLS_MODELS.includes(model) && !GEMINI_SEARCH_ONLY_MODELS.includes(model);

  const geminiTools: Record<string, unknown>[] = [];

  // Add Google Search grounding or function declarations
  if (options.enableGoogleSearch && supportsGoogleSearchFlag) {
    geminiTools.push({ google_search: {} });
  } else if (tools.length > 0 && supportsFunctionCallingFlag) {
    geminiTools.push({
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: cleanSchema(convertToGeminiSchema(t.inputSchema)),
      })),
    });
  }

  if (geminiTools.length > 0) {
    body.tools = geminiTools;
  }

  // Build URL with API key
  const isStreaming = options.stream !== false;
  const baseUrl = provider.apiUrl.replace(/\/+$/, '');
  let url: string;

  if (baseUrl.includes('/models/')) {
    // Custom URL with model path already included
    url = `${baseUrl}?${isStreaming ? 'alt=sse&' : ''}key=${provider.apiKey}`;
  } else {
    // Standard URL construction
    const method = isStreaming ? ':streamGenerateContent' : ':generateContent';
    url = `${baseUrl}/models/${model}${method}?${isStreaming ? 'alt=sse&' : ''}key=${provider.apiKey}`;
  }

  return {
    url,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  };
}

// ==================== Stream Parsing ====================

/**
 * Parse Gemini streaming response
 *
 * Handles:
 * - Text content
 * - Thinking/reasoning content
 * - Tool calls
 * - Image generation (inline data)
 * - Image generation errors (IMAGE_SAFETY, IMAGE_OTHER, PROHIBITED_CONTENT, etc.)
 * - Grounding metadata
 * - Abort signal for cancellation
 *
 * @param response - Fetch response with streaming body
 * @param signal - Optional abort signal for cancellation
 * @yields StreamChunk objects for each parsed element
 */
export async function* parseGeminiStream(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      // Check for abort before each read
      if (signal?.aborted) {
        try {
          reader.cancel();
        } catch {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const json = JSON.parse(data);
          const candidates = json.candidates;
          if (!candidates) continue;

          for (const candidate of candidates) {
            // Check for image generation failure
            if (candidate.finishReason === 'IMAGE_SAFETY' || candidate.finishReason === 'IMAGE_OTHER') {
              const defaultMessage =
                candidate.finishReason === 'IMAGE_SAFETY'
                  ? 'Unable to show the generated image. The image was filtered due to safety policies.'
                  : 'Unable to show the generated image. The model could not generate the image based on the prompt provided.';
              const errorMessage = candidate.finishMessage || defaultMessage;
              yield { type: 'error', content: errorMessage };
              continue;
            }

            const parts = candidate.content?.parts;
            if (!parts) {
              // If there's no content but there is a finishMessage (e.g. PROHIBITED_CONTENT,
              // SAFETY, or any other blocking reason), surface it as an error.
              if (candidate.finishMessage) {
                yield { type: 'error', content: candidate.finishMessage };
              }
              continue;
            }

            for (const part of parts) {
              // Thinking/reasoning content from Gemini thinking models
              // Handle two formats:
              // 1. thought is a string: {"thought": "reasoning", "text": "response"}
              // 2. thought is boolean: {"thought": true, "text": "reasoning"}
              if (part.thought) {
                if (typeof part.thought === 'string') {
                  // New format: thought contains reasoning string
                  yield { type: 'reasoning', content: part.thought };
                } else if (part.text) {
                  // Legacy format: thought is boolean, text contains reasoning
                  yield { type: 'reasoning', content: part.text };
                  continue; // Skip yielding text as regular content
                }
              }

              // Regular text content (final response, not thinking)
              if (part.text) {
                yield { type: 'text', content: part.text };
              }

              // Tool calls
              if (part.functionCall) {
                yield {
                  type: 'tool_call',
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args),
                };
              }

              // Generated images
              if (part.inlineData && !part.thought) {
                yield {
                  type: 'image',
                  mimeType: part.inlineData.mimeType,
                  imageData: part.inlineData.data,
                };
              }
            }
          }

          // Grounding metadata for Google Search
          const groundingMetadata = candidates[0]?.groundingMetadata;
          if (groundingMetadata) {
            yield { type: 'grounding_metadata', groundingMetadata };
          }

          // Token usage metadata - extract from response
          // Gemini returns usageMetadata in each streaming chunk with cumulative counts
          const usageMetadata = json.usageMetadata;
          if (usageMetadata) {
            const usage: TokenUsage = {
              promptTokenCount: usageMetadata.promptTokenCount ?? 0,
              candidatesTokenCount: usageMetadata.candidatesTokenCount ?? 0,
              totalTokenCount: usageMetadata.totalTokenCount ?? 0,
            };

            // Add thoughts token count for thinking models
            if (usageMetadata.thoughtsTokenCount !== undefined) {
              usage.thoughtsTokenCount = usageMetadata.thoughtsTokenCount;
            }

            // Add cached content token count if available (context caching)
            if (usageMetadata.cachedContentTokenCount !== undefined) {
              usage.cachedContentTokenCount = usageMetadata.cachedContentTokenCount;
            }

            yield { type: 'usage', usage };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

// ==================== Model Fetching ====================

/**
 * Fetch available models from Gemini API
 *
 * Filters models to only include those supporting generateContent
 *
 * @param apiUrl - API base URL
 * @param apiKey - API key for authentication
 * @returns Object with models array
 * @throws Error if API request fails
 */
export async function fetchGeminiModels(
  apiUrl: string,
  apiKey: string
): Promise<{ models: string[] }> {
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/models?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // Filter and transform models
  const models = (data.models || [])
    .filter((m: { supportedGenerationMethods?: string[] }) => {
      const supportedMethods = m.supportedGenerationMethods || [];
      return supportedMethods.includes('generateContent');
    })
    .map((m: { name?: string }) => {
      const name = m.name || '';
      return name.replace(/^models\//, '');
    })
    .filter((name: string) => name)
    .sort((a: string, b: string) => a.localeCompare(b));

  return { models };
}
