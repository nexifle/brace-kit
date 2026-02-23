/**
 * Tests for useTools Hook
 *
 * Note: These tests focus on the pure logic that can be tested independently.
 * Full hook tests would require React Testing Library with store and chrome API mocking.
 */

import { describe, expect, it } from 'bun:test';
import {
  GEMINI_NO_TOOLS_MODELS,
  GEMINI_SEARCH_ONLY_MODELS,
  GEMINI_IMAGE_MODELS,
  XAI_IMAGE_MODELS,
  supportsFunctionCalling as supportsFunctionCallingUtil,
} from '../../../src/providers/presets.ts';

/**
 * Tests for tool-related utility functions and logic
 */
describe('useTools Logic', () => {
  describe('Function Calling Support', () => {
    /**
     * Helper that mirrors the supportsFunctionCalling logic from useTools
     */
    function checkFunctionCalling(isGemini: boolean, model: string): boolean {
      return (
        !isGemini ||
        (!GEMINI_NO_TOOLS_MODELS.includes(model) &&
          !GEMINI_SEARCH_ONLY_MODELS.includes(model))
      );
    }

    it('should support function calling for non-Gemini providers', () => {
      expect(checkFunctionCalling(false, 'gpt-4o')).toBe(true);
      expect(checkFunctionCalling(false, 'claude-3-5-sonnet')).toBe(true);
      expect(checkFunctionCalling(false, 'grok-beta')).toBe(true);
    });

    it('should support function calling for regular Gemini models', () => {
      expect(checkFunctionCalling(true, 'gemini-2.0-flash')).toBe(true);
      expect(checkFunctionCalling(true, 'gemini-1.5-pro')).toBe(true);
    });

    it('should not support function calling for Gemini no-tools models', () => {
      for (const model of GEMINI_NO_TOOLS_MODELS) {
        expect(checkFunctionCalling(true, model)).toBe(false);
      }
    });

    it('should not support function calling for Gemini search-only models', () => {
      for (const model of GEMINI_SEARCH_ONLY_MODELS) {
        expect(checkFunctionCalling(true, model)).toBe(false);
      }
    });

    it('should use utility function correctly', () => {
      // Test the imported utility function
      expect(supportsFunctionCallingUtil('gemini-2.0-flash')).toBe(true);
      expect(supportsFunctionCallingUtil('gemini-2.5-flash-image')).toBe(false);
      expect(supportsFunctionCallingUtil('gemini-3-pro-image-preview')).toBe(false);
    });
  });

  describe('Image Model Detection', () => {
    it('should identify Gemini image models', () => {
      for (const model of GEMINI_IMAGE_MODELS) {
        expect(GEMINI_IMAGE_MODELS.includes(model)).toBe(true);
      }
      expect(GEMINI_IMAGE_MODELS).toContain('gemini-2.5-flash-image');
      expect(GEMINI_IMAGE_MODELS).toContain('gemini-3-pro-image-preview');
    });

    it('should identify xAI image models', () => {
      for (const model of XAI_IMAGE_MODELS) {
        expect(XAI_IMAGE_MODELS.includes(model)).toBe(true);
      }
      expect(XAI_IMAGE_MODELS).toContain('grok-2-image-1212');
      expect(XAI_IMAGE_MODELS).toContain('grok-imagine-image');
      expect(XAI_IMAGE_MODELS).toContain('grok-imagine-image-pro');
    });

    it('should not identify regular models as image models', () => {
      expect(GEMINI_IMAGE_MODELS.includes('gemini-2.0-flash')).toBe(false);
      expect(XAI_IMAGE_MODELS.includes('grok-beta')).toBe(false);
    });
  });

  describe('Chat Options Logic', () => {
    /**
     * Helper that mirrors getChatOptions logic
     */
    function getExpectedChatOptions(
      enableGoogleSearch: boolean,
      enableReasoning: boolean,
      isGemini: boolean,
      model: string,
      aspectRatio?: string
    ) {
      const options: {
        enableGoogleSearch: boolean;
        enableReasoning: boolean;
        aspectRatio?: string;
      } = {
        enableGoogleSearch:
          enableGoogleSearch && isGemini && !GEMINI_NO_TOOLS_MODELS.includes(model),
        enableReasoning,
      };

      if (aspectRatio) {
        options.aspectRatio = aspectRatio;
      }

      return options;
    }

    it('should enable Google Search for Gemini with search-enabled model', () => {
      const options = getExpectedChatOptions(true, false, true, 'gemini-2.0-flash');
      expect(options.enableGoogleSearch).toBe(true);
    });

    it('should disable Google Search for Gemini with no-tools model', () => {
      const options = getExpectedChatOptions(true, false, true, 'gemini-2.5-flash-image');
      expect(options.enableGoogleSearch).toBe(false);
    });

    it('should disable Google Search for non-Gemini providers', () => {
      const options = getExpectedChatOptions(true, false, false, 'gpt-4o');
      expect(options.enableGoogleSearch).toBe(false);
    });

    it('should include aspect ratio when provided', () => {
      const options = getExpectedChatOptions(false, false, true, 'gemini-2.5-flash-image', '16:9');
      expect(options.aspectRatio).toBe('16:9');
    });

    it('should not include aspect ratio when not provided', () => {
      const options = getExpectedChatOptions(false, false, true, 'gemini-2.0-flash');
      expect(options.aspectRatio).toBeUndefined();
    });

    it('should respect enableReasoning setting', () => {
      const optionsEnabled = getExpectedChatOptions(false, true, false, 'gpt-4o');
      const optionsDisabled = getExpectedChatOptions(false, false, false, 'gpt-4o');
      expect(optionsEnabled.enableReasoning).toBe(true);
      expect(optionsDisabled.enableReasoning).toBe(false);
    });
  });

  describe('Tool Injection Logic', () => {
    /**
     * Helper that mirrors the tool injection logic
     */
    function getExpectedTools(
      mcpToolCount: number,
      enableGoogleSearchTool: boolean,
      googleSearchApiKey: string | null,
      supportsFunctionCalling: boolean,
      isGemini: boolean
    ): { total: number; hasGoogleSearch: boolean; hasContinueMessage: boolean } {
      let total = mcpToolCount;
      let hasGoogleSearch = false;
      let hasContinueMessage = false;

      // Inject google_search for non-Gemini providers
      if (!isGemini && enableGoogleSearchTool && googleSearchApiKey) {
        total++;
        hasGoogleSearch = true;
      }

      // Inject continue_message for function-capable models
      if (supportsFunctionCalling) {
        total++;
        hasContinueMessage = true;
      }

      return { total, hasGoogleSearch, hasContinueMessage };
    }

    it('should include only MCP tools when no built-in tools enabled', () => {
      const result = getExpectedTools(3, false, null, false, true);
      expect(result.total).toBe(3);
      expect(result.hasGoogleSearch).toBe(false);
      expect(result.hasContinueMessage).toBe(false);
    });

    it('should include google_search for non-Gemini when enabled with API key', () => {
      const result = getExpectedTools(2, true, 'api-key', false, false);
      expect(result.total).toBe(3);
      expect(result.hasGoogleSearch).toBe(true);
    });

    it('should not include google_search for Gemini even when enabled', () => {
      const result = getExpectedTools(2, true, 'api-key', false, true);
      expect(result.hasGoogleSearch).toBe(false);
      expect(result.total).toBe(2);
    });

    it('should not include google_search without API key', () => {
      const result = getExpectedTools(2, true, null, false, false);
      expect(result.hasGoogleSearch).toBe(false);
    });

    it('should include continue_message when function calling supported', () => {
      const result = getExpectedTools(2, false, null, true, true);
      expect(result.hasContinueMessage).toBe(true);
      expect(result.total).toBe(3);
    });

    it('should include both built-in tools when conditions met', () => {
      const result = getExpectedTools(2, true, 'api-key', true, false);
      expect(result.hasGoogleSearch).toBe(true);
      expect(result.hasContinueMessage).toBe(true);
      expect(result.total).toBe(4);
    });
  });
});
