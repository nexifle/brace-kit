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
import { ensureMCPConnected } from '../../utils/mcpReconnect.ts';

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
  // Use selective selectors - only subscribe to state needed for rendering decisions
  // Most operations use useStore.getState() inside callbacks to avoid subscriptions

  /**
   * Filter raw tool list from background against enabled servers / disabled tools in store.
   */
  const filterTools = useCallback(
    (
      rawTools: (MCPTool & { _serverId?: string })[],
      enabledServers: { id: string; disabledTools?: string[] }[]
    ): MCPTool[] => {
      const enabledServerIds = new Set(enabledServers.map((s) => s.id));
      const disabledToolsMap = new Map<string, Set<string>>();
      for (const server of enabledServers) {
        if (server.disabledTools?.length) {
          disabledToolsMap.set(server.id, new Set(server.disabledTools));
        }
      }
      return rawTools.filter((tool) => {
        const serverId = tool._serverId || '';
        if (!enabledServerIds.has(serverId)) return false;
        return !disabledToolsMap.get(serverId)?.has(tool.name);
      });
    },
    []
  );

  /**
   * Fetch MCP tools from enabled servers.
   *
   * If the background returns no tools despite the store showing connected
   * servers (SW restart race condition), this triggers a reconnect and retries
   * once before giving up.
   */
  const fetchMCPTools = useCallback(async (): Promise<MCPTool[]> => {
    try {
      const state = useStore.getState();
      if (state.enableMCP === false) return [];

      const enabledServers = state.mcpServers.filter((s) => s.enabled !== false);
      const mcpRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });

      if (mcpRes?.tools && mcpRes.tools.length > 0) {
        return filterTools(mcpRes.tools, enabledServers);
      }

      // Fallback: if tools are empty but store shows connected servers with tools,
      // the SW likely restarted and restoreMCPServers() hasn't completed (or failed).
      // Force reconnect and retry once.
      const hasConnectedWithTools = enabledServers.some(
        (s) => s.connected && (s.toolCount ?? 0) > 0
      );
      if (hasConnectedWithTools) {
        await ensureMCPConnected();
        const retryRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
        if (retryRes?.tools) {
          return filterTools(retryRes.tools, enabledServers);
        }
      }
    } catch (error) {
      console.warn('[useTools] Failed to fetch MCP tools:', error);
    }
    return [];
  }, [filterTools]);

  /**
   * Check if current model supports function calling
   */
  const supportsFunctionCalling = useCallback(
    (model?: string): boolean => {
      const state = useStore.getState();
      const currentModel = model ?? state.providerConfig.model ?? '';
      const isGemini =
        state.providerConfig.providerId === 'gemini' ||
        state.providerConfig.format === 'gemini';

      return (
        !isGemini ||
        (!GEMINI_NO_TOOLS_MODELS.includes(currentModel) &&
          !GEMINI_SEARCH_ONLY_MODELS.includes(currentModel))
      );
    },
    []
  );

  /**
   * Check if current provider is Gemini
   */
  const isGeminiProvider = useCallback((): boolean => {
    const state = useStore.getState();
    return (
      state.providerConfig.providerId === 'gemini' ||
      state.providerConfig.format === 'gemini'
    );
  }, []);

  /**
   * Check if current model is an image generation model
   */
  const isImageModel = useCallback(
    (model?: string): boolean => {
      const state = useStore.getState();
      const currentModel = model ?? state.providerConfig.model ?? '';
      const isXAIImage = state.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
      const isGeminiImage = isGeminiProvider() && GEMINI_IMAGE_MODELS.includes(currentModel);
      return isXAIImage || isGeminiImage;
    },
    [isGeminiProvider]
  );

  /**
   * Check if current model is xAI image model
   */
  const isXAIImageModel = useCallback(
    (model?: string): boolean => {
      const state = useStore.getState();
      const currentModel = model ?? state.providerConfig.model ?? '';
      return state.providerConfig.providerId === 'xai' && XAI_IMAGE_MODELS.includes(currentModel);
    },
    []
  );

  /**
   * Check if current model is Gemini image model
   */
  const isGeminiImageModel = useCallback(
    (model?: string): boolean => {
      const state = useStore.getState();
      const currentModel = model ?? state.providerConfig.model ?? '';
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
      const state = useStore.getState();
      const providerId = options?.providerId ?? state.providerConfig.providerId;
      const model = options?.model ?? state.providerConfig.model ?? '';
      const enableGoogleSearchTool =
        options?.enableGoogleSearchTool ?? state.enableGoogleSearchTool;
      const googleSearchApiKey =
        options?.googleSearchApiKey ?? state.googleSearchApiKey;

      // Fetch MCP tools
      const mcpTools = await fetchMCPTools();

      const isGemini = providerId === 'gemini' || state.providerConfig.format === 'gemini';
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
    [fetchMCPTools, supportsFunctionCalling]
  );

  /**
   * Get chat options for current provider/model
   */
  const getChatOptions = useCallback(
    (options?: { aspectRatio?: string; enableReasoning?: boolean }) => {
      const state = useStore.getState();
      const currentModel = state.providerConfig.model || '';
      const isGemini = isGeminiProvider();
      const isXAIImg = isXAIImageModel();
      const isGeminiImg = isGeminiImageModel();

      const chatOptions: {
        enableGoogleSearch: boolean;
        enableReasoning?: boolean;
        aspectRatio?: string;
        stream?: boolean;
        modelParameters?: typeof state.providerConfig.modelParameters;
      } = {
        enableGoogleSearch:
          state.enableGoogleSearch &&
          isGemini &&
          !GEMINI_NO_TOOLS_MODELS.includes(currentModel),
        enableReasoning: options?.enableReasoning ?? state.enableReasoning,
        stream: state.enableStreaming,
        modelParameters: state.providerConfig.modelParameters,
      };

      // Add aspect ratio for image models
      if ((isXAIImg || isGeminiImg) && options?.aspectRatio) {
        chatOptions.aspectRatio = options.aspectRatio;
      }

      return chatOptions;
    },
    [isGeminiProvider, isXAIImageModel, isGeminiImageModel]
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
