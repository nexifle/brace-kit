/**
 * Reasoning / Thinking Level Utilities
 *
 * Maps the user-facing reasoning level (minimal/low/medium/high/max) to the
 * concrete API parameters of each provider. This is the single source of truth
 * used by the request formatters — the popover just picks a level, the
 * formatters translate it.
 *
 * Provider mapping (July 2026):
 * - OpenAI (gpt-5.x):          `reasoning_effort: minimal|low|medium|high`
 * - Anthropic ≥4.6 (5.x):      `thinking: { type: "adaptive", effort: low|medium|high|max }`
 * - Anthropic ≤4.5:            `thinking: { type: "enabled", budget_tokens: N }`
 * - Gemini 3+:                 `thinkingConfig: { thinkingLevel: minimal|low|medium|high }`
 * - Gemini 2.5:                `thinkingConfig: { thinkingBudget: N }`
 * - xAI Grok 4.x:              `reasoning_effort: low|medium|high` (minimal→low, max→high)
 * - DeepSeek V4:               `reasoning_effort` + `thinking: { type: "enabled"|"disabled" }`
 * - Groq (gpt-oss/kimi-k2):    `reasoning_effort: minimal|low|medium|high`
 * - Ollama:                    `think: true` (on/off only, no level)
 */

import type { ReasoningLevel } from '../../types/index.ts';

export type { ReasoningLevel };

// ==================== Level Catalogue ====================

export const REASONING_LEVELS: readonly ReasoningLevel[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'max',
] as const;

export const REASONING_LEVEL_LABELS: Record<ReasoningLevel, string> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  max: 'Max',
};

/** Default level used by the composer popover when the user first enables reasoning. */
export const DEFAULT_REASONING_LEVEL: ReasoningLevel = 'medium';

export function isReasoningLevel(value: unknown): value is ReasoningLevel {
  return REASONING_LEVELS.includes(value as ReasoningLevel);
}

// ==================== OpenAI / OpenAI-compatible ====================

/**
 * OpenAI-compatible `reasoning_effort`. OpenAI has no 'max' — clamp to 'high'.
 * Used for OpenAI, xAI (Grok 4.x), Groq (gpt-oss/kimi-k2) and custom endpoints.
 */
export function openaiReasoningEffort(level?: ReasoningLevel): string | undefined {
  if (!level) return undefined;
  return level === 'max' ? 'high' : level;
}

/** xAI: grok-4.x effort values are low/medium/high — no 'minimal' or 'max'. */
export function xaiReasoningEffort(level?: ReasoningLevel): string | undefined {
  if (!level) return undefined;
  if (level === 'minimal') return 'low';
  if (level === 'max') return 'high';
  return level;
}

/**
 * DeepSeek V4: accepts low/medium/high/max/xhigh. 'low'/'medium' map to 'high'
 * server-side, 'xhigh' maps to 'max' — pass the user level straight through.
 */
export function deepseekReasoningEffort(level?: ReasoningLevel): string | undefined {
  if (!level) return undefined;
  return level === 'minimal' ? 'low' : level;
}

// ==================== Anthropic ====================

/**
 * Adaptive thinking (`type: "adaptive"` + effort) is available on Claude 4.6+
 * (sonnet-4-6, opus-4-6, 4.7, 4.8) and all 5.x models (sonnet-5, opus-5, fable-5)
 * plus Claude Mythos. Older models (≤4.5, incl. haiku-4-5) only support the
 * legacy `type: "enabled"` + `budget_tokens` form (rejected with a 400 on 4.7+).
 */
export function isAnthropicAdaptiveModel(model: string): boolean {
  if (/mythos/i.test(model)) return true;
  const m = model.match(/claude-(?:opus|sonnet|haiku|fable)[- ]?(\d+)(?:[-.](\d+))?/i);
  if (!m) return false;
  const major = parseInt(m[1], 10);
  const minor = m[2] ? parseInt(m[2], 10) : 0;
  return major > 4 || (major === 4 && minor >= 6);
}

