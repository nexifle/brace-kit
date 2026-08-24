import type { ModelParameters, ModelSpec, ReasoningLevel } from '../types/index.ts';
import {
  GEMINI_IMAGE_MODELS,
  GEMINI_NO_TOOLS_MODELS,
  XAI_IMAGE_MODELS,
} from '../providers/presets.ts';
import { specSupportsGoogleSearch, specSupportsReasoning } from '../providers/modelSpecs.ts';
import { resolveSpecFromAppState } from './modelCapability.ts';

/** Slice of app state needed to build a CHAT_REQUEST `options` payload. */
export interface ChatOptionsState {
  providerConfig: {
    providerId: string;
    format?: string;
    model?: string;
    modelParameters?: ModelParameters;
  };
  enableGoogleSearch: boolean;
  enableReasoning: boolean;
  reasoningLevel: ReasoningLevel;
  enableStreaming: boolean;
  groqEnabledBuiltinTools?: string[];
  modelSpec?: ModelSpec;
}

export interface BuildChatOptionsOverrides {
  aspectRatio?: string;
  enableReasoning?: boolean;
  reasoningLevel?: ReasoningLevel;
  /** Force stream on/off; defaults to state.enableStreaming. */
  stream?: boolean;
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
    modelParameters: state.providerConfig.modelParameters,
  };

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

/** Read live main-store fields into a ChatOptionsState (call at request time). */
export function chatOptionsStateFromStore(getState: () => {
  providerConfig: ChatOptionsState['providerConfig'] & { model: string; providerId: string };
  enableGoogleSearch: boolean;
  enableReasoning: boolean;
  reasoningLevel: ReasoningLevel;
  enableStreaming: boolean;
  groqEnabledBuiltinTools: string[];
  customProviders?: import('../types/index.ts').CustomProvider[];
  fetchedModels?: import('../types/index.ts').AppState['fetchedModels'];
}): ChatOptionsState {
  const s = getState();
  const modelSpec = resolveSpecFromAppState({
    providerConfig: s.providerConfig,
    customProviders: s.customProviders ?? [],
    fetchedModels: s.fetchedModels ?? {},
  });
  return {
    providerConfig: s.providerConfig,
    enableGoogleSearch: s.enableGoogleSearch,
    enableReasoning: s.enableReasoning,
    reasoningLevel: s.reasoningLevel,
    enableStreaming: s.enableStreaming,
    groqEnabledBuiltinTools: s.groqEnabledBuiltinTools,
    modelSpec,
  };
}
