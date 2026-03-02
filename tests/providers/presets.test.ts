/**
 * Tests for Provider Presets Module
 */

import { describe, expect, it } from 'bun:test';
import {
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
} from '../../src/providers/presets.ts';

describe('Provider Presets', () => {
  describe('PROVIDER_PRESETS', () => {
    it('should have all required providers', () => {
      expect(PROVIDER_PRESETS.openai).toBeDefined();
      expect(PROVIDER_PRESETS.anthropic).toBeDefined();
      expect(PROVIDER_PRESETS.gemini).toBeDefined();
      expect(PROVIDER_PRESETS.xai).toBeDefined();
      expect(PROVIDER_PRESETS.deepseek).toBeDefined();
      expect(PROVIDER_PRESETS.custom).toBeDefined();
    });

    it('should have correct OpenAI preset', () => {
      const preset = PROVIDER_PRESETS.openai;
      expect(preset.id).toBe('openai');
      expect(preset.name).toBe('OpenAI');
      expect(preset.format).toBe('openai');
      expect(preset.defaultModel).toBe('gpt-4o');
      expect(preset.supportsModelFetch).toBe(true);
    });

    it('should have correct Anthropic preset with static models', () => {
      const preset = PROVIDER_PRESETS.anthropic;
      expect(preset.id).toBe('anthropic');
      expect(preset.format).toBe('anthropic');
      expect(preset.supportsModelFetch).toBe(false);
      expect(preset.staticModels).toBeDefined();
      expect(preset.staticModels?.length).toBeGreaterThan(0);
    });

    it('should have correct Gemini preset', () => {
      const preset = PROVIDER_PRESETS.gemini;
      expect(preset.id).toBe('gemini');
      expect(preset.format).toBe('gemini');
      expect(preset.defaultModel).toBe('gemini-2.5-flash');
      expect(preset.supportsModelFetch).toBe(true);
    });

    it('should have correct xAI preset with static models', () => {
      const preset = PROVIDER_PRESETS.xai;
      expect(preset.id).toBe('xai');
      expect(preset.format).toBe('openai'); // xAI uses OpenAI-compatible format
      expect(preset.staticModels).toBeDefined();
      expect(preset.staticModels).toContain('grok-2-image-1212');
    });
  });

  describe('Model Constants', () => {
    it('should have Gemini no-tools models', () => {
      expect(GEMINI_NO_TOOLS_MODELS).toContain('gemini-2.5-flash-image');
    });

    it('should have Gemini search-only models', () => {
      expect(GEMINI_SEARCH_ONLY_MODELS).toContain('gemini-3-pro-image-preview');
    });

    it('should have Gemini image models', () => {
      expect(GEMINI_IMAGE_MODELS).toContain('gemini-2.5-flash-image');
      expect(GEMINI_IMAGE_MODELS).toContain('gemini-3-pro-image-preview');
    });

    it('should have xAI image models', () => {
      expect(XAI_IMAGE_MODELS).toContain('grok-2-image-1212');
      expect(XAI_IMAGE_MODELS).toContain('grok-imagine-image');
      expect(XAI_IMAGE_MODELS).toContain('grok-imagine-image-pro');
    });

    it('should have reasoning models for all providers', () => {
      expect(REASONING_MODELS.anthropic).toBeDefined();
      expect(REASONING_MODELS.openai).toBeDefined();
      expect(REASONING_MODELS.gemini).toBeDefined();
      expect(REASONING_MODELS.deepseek).toBeDefined();
      expect(REASONING_MODELS.xai).toBeDefined();
    });
  });

  describe('supportsReasoning', () => {
    it('should return true for Claude models', () => {
      expect(supportsReasoning('anthropic', 'claude-3-5-sonnet-20241022')).toBe(true);
      expect(supportsReasoning('anthropic', 'claude-sonnet-4-20250514')).toBe(true);
      expect(supportsReasoning('anthropic', 'claude-3-opus-20240229')).toBe(true);
    });

    it('should return true for OpenAI o1/o3 models', () => {
      expect(supportsReasoning('openai', 'o1-preview')).toBe(true);
      expect(supportsReasoning('openai', 'o1-mini')).toBe(true);
      expect(supportsReasoning('openai', 'o3-mini')).toBe(true);
    });

    it('should return false for regular GPT models', () => {
      expect(supportsReasoning('openai', 'gpt-4o')).toBe(false);
      expect(supportsReasoning('openai', 'gpt-4-turbo')).toBe(false);
    });

    it('should return true for Gemini thinking models', () => {
      expect(supportsReasoning('gemini', 'gemini-2.0-flash-thinking-exp')).toBe(true);
      expect(supportsReasoning('gemini', 'gemini-2.5-pro')).toBe(true);
    });

    it('should return true for DeepSeek reasoner models', () => {
      expect(supportsReasoning('deepseek', 'deepseek-reasoner')).toBe(true);
      expect(supportsReasoning('deepseek', 'deepseek-r1')).toBe(true);
    });

    it('should return false for unknown providers', () => {
      expect(supportsReasoning('unknown', 'some-model')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(supportsReasoning('anthropic', 'CLAUDE-3-5-SONNET')).toBe(true);
      expect(supportsReasoning('openai', 'O1-PREVIEW')).toBe(true);
    });
  });

  describe('supportsGoogleSearch', () => {
    it('should return true for regular Gemini models', () => {
      expect(supportsGoogleSearch('gemini-2.0-flash')).toBe(true);
      expect(supportsGoogleSearch('gemini-1.5-pro')).toBe(true);
    });

    it('should return false for no-tools models', () => {
      expect(supportsGoogleSearch('gemini-2.5-flash-image')).toBe(false);
    });
  });

  describe('supportsFunctionCalling', () => {
    it('should return true for regular Gemini models', () => {
      expect(supportsFunctionCalling('gemini-2.0-flash')).toBe(true);
      expect(supportsFunctionCalling('gemini-1.5-pro')).toBe(true);
    });

    it('should return false for no-tools models', () => {
      expect(supportsFunctionCalling('gemini-2.5-flash-image')).toBe(false);
    });

    it('should return false for search-only models', () => {
      expect(supportsFunctionCalling('gemini-3-pro-image-preview')).toBe(false);
    });
  });

  describe('isGeminiImageModel', () => {
    it('should return true for Gemini image models', () => {
      expect(isGeminiImageModel('gemini-2.5-flash-image')).toBe(true);
      expect(isGeminiImageModel('gemini-3-pro-image-preview')).toBe(true);
    });

    it('should return false for regular Gemini models', () => {
      expect(isGeminiImageModel('gemini-2.0-flash')).toBe(false);
    });
  });

  describe('isXAIImageModel', () => {
    it('should return true for xAI image models', () => {
      expect(isXAIImageModel('grok-2-image-1212')).toBe(true);
      expect(isXAIImageModel('grok-imagine-image')).toBe(true);
      expect(isXAIImageModel('grok-imagine-image-pro')).toBe(true);
    });

    it('should return false for regular xAI models', () => {
      expect(isXAIImageModel('grok-beta')).toBe(false);
    });
  });

  describe('Aspect Ratios', () => {
    it('should have all supported aspect ratios', () => {
      expect(ASPECT_RATIOS).toContain('1:1');
      expect(ASPECT_RATIOS).toContain('16:9');
      expect(ASPECT_RATIOS).toContain('9:16');
      expect(ASPECT_RATIOS).toContain('4:3');
    });

    it('should have valid Gemini aspect ratio mapping', () => {
      expect(GEMINI_ASPECT_RATIO_MAP['1:1']).toBe('1:1');
      expect(GEMINI_ASPECT_RATIO_MAP['16:9']).toBe('16:9');
      expect(GEMINI_ASPECT_RATIO_MAP['9:16']).toBe('9:16');
    });
  });
});