/** 'max' adaptive effort is Opus-only (sonnet returns 400 for it). */
function isClaudeOpusModel(model: string): boolean {
  return /claude-opus/i.test(model);
}

const ANTHROPIC_BUDGET_BY_LEVEL: Record<ReasoningLevel, number> = {
  minimal: 2048,
  low: 4096,
  medium: 8192,
  high: 16384,
  max: 32000,
};

/**
 * Build the Anthropic `thinking` block.
 * - Adaptive models: `{ type: "adaptive", effort }` (minimal→low, max clamped to
 *   high on non-Opus models).
 * - Legacy models: `{ type: "enabled", budget_tokens }` — explicit
 *   `budget` (modelParameters.thinkingBudget) wins; otherwise the level maps to a
 *   budget; when no level is given fall back to the historical default of 4096.
 */
export function anthropicThinkingBlock(
  model: string,
  level?: ReasoningLevel,
  budget?: number
): { type: 'adaptive'; effort: string } | { type: 'enabled'; budget_tokens: number } {
  if (isAnthropicAdaptiveModel(model)) {
    let effort = level === 'minimal' ? 'low' : (level ?? 'medium');
    if (effort === 'max' && !isClaudeOpusModel(model)) effort = 'high';
    return { type: 'adaptive', effort };
  }
  return {
    type: 'enabled',
    budget_tokens: Math.max(1024, budget ?? (level ? ANTHROPIC_BUDGET_BY_LEVEL[level] : 4096)),
  };
}

// ==================== Gemini ====================

/** Gemini 3+ `thinkingLevel` — no 'max' (clamp to 'high'). */
export function geminiThinkingLevel(level?: ReasoningLevel): string | undefined {
  if (!level) return undefined;
  return level === 'max' ? 'high' : level;
}

const GEMINI_BUDGET_BY_LEVEL: Record<ReasoningLevel, number> = {
  minimal: 4096,
  low: 8192,
  medium: 16384,
  high: 24576,
  max: 32768,
};

/** Gemini 2.5 `thinkingBudget`. Defaults to the historical default of 24576 (high). */
export function geminiThinkingBudget(level?: ReasoningLevel): number {
  return GEMINI_BUDGET_BY_LEVEL[level ?? 'high'];
}

// ==================== UI Capability Info ====================

export interface ReasoningLevelInfo {
  /** Whether this provider accepts an effort/level (vs on/off only). */
  supportsLevels: boolean;
  /** Levels offered in the popover for the current provider + model. */
  levels: ReasoningLevel[];
}

/**
 * What the composer reasoning popover should offer for the current provider.
 * Unknown/custom OpenAI-compatible endpoints are treated as supporting levels —
 * if the API rejects them, the background service retries without thinking
 * params (graceful fallback).
 */
export function getReasoningLevelInfo(
  providerId: string,
  _format: string,
  model: string
): ReasoningLevelInfo {
  switch (providerId) {
    case 'openai':
    case 'groq':
      return {
        supportsLevels: true,
        levels: ['minimal', 'low', 'medium', 'high'],
      };
    case 'xai':
    case 'grok':
      return {
        supportsLevels: true,
        levels: ['low', 'medium', 'high'],
      };
    case 'deepseek':
      return {
        supportsLevels: true,
        levels: ['low', 'medium', 'high', 'max'],
      };
    case 'anthropic': {
      const adaptive = isAnthropicAdaptiveModel(model);
      return {
        supportsLevels: true,
        levels: [
          'low',
          'medium',
          'high',
          ...(adaptive && isClaudeOpusModel(model) ? (['max'] as const) : []),
        ],
      };
    }
    case 'gemini':
      return {
        supportsLevels: true,
        levels: ['minimal', 'low', 'medium', 'high'],
      };
    case 'ollama':
      return {
        supportsLevels: false,
        levels: [],
      };
    default:
      // Custom OpenAI-compatible endpoint (OpenRouter, local servers, proxies…)
      return {
        supportsLevels: true,
        levels: ['minimal', 'low', 'medium', 'high'],
      };
  }
}
