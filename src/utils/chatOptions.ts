import type { CompactConfig, ModelParameters, ModelSpec, ReasoningLevel } from '../types/index.ts';
import {
  GEMINI_IMAGE_MODELS,
  GEMINI_NO_TOOLS_MODELS,
  XAI_IMAGE_MODELS,
} from '../providers/presets.ts';
import { getEffectiveMaxOutput, specSupportsGoogleSearch, specSupportsReasoning } from '../providers/modelSpecs.ts';
import { resolveSpecFromAppState } from './modelCapability.ts';
import { clampMaxOutputTokens } from './estimateTokens.ts';
import { getEffectiveContextWindow } from '../providers/modelSpecs.ts';
import { eligibleChatTools, estimateRequestContextTokens } from './requestContext.ts';
import { toolSnapshot } from './estimateTokens.ts';
import type { Conversation, CustomProvider, FetchedModelsCache, MCPTool, Memory, Message } from '../types/index.ts';

/** Slice of app state needed to build a CHAT_REQUEST `options` payload. */
export interface ChatOptionsState {
  providerConfig: {
    providerId: string;
    format?: string;
    model?: string;
    modelParameters?: ModelParameters;
    systemPrompt?: string;
  };
  enableGoogleSearch: boolean;
  enableReasoning: boolean;
  reasoningLevel: ReasoningLevel;
  enableStreaming: boolean;
  groqEnabledBuiltinTools?: string[];
  modelSpec?: ModelSpec;
  contextWindow?: number;
  estimatedContextTokens?: number;
  tools?: MCPTool[];
}

export interface BuildChatOptionsOverrides {
  aspectRatio?: string;
  enableReasoning?: boolean;
  reasoningLevel?: ReasoningLevel;
  /** Force stream on/off; defaults to state.enableStreaming. */
  stream?: boolean;
  tools?: MCPTool[];
}

export interface ChatRequestOptions {
  enableGoogleSearch: boolean;
  enableReasoning?: boolean;
  reasoningLevel?: ReasoningLevel;
  aspectRatio?: string;
  stream?: boolean;
  modelParameters?: ModelParameters;
  groqBuiltinTools?: string[];
}

/**
 * Pure builder for CHAT_REQUEST `options` — single source for main chat and
 * Slide Creator sub-agent sessions (reasoning level, google search, stream, …).
 */
export function buildChatOptions(
  state: ChatOptionsState,
  overrides?: BuildChatOptionsOverrides,
): ChatRequestOptions {
  const currentModel = state.providerConfig.model || '';
  const isGemini =
    state.providerConfig.providerId === 'gemini' ||
    state.providerConfig.format === 'gemini';
  const isXAIImg =
    state.providerConfig.providerId === 'xai' &&
    XAI_IMAGE_MODELS.includes(currentModel);
  const isGeminiImg = isGemini && GEMINI_IMAGE_MODELS.includes(currentModel);
  const spec = state.modelSpec;
  const wantReasoning = overrides?.enableReasoning ?? state.enableReasoning;

  const chatOptions: ChatRequestOptions = {
    enableGoogleSearch:
      state.enableGoogleSearch &&
      isGemini &&
      !GEMINI_NO_TOOLS_MODELS.includes(currentModel) &&
      (spec ? specSupportsGoogleSearch(spec, currentModel) : true),
    enableReasoning: wantReasoning && (spec ? specSupportsReasoning(spec, currentModel) : true),
    reasoningLevel: overrides?.reasoningLevel ?? state.reasoningLevel,
    stream: overrides?.stream ?? state.enableStreaming,
    modelParameters: { ...state.providerConfig.modelParameters },
  };

  const contextWindow = state.contextWindow ?? 0;
  if (contextWindow > 0) {
    const clamped = clampMaxOutputTokens({
      contextWindow,
      estimatedContextTokens: state.estimatedContextTokens ?? 0,
      requestedMaxTokens: state.providerConfig.modelParameters?.maxTokens,
      modelMaxTokens: state.modelSpec ? getEffectiveMaxOutput(state.modelSpec) : undefined,
    });
    if (clamped !== undefined) {
      chatOptions.modelParameters = {
        ...chatOptions.modelParameters,
        maxTokens: clamped,
      };
    }
  }

  if ((isXAIImg || isGeminiImg) && overrides?.aspectRatio) {
    chatOptions.aspectRatio = overrides.aspectRatio;
  }

  if (
    state.providerConfig.providerId === 'groq' &&
    state.groqEnabledBuiltinTools &&
    state.groqEnabledBuiltinTools.length > 0
  ) {
    chatOptions.groqBuiltinTools = state.groqEnabledBuiltinTools;
  }

  return chatOptions;
}

