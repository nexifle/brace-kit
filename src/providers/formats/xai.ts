/**
 * xAI Format Module
 *
 * Request formatting and response parsing for xAI Grok image generation API.
 * Note: Regular chat uses OpenAI format (see openai.ts).
 */

import type { Message } from '../../types/index.ts';
import type { ChatOptions, RequestConfig, StreamChunk } from '../types.ts';

// ==================== Image Generation Request ====================

/**
 * Format request for xAI image generation API
 *
 * xAI image generation uses a separate endpoint from chat completions.
 * Only uses the last user message as the prompt.
 *
 * @param provider - Provider configuration with API key and model
 * @param messages - Conversation messages (only last user message used)
 * @param options - Chat options including aspectRatio
 * @returns Request configuration with URL and fetch options
 */
export function formatXAIImageRequest(
  provider: { apiUrl: string; apiKey?: string; model?: string },
  messages: Message[],
  options: ChatOptions
): RequestConfig {
  // Extract prompt from last user message
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const rawContent = lastUserMessage?.content as unknown;
  let prompt = '';
  let imageUrl: string | undefined;

  if (typeof rawContent === 'string') {
    prompt = rawContent;
  } else if (Array.isArray(rawContent)) {
    const items = rawContent as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    // Extract text parts as prompt
    prompt = items
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text)
      .join(' ');
    // Extract image URL if present (for image-to-image)
    const imageItem = items.find((item) => item.type === 'image_url' && item.image_url?.url);
    if (imageItem) {
      imageUrl = imageItem.image_url!.url;
    }
  }

  const body: Record<string, unknown> = {
    model: provider.model || 'grok-imagine-image',
    prompt,
    n: 1,
    response_format: 'b64_json',
  };

  // Add image for image-to-image generation
  if (imageUrl) {
    body.image = { url: imageUrl, type: 'image_url' };
  }

  // Add aspect ratio if specified
  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  // Build URL
  const url = `${provider.apiUrl.replace(/\/+$/, '')}/images/generations`;

  return {
    url,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  };
}

// ==================== Image Response Parsing ====================

/**
 * Parse xAI image generation response
 *
 * Extracts base64 image data from response.
 * Note: This is NOT a streaming response - it returns all at once.
 *
 * @param response - Fetch response with JSON body
 * @yields StreamChunk objects with image data
 */
export async function* parseXAIImageResponse(response: Response): AsyncGenerator<StreamChunk> {
  const data = await response.json();

  for (const item of data.data || []) {
    if (item.b64_json) {
      yield {
        type: 'image',
        mimeType: 'image/jpeg',
        imageData: item.b64_json,
      };
    }
  }
}
