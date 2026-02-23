/**
 * useTools Hook
 *
 * Unified tool management for API requests.
 * Provides functions to fetch MCP tools and inject built-in tools.
 */

import { useCallback } from 'react';
import { useStore } from '../../store/index.ts';
import type { MCPTool } from '../../types/index.ts';
import {
  GEMINI_NO_TOOLS_MODELS,
  GEMINI_SEARCH_ONLY_MODELS,
  GEMINI_IMAGE_MODELS,
  XAI_IMAGE_MODELS,
} from '../../providers/presets.ts';
import { getAllTools as getAllToolsFromRegistry } from '../../services/toolRegistry.ts';

/**
 * Options for getAllTools function
 */
export interface GetAllToolsOptions {
  providerId?: string;
  model?: string;
  enableGoogleSearchTool?: boolean;
  googleSearchApiKey?: string;
}

/**
 * Tool management hook
 * Unified tool fetching and injection
 */
export function useTools() {
  const store = useStore();

  /**
   * Fetch MCP tools from enabled servers
   */
  const fetchMCPTools = useCallback(async (): Promise<MCPTool[]> => {
    try {
      const mcpRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
      if (mcpRes?.tools) {
        const enabledServerIds = new Set(
          store.mcpServers.filter((s) => s.enabled !== false).map((s) => s.id)
        );
        return mcpRes.tools.filter((tool: MCPTool & { _serverId?: string }) =>
          enabledServerIds.has(tool._serverId || '')
        );
      }
    } catch (error) {
      console.warn('[useTools] Failed to fetch MCP tools:', error);
    }
    return [];
  }, [store.mcpServers]);

  /**
   * Check if current model supports function calling
   */
  const supportsFunctionCalling = useCallback(
    (model?: string): boolean => {
      const currentModel = model ?? store.providerConfig.model ?? '';
      const isGemini =
        store.providerConfig.providerId === 'gemini' ||
        store.providerConfig.format === 'gemini';

      return (
        !isGemini ||
        (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) &&
          !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel))
      );
    },
    [store.providerConfig]
  );

  /**
   * Check if current provider is Gemini
   */
  const isGeminiProvider = useCallback((): boolean => {
    return (
      store.providerConfig.providerId === 'gemini' ||
      store.providerConfig.format === 'gemini'
    );
  }, [store.providerConfig]);

  /**
   * Check if current model is an image generation model
   */
  const isImageModel = useCallback(
    (model?: string): boolean => {
      const currentModel = model ?? store.providerConfig.model ?? '';
      const isXAIImage = store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
      const isGeminiImage = isGeminiProvider() && GEMINI_IMAGE_MODELS.includes(currentModel);
      return isXAIImage || isGeminiImage;
    },
    [store.providerConfig, isGeminiProvider]
  );

  /**
   * Check if current model is xAI image model
   */
  const isXAIImageModel = useCallback(
    (model?: string): boolean => {
      const currentModel = model ?? store.providerConfig.model ?? '';
      return store.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
    },
    [store.providerConfig]
  );

  /**
   * Check if current model is Gemini image model
   */
  const isGeminiImageModel = useCallback(
    (model?: string): boolean => {
      const currentModel = model ?? store.providerConfig.model ?? '';
      return isGeminiProvider() && GEMINI_IMAGE_MODELS.includes(currentModel);
    },
    [isGeminiProvider]
  );

  /**
   * Get all tools for API request (MCP + built-in)
   *
   * @param options - Optional overrides for store values
   */
  const getAllTools = useCallback(
    async (options?: GetAllToolsOptions): Promise<MCPTool[]> => {
      const providerId = options?.providerId ?? store.providerConfig.providerId;
      const model = options?.model ?? store.providerConfig.model ?? '';
      const enableGoogleSearchTool =
        options?.enableGoogleSearchTool ?? store.enableGoogleSearchTool;
      const googleSearchApiKey =
        options?.googleSearchApiKey ?? store.googleSearchApiKey;

      // Fetch MCP tools
      const mcpTools = await fetchMCPTools();

      const isGemini = providerId === 'gemini' || store.providerConfig.format === 'gemini';
      const canUseFunctionCalling = supportsFunctionCalling(model);

      // Use toolRegistry to get all tools (MCP + built-in)
      return getAllToolsFromRegistry({
        mcpTools,
        enableGoogleSearchTool,
        googleSearchApiKey,
        supportsFunctionCalling: canUseFunctionCalling,
        isGemini,
      });
    },
    [store, fetchMCPTools, supportsFunctionCalling]
  );

  /**
   * Get chat options for current provider/model
   */
  const getChatOptions = useCallback(
    (options?: { aspectRatio?: string; enableReasoning?: boolean }) => {
      const currentModel = store.providerConfig.model || '';
      const isGemini = isGeminiProvider();
      const isXAIImg = isXAIImageModel();
      const isGeminiImg = isGeminiImageModel();

      const chatOptions: {
        enableGoogleSearch: boolean;
        enableReasoning?: boolean;
        aspectRatio?: string;
      } = {
        enableGoogleSearch:
          store.enableGoogleSearch &&
          isGemini &&
          !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
        enableReasoning: options?.enableReasoning ?? store.enableReasoning,
      };

      // Add aspect ratio for image models
      if ((isXAIImg || isGeminiImg) && options?.aspectRatio) {
        chatOptions.aspectRatio = options.aspectRatio;
      }

      return chatOptions;
    },
    [store, isGeminiProvider, isXAIImageModel, isGeminiImageModel]
  );

  return {
    fetchMCPTools,
    getAllTools,
    supportsFunctionCalling,
    isGeminiProvider,
    isImageModel,
    isXAIImageModel,
    isGeminiImageModel,
    getChatOptions,
  };
}
