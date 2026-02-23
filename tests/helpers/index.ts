/**
 * Test Helpers - Centralized Exports
 *
 * Re-export all testing utilities from a single entry point.
 */

// Chrome API mocking
export {
  createMockChrome,
  setupChromeMock,
  clearChromeMock,
  createMockRuntimeWithResponses,
  type MockChromeOptions,
} from './chrome-mock';

// Stream response mocking
export {
  createMockStreamResponse,
  createMockResponse,
  // OpenAI
  createOpenAIStreamChunks,
  createOpenAIToolCallChunks,
  createOpenAIMultiChunkStream,
  // Anthropic
  createAnthropicStreamChunks,
  createAnthropicToolCallChunks,
  createAnthropicReasoningChunks,
  // Gemini
  createGeminiStreamChunks,
  createGeminiMultiPartStream,
  createGeminiToolCallChunks,
  createGeminiGroundingChunks,
  createGeminiImageChunks,
  createGeminiErrorChunks,
  // Utilities
  createDelayedStream,
  combineChunks,
} from './stream-mock';