export type ChatOptionsStoreSnapshot = {
  providerConfig: ChatOptionsState['providerConfig'] & {
    model: string;
    providerId: string;
    systemPrompt?: string;
  };
  enableGoogleSearch: boolean;
  enableReasoning: boolean;
  reasoningLevel: ReasoningLevel;
  enableStreaming: boolean;
  groqEnabledBuiltinTools: string[];
  customProviders?: CustomProvider[];
  fetchedModels?: Record<string, FetchedModelsCache>;
  compactConfig?: CompactConfig;
  messages?: Message[];
  conversations?: Conversation[];
  activeConversationId?: string | null;
  memoryEnabled?: boolean;
  memories?: Memory[];
  tools?: MCPTool[];
};

/** Read live main-store fields into a ChatOptionsState (call at request time). */
export function chatOptionsStateFromStore(getState: () => ChatOptionsStoreSnapshot): ChatOptionsState {
  const s = getState();
  const custom = (s.customProviders ?? []).find((p) => p.id === s.providerConfig.providerId);
  const fetchedRaw = s.fetchedModels ?? {};
  const fetched = (fetchedRaw as Record<string, FetchedModelsCache>)[s.providerConfig.providerId];
  const modelSpec = resolveSpecFromAppState({
    providerConfig: s.providerConfig,
    customProviders: s.customProviders ?? [],
    fetchedModels: s.fetchedModels ?? {},
  });
  const compactConfig = s.compactConfig ?? {
    enabled: true,
    threshold: 0.9,
    defaultContextWindow: 128000,
    prompt: '',
  };
  const contextWindow = getEffectiveContextWindow(
    s.providerConfig as import('../types/index.ts').ProviderConfig,
    custom,
    compactConfig,
    fetched,
  );
  const estimatedContextTokens = estimateRequestContextTokens(
    {
      messages: s.messages ?? [],
      providerConfig: s.providerConfig,
      conversations: s.conversations ?? [],
      activeConversationId: s.activeConversationId ?? null,
      memoryEnabled: s.memoryEnabled ?? false,
      memories: s.memories ?? [],
    },
    s.tools,
  ).tokens;
  return {
    providerConfig: s.providerConfig,
    enableGoogleSearch: s.enableGoogleSearch,
    enableReasoning: s.enableReasoning,
    reasoningLevel: s.reasoningLevel,
    enableStreaming: s.enableStreaming,
    groqEnabledBuiltinTools: s.groqEnabledBuiltinTools,
    modelSpec,
    contextWindow,
    estimatedContextTokens,
  };
}

export interface PreparedChatRequest {
  tools: MCPTool[];
  options: ChatRequestOptions;
  estimatedContextTokens: number;
  contextWindow: number;
  snapshot: ReturnType<typeof toolSnapshot>;
}

/**
 * One request context for send, stream follow-up, clamp, and auto-compact.
 * Eligible tools, estimate, and chat options all come from the same list.
 */
export function prepareChatRequest(args: {
  getState: () => ChatOptionsStoreSnapshot;
  rawTools: MCPTool[];
  supportsFunctionCalling: boolean;
  isXAIImageModel?: boolean;
  overrides?: BuildChatOptionsOverrides;
}): PreparedChatRequest {
  const tools = eligibleChatTools({
    tools: args.rawTools,
    supportsFunctionCalling: args.supportsFunctionCalling,
    isXAIImageModel: args.isXAIImageModel,
    aspectRatio: args.overrides?.aspectRatio,
  });
  const state = chatOptionsStateFromStore(() => ({
    ...args.getState(),
    tools,
  }));
  return {
    tools,
    options: buildChatOptions(state, args.overrides),
    estimatedContextTokens: state.estimatedContextTokens ?? 0,
    contextWindow: state.contextWindow ?? 0,
    snapshot: toolSnapshot(tools),
  };
}
