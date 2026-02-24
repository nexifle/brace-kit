/**
 * Streaming Response Mocking Utilities
 *
 * Provides reusable mock implementations for streaming API responses
 * from various AI providers (OpenAI, Anthropic, Gemini).
 */

/**
 * Creates a mock Response object with a streaming body
 */
export function createMockStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const encodedChunks = chunks.map((c) => encoder.encode(c));

  let index = 0;
  const reader = {
    read: async () => {
      if (index < encodedChunks.length) {
        return { done: false, value: encodedChunks[index++] };
      }
      return { done: true, value: undefined };
    },
    cancel: () => {},
    releaseLock: () => {},
  };

  return {
    body: {
      getReader: () => reader,
    },
  } as unknown as Response;
}

/**
 * Creates a mock Response object with a text body
 */
export function createMockResponse(
  data: unknown,
  options: { status?: number; statusText?: string } = {}
): Response {
  const status = options.status ?? 200;
  const statusText = options.statusText ?? 'OK';

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    body: null,
  } as unknown as Response;
}

// ============================================
// OpenAI Stream Chunk Generators
// ============================================

/**
 * Creates SSE chunks for OpenAI text streaming
 */
export function createOpenAIStreamChunks(content: string): string[] {
  if (content.length <= 10) {
    return [
      `data: {"choices":[{"delta":{"content":"${content}"}}]}\n\n`,
      'data: [DONE]\n\n',
    ];
  }

  return [
    `data: {"choices":[{"delta":{"content":"${content.slice(0, 10)}"}}]}\n\n`,
    `data: {"choices":[{"delta":{"content":"${content.slice(10)}"}}]}\n\n`,
    'data: [DONE]\n\n',
  ];
}

/**
 * Creates SSE chunks for OpenAI tool call streaming
 */
export function createOpenAIToolCallChunks(
  toolCallId = 'call_123',
  toolName = 'search',
  args = '{"query": "test"}'
): string[] {
  return [
    `data: {"choices":[{"delta":{"tool_calls":[{"id":"${toolCallId}","index":0,"function":{"name":"${toolName}","arguments":"${args.slice(0, 10)}"}}]}}]}\n\n`,
    `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"${args.slice(10)}"}}]}}]}\n\n`,
    'data: [DONE]\n\n',
  ];
}

/**
 * Creates SSE chunks for OpenAI with multiple content chunks
 */
export function createOpenAIMultiChunkStream(contentParts: string[]): string[] {
  const chunks = contentParts.map(
    (part) => `data: {"choices":[{"delta":{"content":"${part}"}}]}\n\n`
  );
  chunks.push('data: [DONE]\n\n');
  return chunks;
}

// ============================================
// Anthropic Stream Chunk Generators
// ============================================

/**
 * Creates SSE chunks for Anthropic text streaming
 */
export function createAnthropicStreamChunks(content: string): string[] {
  if (content.length <= 10) {
    return [
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${content}"}}\n\n`,
      'data: {"type":"message_stop"}\n\n',
    ];
  }

  return [
    `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${content.slice(0, 10)}"}}\n\n`,
    `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${content.slice(10)}"}}\n\n`,
    'data: {"type":"message_stop"}\n\n',
  ];
}

/**
 * Creates SSE chunks for Anthropic tool call streaming
 */
export function createAnthropicToolCallChunks(
  toolCallId = 'toolu_123',
  toolName = 'search',
  args = '{"query": "test"}'
): string[] {
  return [
    `data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"${toolCallId}","name":"${toolName}"}}\n\n`,
    `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"${args}"}}\n\n`,
    'data: {"type":"content_block_stop","index":0}\n\n',
    'data: {"type":"message_stop"}\n\n',
  ];
}

/**
 * Creates SSE chunks for Anthropic with reasoning/thinking content
 */
export function createAnthropicReasoningChunks(thinking: string, content: string): string[] {
  return [
    `data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"${thinking}"}}\n\n`,
    `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${content}"}}\n\n`,
    'data: {"type":"message_stop"}\n\n',
  ];
}

// ============================================
// Gemini Stream Chunk Generators
// ============================================

/**
 * Creates SSE chunks for Gemini text streaming
 */
export function createGeminiStreamChunks(content: string): string[] {
  return [
    `data: {"candidates":[{"content":{"parts":[{"text":"${content}"}]}}]}\n\n`,
  ];
}

/**
 * Creates SSE chunks for Gemini with multiple parts
 */
export function createGeminiMultiPartStream(parts: string[]): string[] {
  return parts.map(
    (part) => `data: {"candidates":[{"content":{"parts":[{"text":"${part}"}]}}]}\n\n`
  );
}

/**
 * Creates SSE chunks for Gemini tool call
 */
