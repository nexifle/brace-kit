/**
 * Tests for Reasoning / Thinking Level Utilities
 */

import { describe, expect, it } from 'bun:test';
import {
  anthropicThinkingBlock,
  deepseekReasoningEffort,
  geminiThinkingBudget,
  geminiThinkingLevel,
  getReasoningLevelInfo,
  isAnthropicAdaptiveModel,
  openaiReasoningEffort,
  xaiReasoningEffort,
} from '../../../src/providers/utils/reasoning.ts';

describe('openaiReasoningEffort', () => {
  it('returns undefined without a level', () => {
    expect(openaiReasoningEffort()).toBeUndefined();
  });
  it('passes minimal/low/medium/high through', () => {
    expect(openaiReasoningEffort('minimal')).toBe('minimal');
    expect(openaiReasoningEffort('low')).toBe('low');
    expect(openaiReasoningEffort('medium')).toBe('medium');
    expect(openaiReasoningEffort('high')).toBe('high');
  });
  it('clamps max → high (OpenAI has no max)', () => {
    expect(openaiReasoningEffort('max')).toBe('high');
  });
});

describe('xaiReasoningEffort', () => {
  it('maps minimal → low and max → high', () => {
    expect(xaiReasoningEffort('minimal')).toBe('low');
    expect(xaiReasoningEffort('max')).toBe('high');
  });
  it('passes low/medium/high through', () => {
    expect(xaiReasoningEffort('high')).toBe('high');
  });
});

describe('deepseekReasoningEffort', () => {
  it('maps minimal → low, passes max through', () => {
    expect(deepseekReasoningEffort('minimal')).toBe('low');
    expect(deepseekReasoningEffort('max')).toBe('max');
    expect(deepseekReasoningEffort('high')).toBe('high');
  });
});

describe('isAnthropicAdaptiveModel', () => {
  it('detects 4.6+ and 5.x models as adaptive', () => {
    expect(isAnthropicAdaptiveModel('claude-sonnet-5')).toBe(true);
    expect(isAnthropicAdaptiveModel('claude-opus-5')).toBe(true);
    expect(isAnthropicAdaptiveModel('claude-fable-5')).toBe(true);
    expect(isAnthropicAdaptiveModel('claude-sonnet-4-6')).toBe(true);
    expect(isAnthropicAdaptiveModel('claude-opus-4-7')).toBe(true);
    expect(isAnthropicAdaptiveModel('claude-opus-4-8')).toBe(true);
    expect(isAnthropicAdaptiveModel('claude-mythos-preview')).toBe(true);
  });
  it('treats ≤4.5 models as legacy extended thinking', () => {
    expect(isAnthropicAdaptiveModel('claude-haiku-4-5')).toBe(false);
    expect(isAnthropicAdaptiveModel('claude-sonnet-4-5')).toBe(false);
    expect(isAnthropicAdaptiveModel('claude-opus-4-5')).toBe(false);
    expect(isAnthropicAdaptiveModel('claude-3-5-sonnet-20241022')).toBe(false);
  });
});

describe('anthropicThinkingBlock', () => {
  it('uses adaptive effort on 5.x models (default medium)', () => {
    expect(anthropicThinkingBlock('claude-sonnet-5', undefined)).toEqual({
      type: 'adaptive',
      effort: 'medium',
    });
    expect(anthropicThinkingBlock('claude-sonnet-5', 'high')).toEqual({
      type: 'adaptive',
      effort: 'high',
    });
  });
  it('clamps max → high on non-Opus adaptive models', () => {
    expect(anthropicThinkingBlock('claude-sonnet-5', 'max')).toEqual({
      type: 'adaptive',
      effort: 'high',
    });
  });
  it('keeps max on Opus adaptive models', () => {
    expect(anthropicThinkingBlock('claude-opus-5', 'max')).toEqual({
      type: 'adaptive',
      effort: 'max',
    });
  });
  it('maps minimal → low for adaptive models', () => {
    expect(anthropicThinkingBlock('claude-opus-5', 'minimal')).toEqual({
      type: 'adaptive',
      effort: 'low',
    });
  });
  it('uses legacy enabled+budget on ≤4.5 models (default 4096)', () => {
    expect(anthropicThinkingBlock('claude-haiku-4-5', undefined)).toEqual({
      type: 'enabled',
      budget_tokens: 4096,
    });
    expect(anthropicThinkingBlock('claude-haiku-4-5', 'low')).toEqual({
      type: 'enabled',
      budget_tokens: 4096,
    });
    expect(anthropicThinkingBlock('claude-haiku-4-5', 'max')).toEqual({
      type: 'enabled',
      budget_tokens: 32000,
    });
  });
  it('explicit budget wins over level', () => {
    expect(anthropicThinkingBlock('claude-haiku-4-5', 'low', 16384)).toEqual({
      type: 'enabled',
      budget_tokens: 16384,
    });
  });
  it('clamps budget to the 1024 minimum', () => {
    expect(anthropicThinkingBlock('claude-haiku-4-5', undefined, 10)).toEqual({
      type: 'enabled',
      budget_tokens: 1024,
    });
  });
});

describe('gemini helpers', () => {
  it('geminiThinkingLevel clamps max → high', () => {
    expect(geminiThinkingLevel('max')).toBe('high');
    expect(geminiThinkingLevel('low')).toBe('low');
  });
  it('geminiThinkingBudget defaults to 24576 (high)', () => {
    expect(geminiThinkingBudget()).toBe(24576);
    expect(geminiThinkingBudget('low')).toBe(8192);
    expect(geminiThinkingBudget('max')).toBe(32768);
  });
});

describe('getReasoningLevelInfo', () => {
  it('ollama is on/off only', () => {
    const info = getReasoningLevelInfo('ollama', 'ollama', 'llama3');
    expect(info.supportsLevels).toBe(false);
    expect(info.levels).toEqual([]);
  });
  it('anthropic adaptive models offer max only for opus', () => {
    const sonnet = getReasoningLevelInfo('anthropic', 'anthropic', 'claude-sonnet-5');
    expect(sonnet.supportsLevels).toBe(true);
    expect(sonnet.levels).toEqual(['low', 'medium', 'high']);

    const opus = getReasoningLevelInfo('anthropic', 'anthropic', 'claude-opus-5');
    expect(opus.levels).toEqual(['low', 'medium', 'high', 'max']);
  });
  it('anthropic ≤4.5 keeps the same levels without max', () => {
    const info = getReasoningLevelInfo('anthropic', 'anthropic', 'claude-haiku-4-5');
    expect(info.levels).toEqual(['low', 'medium', 'high']);
  });
  it('custom endpoints are treated as supporting levels', () => {
    const info = getReasoningLevelInfo('custom', 'openai', 'my-model');
    expect(info.supportsLevels).toBe(true);
    expect(info.levels).toEqual(['minimal', 'low', 'medium', 'high']);
  });
  it('openai offers minimal..high without max', () => {
    const info = getReasoningLevelInfo('openai', 'openai', 'gpt-5.6-sol');
    expect(info.levels).toEqual(['minimal', 'low', 'medium', 'high']);
  });
});
