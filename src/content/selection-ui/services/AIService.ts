/**
 * AI Service for selection-ui
 * Handles AI requests for quick actions with rate limiting
 */

import type { QuickAction } from '../types.ts';
import { QUICK_ACTIONS } from '../constants.ts';
import { logger } from '../utils/logger.ts';
import { isExtensionContextInvalidated, isChromeRuntimeAvailable } from '../utils/chromeErrorHandler.ts';
import { createRateLimiter, type RateLimiter } from '../core/RateLimiter.ts';

// === Types ===

export interface AIProviderConfig {
  providerId: string;
  apiKey: string;
  [key: string]: unknown;
}

export interface AIRequestOptions {
  action: QuickAction['id'];
  text: string;
  targetLang?: string;
  requestId: string;
}

export interface AIResponse {
  content?: string;
  error?: string;
}

export interface AIServiceConfig {
  rateLimitMs?: number;
}

export interface AIService {
  execute(options: AIRequestOptions): Promise<AIResponse>;
  canProceed(): boolean;
  getTimeUntilNext(): number;
}

// === Provider Config Helpers ===

interface StorageData {
  providerConfig?: { providerId: string; [key: string]: unknown };
  providerKeys?: Record<string, { apiKey: string }>;
}

async function getProviderConfig(): Promise<AIProviderConfig | null> {
  // Check if extension context is still valid
  if (!isChromeRuntimeAvailable()) {
    logger.warn('Extension context not available');
    return null;
  }

  try {
    const storage = (await chrome.storage.local.get([
      'providerConfig',
      'providerKeys',
    ])) as StorageData;

    const providerConfig = storage.providerConfig;
    const providerKeys = storage.providerKeys || {};

    if (!providerConfig) {
      return null;
    }

    const apiKey = providerKeys[providerConfig.providerId]?.apiKey || '';

    return {
      ...providerConfig,
      apiKey,
    };
  } catch (error) {
    if (isExtensionContextInvalidated(error)) {
      logger.warn('Extension context invalidated while getting provider config');
      return null;
    }
    logger.error('Failed to get provider config', error);
    return null;
  }
}

function validateProviderConfig(config: AIProviderConfig | null): { valid: boolean; error?: string } {
  if (!config) {
    return { valid: false, error: 'No provider configured. Please configure a provider in the BraceKit sidebar.' };
  }

  if (!config.apiKey) {
    return { valid: false, error: `No API key found for ${config.providerId}. Please add your API key in the BraceKit sidebar.` };
  }

  return { valid: true };
}

// === AI Service Factory ===

export function createAIService(config: AIServiceConfig = {}): AIService {
  const rateLimiter: RateLimiter = createRateLimiter(config.rateLimitMs);

  async function execute(options: AIRequestOptions): Promise<AIResponse> {
    const { action, text, targetLang, requestId } = options;

    // Validate input
    if (!text || text.trim().length === 0) {
      return { error: 'No text selected. Please select some text first.' };
    }

    // Check rate limit
    if (!rateLimiter.canProceed()) {
      const waitTime = Math.ceil(rateLimiter.getTimeUntilNext() / 1000);
      return { error: `Please wait ${waitTime} second(s) before making another request.` };
    }

    // Get action config
    const actionConfig = QUICK_ACTIONS.find((a) => a.id === action);
    if (!actionConfig) {
      return { error: `Unknown action: ${action}` };
    }

    // Get provider config
    const providerConfig = await getProviderConfig();
    const validation = validateProviderConfig(providerConfig);
    if (!validation.valid) {
      return { error: validation.error };
    }

    // Build prompt
    const prompt = actionConfig.prompt(text, targetLang);

    // Check if extension context is still valid before making request
    if (!isChromeRuntimeAvailable()) {
      return { error: 'Extension context invalidated. Please refresh the page.' };
    }

    try {
      rateLimiter.recordRequest();

      const response = await chrome.runtime.sendMessage({
        type: 'CHAT_REQUEST',
        messages: [{ role: 'user', content: prompt }],
        providerConfig,
        tools: [],
        options: { stream: false },
        requestId,
      });

      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || 'Unknown extension error';

        // Check for context invalidation
        if (isExtensionContextInvalidated(new Error(errorMsg))) {
          return { error: 'Extension was reloaded. Please refresh the page.' };
        }

        logger.error('Extension error', errorMsg);
        return { error: `Extension error: ${errorMsg}` };
      }

      if (response?.error) {
        const errorMsg = typeof response.error === 'string' ? response.error : 'Request failed';
        logger.error('AI request error', errorMsg);
        return { error: errorMsg };
      }

      const content = response?.content;
      if (typeof content !== 'string' || content.length === 0) {
        logger.error('Empty response from AI');
        return { error: 'Received empty response from AI' };
      }

      return { content };
    } catch (error) {
      // Check for context invalidation
      if (isExtensionContextInvalidated(error)) {
        logger.warn('Extension context invalidated during AI request');
        return { error: 'Extension was reloaded. Please refresh the page.' };
      }

      const errorMsg = error instanceof Error ? error.message : 'Request failed';
      logger.error('AI request failed', error);
      return { error: errorMsg };
    }
  }

  return {
    execute,
    canProceed: () => rateLimiter.canProceed(),
    getTimeUntilNext: () => rateLimiter.getTimeUntilNext(),
  };
}

// === Singleton Instance ===

let aiServiceInstance: AIService | null = null;

export function getAIService(): AIService {
  if (!aiServiceInstance) {
    aiServiceInstance = createAIService();
  }
  return aiServiceInstance;
}

export function resetAIService(): void {
  aiServiceInstance = null;
}