export function createGeminiToolCallChunks(
  functionName = 'search',
  args = '{"query": "test"}'
): string[] {
  return [
    `data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"${functionName}","args":${args}}}]}}]}\n\n`,
  ];
}

/**
 * Creates SSE chunks for Gemini with grounding metadata
 */
export function createGeminiGroundingChunks(
  content: string,
  sources: Array<{ title: string; uri: string }>
): string[] {
  return [
    `data: {"candidates":[{"content":{"parts":[{"text":"${content}"}]},"groundingMetadata":{"groundingChunks":[${sources.map((s) => `{"web":{"uri":"${s.uri}","title":"${s.title}"}}`).join(',')}]}}]}\n\n`,
  ];
}

/**
 * Creates SSE chunks for Gemini image generation
 */
export function createGeminiImageChunks(imageBase64: string): string[] {
  return [
    `data: {"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"${imageBase64}"}}]}}]}\n\n`,
  ];
}

/**
 * Creates SSE chunks for Gemini error response
 */
export function createGeminiErrorChunks(errorMessage: string): string[] {
  return [
    `data: {"error":{"code":400,"message":"${errorMessage}","status":"INVALID_ARGUMENT"}}\n\n`,
  ];
}

/**
 * Creates SSE chunks for Gemini with usage metadata
 */
export function createGeminiUsageChunks(options: {
  content?: string;
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
}): string[] {
  const usageMetadata: Record<string, number> = {
    promptTokenCount: options.promptTokenCount,
    candidatesTokenCount: options.candidatesTokenCount,
    totalTokenCount: options.totalTokenCount,
  };

  if (options.thoughtsTokenCount !== undefined) {
    usageMetadata.thoughtsTokenCount = options.thoughtsTokenCount;
  }
  if (options.cachedContentTokenCount !== undefined) {
    usageMetadata.cachedContentTokenCount = options.cachedContentTokenCount;
  }

  const chunks: string[] = [];

  if (options.content) {
    chunks.push(
      `data: {"candidates":[{"content":{"parts":[{"text":"${options.content}"}]}}],"usageMetadata":${JSON.stringify(usageMetadata)}}\n\n`
    );
  } else {
    chunks.push(
      `data: {"candidates":[{"content":{"parts":[]}}],"usageMetadata":${JSON.stringify(usageMetadata)}}\n\n`
    );
  }

  return chunks;
}

/**
 * Creates SSE chunks for OpenAI with usage metadata
 */
export function createOpenAIUsageChunks(options: {
  content?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  finishReason?: string;
}): string[] {
  const chunks: string[] = [];

  // Content chunk
  if (options.content) {
    chunks.push(
      `data: {"choices":[{"delta":{"content":"${options.content}"}}]}\n\n`
    );
  }

  // Usage chunk (typically comes with finish_reason or as separate chunk)
  const usage: Record<string, unknown> = {
    prompt_tokens: options.promptTokens,
    completion_tokens: options.completionTokens,
    total_tokens: options.totalTokens,
  };

  if (options.cachedTokens !== undefined) {
    usage.prompt_tokens_details = { cached_tokens: options.cachedTokens };
  }

  chunks.push(
    `data: {"choices":[{"delta":{},"finish_reason":"${options.finishReason || 'stop'}"}],"usage":${JSON.stringify(usage)}}\n\n`
  );

  chunks.push('data: [DONE]\n\n');

  return chunks;
}

/**
 * Creates SSE chunks for Anthropic with usage metadata (message_delta)
 */
export function createAnthropicUsageChunks(options: {
  content?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  stopReason?: string;
}): string[] {
  const chunks: string[] = [];

  // Content chunk
  if (options.content) {
    chunks.push(
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"${options.content}"}}\n\n`
    );
  }

  // Usage chunk (message_delta)
  const usage: Record<string, unknown> = {
    input_tokens: options.inputTokens,
    output_tokens: options.outputTokens,
  };

  if (options.cacheReadInputTokens !== undefined) {
    usage.cache_read_input_tokens = options.cacheReadInputTokens;
  }

  chunks.push(
    `data: {"type":"message_delta","delta":{"stop_reason":"${options.stopReason || 'end_turn'}"},"usage":${JSON.stringify(usage)}}\n\n`
  );

  chunks.push('data: {"type":"message_stop"}\n\n');

  return chunks;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Creates a delayed mock stream that emits chunks with delay
 */
export async function* createDelayedStream(
  chunks: string[],
  delayMs = 100
): AsyncGenerator<string> {
  for (const chunk of chunks) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield chunk;
  }
}

/**
 * Combines multiple chunk arrays into a single stream
 */
export function combineChunks(...chunkArrays: string[][]): string[] {
  return chunkArrays.flat();
}
