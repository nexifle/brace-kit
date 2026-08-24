/**
 * Per-model spec merge, live /models parsers, and effective-limit helpers.
 */

import type {
  CustomProvider,
  FetchedModelsCache,
  ModelCapabilities,
  ModelModality,
  ModelMode,
  ModelSpec,
  ProviderConfig,
  CompactConfig,
} from '../types/index.ts';
import { catalogSpec } from './modelCatalog.ts';

const POSITIVE = (n: unknown): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

const MODALITIES: ModelModality[] = ['text', 'image', 'audio', 'video', 'pdf'];

function asModalities(value: unknown): ModelModality[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const next = value.filter((v): v is ModelModality =>
    typeof v === 'string' && (MODALITIES as string[]).includes(v),
  );
  return next.length > 0 ? next : undefined;
}

function firstNumber(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (typeof c === 'number') {
      const n = POSITIVE(c);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

export function mergeSpecs(base: ModelSpec | undefined, overlay: Partial<ModelSpec> & { id: string }): ModelSpec {
  const id = overlay.id || base?.id || '';
  return {
    ...base,
    ...overlay,
    id,
    limit: { ...base?.limit, ...overlay.limit },
    capabilities: { ...base?.capabilities, ...overlay.capabilities },
    modalities:
      overlay.modalities || base?.modalities
        ? {
            input: overlay.modalities?.input ?? base?.modalities?.input ?? ['text'],
            output: overlay.modalities?.output ?? base?.modalities?.output ?? ['text'],
          }
        : undefined,
    supportedParameters: overlay.supportedParameters ?? base?.supportedParameters,
  };
}

export function overlayCatalog(providerId: string, live: ModelSpec): ModelSpec {
  const cat = catalogSpec(providerId, live.id);
  if (!cat) return live;
  return mergeSpecs(cat, {
    ...live,
    id: live.id,
    limit: {
      context: live.limit?.context ?? cat.limit?.context,
      input: live.limit?.input ?? cat.limit?.input,
      output: live.limit?.output ?? cat.limit?.output,
    },
    capabilities: { ...cat.capabilities, ...live.capabilities },
    mode: live.mode ?? cat.mode,
    reasoningControl: live.reasoningControl ?? cat.reasoningControl,
    modalities: live.modalities ?? cat.modalities,
    name: live.name ?? cat.name,
  });
}

export function parseOpenAICompatModel(raw: unknown): ModelSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === 'string' ? m.id : typeof m.name === 'string' && !m.object ? m.name : '';
  if (!id) return null;

  const info = (m.info && typeof m.info === 'object' ? m.info : {}) as Record<string, unknown>;
  const metadata = (m.metadata && typeof m.metadata === 'object' ? m.metadata : {}) as Record<string, unknown>;
  const architecture = (m.architecture && typeof m.architecture === 'object' ? m.architecture : {}) as Record<string, unknown>;
  const topProvider = (m.top_provider && typeof m.top_provider === 'object' ? m.top_provider : {}) as Record<string, unknown>;
  const modalitiesObj = (m.modalities && typeof m.modalities === 'object' ? m.modalities : {}) as Record<string, unknown>;

  const context = firstNumber(
    m.context_length,
    m.context_window,
    m.max_input_tokens,
    info.contextLength,
    metadata.context_window,
    topProvider.context_length,
  );
  const output = firstNumber(
    topProvider.max_completion_tokens,
    m.max_output_tokens,
    m.max_completion_tokens,
    info.outputMax,
    m.max_tokens,
  );

  const name =
    (typeof m.display_name === 'string' && m.display_name) ||
    (typeof info.name === 'string' && info.name) ||
    (typeof m.name === 'string' && m.name !== id ? m.name : undefined) ||
    undefined;

  const inputMods = asModalities(architecture.input_modalities) ?? asModalities(modalitiesObj.input);
  const outputMods = asModalities(architecture.output_modalities) ?? asModalities(modalitiesObj.output);

  const caps: ModelCapabilities = {};
  const supported = Array.isArray(m.supported_parameters)
    ? (m.supported_parameters as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  const capList = Array.isArray(m.capabilities)
    ? (m.capabilities as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  if (supported.includes('tools') || capList.includes('tools') || m.supports_function_calling === true) {
    caps.tools = true;
  }
  if (m.supports_function_calling === false) caps.tools = false;
  if (m.supports_vision === true || capList.includes('vision') || inputMods?.includes('image')) caps.vision = true;
  if (m.supports_reasoning === true || supported.includes('reasoning') || capList.includes('reasoning')) {
    caps.reasoning = true;
  }
  if (m.supports_response_schema === true || capList.includes('structured_output')) {
    caps.structuredOutput = true;
  }

  let mode: ModelMode | undefined;
  if (typeof m.image_price === 'number' || id.includes('imagine-image') || outputMods?.includes('image')) {
    mode = 'image_generation';
    caps.imageGeneration = true;
  } else if (m.mode === 'embedding') {
    mode = 'embedding';
  } else if (m.mode === 'chat' || m.mode === 'image_generation') {
    mode = m.mode;
  }

  const spec: ModelSpec = { id };
  if (name) spec.name = name;
  if (mode) spec.mode = mode;
  if (context !== undefined || output !== undefined) {
    spec.limit = { context, output };
  }
  if (inputMods || outputMods) {
    spec.modalities = {
      input: inputMods ?? ['text'],
      output: outputMods ?? ['text'],
    };
  }
  if (Object.keys(caps).length > 0) spec.capabilities = caps;
  return spec;
}

export function parseAnthropicModel(raw: unknown): ModelSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const id = typeof m.id === 'string' ? m.id : '';
  if (!id) return null;

  const spec: ModelSpec = { id };
  if (typeof m.display_name === 'string' && m.display_name) spec.name = m.display_name;

  const input = POSITIVE(m.max_input_tokens);
  const output = POSITIVE(m.max_tokens);
  if (input !== undefined || output !== undefined) {
    spec.limit = { context: input, input, output };
  }

  const capabilities = (m.capabilities && typeof m.capabilities === 'object'
    ? m.capabilities
    : {}) as Record<string, unknown>;
  const supported = (cap: unknown) =>
    cap && typeof cap === 'object' && (cap as { supported?: boolean }).supported === true;

  const caps: ModelCapabilities = {};
  if (supported(capabilities.image_input)) caps.vision = true;
  if (supported(capabilities.structured_outputs)) caps.structuredOutput = true;
  if (supported(capabilities.thinking) || supported(capabilities.effort)) caps.reasoning = true;

  const inputMods: ModelModality[] = ['text'];
  if (supported(capabilities.image_input)) inputMods.push('image');
  if (supported(capabilities.pdf_input)) inputMods.push('pdf');

  if (Object.keys(caps).length > 0) spec.capabilities = caps;
  if (inputMods.length > 1) spec.modalities = { input: inputMods, output: ['text'] };
  if (supported(capabilities.effort)) spec.reasoningControl = 'effort';
  else if (supported(capabilities.thinking)) spec.reasoningControl = 'budget';

  spec.mode = 'chat';
  return spec;
}

export function parseGeminiModel(raw: unknown): ModelSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const methods = Array.isArray(m.supportedGenerationMethods)
    ? (m.supportedGenerationMethods as unknown[])
    : [];
  if (!methods.includes('generateContent')) return null;

  const rawName = typeof m.name === 'string' ? m.name : '';
  const id = rawName.replace(/^models\//, '');
  if (!id) return null;

  const spec: ModelSpec = { id };
  if (typeof m.displayName === 'string' && m.displayName) spec.name = m.displayName;

  const input = POSITIVE(m.inputTokenLimit);
  const output = POSITIVE(m.outputTokenLimit);
  if (input !== undefined || output !== undefined) {
    spec.limit = { context: input, input, output };
  }

  const isImage = id.includes('-image');
  spec.mode = isImage ? 'image_generation' : 'chat';
  spec.capabilities = {
    tools: !isImage,
    googleSearch: !isImage,
    vision: true,
    reasoning: m.thinking === true || !isImage,
    imageGeneration: isImage,
  };
  if (m.thinking === true) spec.reasoningControl = 'effort';
  spec.modalities = isImage
    ? { input: ['text', 'image'], output: ['image'] }
    : { input: ['text', 'image'], output: ['text'] };
  return spec;
}

export function parseOllamaShow(modelId: string, raw: unknown): ModelSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const details = (m.details && typeof m.details === 'object' ? m.details : {}) as Record<string, unknown>;
  const modelInfo = (m.model_info && typeof m.model_info === 'object' ? m.model_info : {}) as Record<string, unknown>;
  const family = typeof details.family === 'string' ? details.family : '';
  const context =
    firstNumber(modelInfo[`${family}.context_length`]) ??
    firstNumber(
      ...Object.entries(modelInfo)
        .filter(([k]) => k.endsWith('.context_length'))
        .map(([, v]) => v),
    );

  const capList = Array.isArray(m.capabilities)
    ? (m.capabilities as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  const spec: ModelSpec = { id: modelId, mode: 'chat' };
  if (context !== undefined) spec.limit = { context };
  spec.capabilities = {
    vision: capList.includes('vision'),
    tools: capList.includes('tools'),
  };
  spec.modalities = {
    input: capList.includes('vision') ? ['text', 'image'] : ['text'],
    output: ['text'],
  };
  return spec;
}

export function specsToRecord(specs: ModelSpec[] | undefined): Record<string, ModelSpec> {
  const out: Record<string, ModelSpec> = {};
  if (!specs) return out;
  for (const s of specs) {
    if (s?.id) out[s.id] = s;
  }
  return out;
}

export function migrateCustomProvider(p: CustomProvider): CustomProvider {
  const specs: Record<string, ModelSpec> = { ...(p.modelSpecs || {}) };
  for (const id of p.models || []) {
    if (!specs[id]) specs[id] = { id };
  }
  if (p.contextWindow) {
    const ids = new Set(p.models || []);
    if (p.model) ids.add(p.model);
    for (const id of ids) {
      const existing = specs[id] || { id };
      if (!existing.limit?.context) {
        specs[id] = mergeSpecs(existing, {
          id,
          limit: { context: p.contextWindow },
        });
      }
    }
  }
  return { ...p, modelSpecs: specs };
}

export interface SpecResolveInput {
  providerId: string;
  modelId: string;
  custom?: CustomProvider | null;
  fetched?: FetchedModelsCache | null;
}

export function resolveModelSpec(input: SpecResolveInput): ModelSpec {
  const { providerId, modelId, custom, fetched } = input;
  const empty: ModelSpec = { id: modelId || '' };
  if (!modelId) return empty;

  if (custom?.modelSpecs?.[modelId]) {
    const live = fetched?.specs?.[modelId];
    return mergeSpecs(overlayCatalog(providerId, live || { id: modelId }), custom.modelSpecs[modelId]);
  }

  const live = fetched?.specs?.[modelId];
  if (live) return overlayCatalog(providerId, live);
  const cat = catalogSpec(providerId, modelId);
  if (cat) return cat;
  return empty;
}

export function getEffectiveContextWindow(
  providerConfig: ProviderConfig,
  custom: CustomProvider | undefined,
  compactConfig: CompactConfig,
  fetched?: FetchedModelsCache | null,
): number {
  const spec = resolveModelSpec({
    providerId: providerConfig.providerId,
    modelId: providerConfig.model,
    custom: custom ?? null,
    fetched,
  });
  return (
    spec.limit?.context ||
    spec.limit?.input ||
    custom?.contextWindow ||
    providerConfig.contextWindow ||
    compactConfig.defaultContextWindow ||
    128000
  );
}

export function getEffectiveMaxOutput(spec: ModelSpec): number | undefined {
  return spec.limit?.output;
}

export function specIsImageModel(spec: ModelSpec, modelId = spec.id): boolean {
  if (spec.mode === 'image_generation') return true;
  if (spec.capabilities?.imageGeneration) return true;
  if (spec.modalities?.output?.includes('image') && spec.mode !== 'chat') return true;
  return modelId.includes('-image') || modelId.includes('imagine-image');
}

export function specSupportsTools(spec: ModelSpec, modelId = spec.id): boolean {
  if (spec.capabilities?.tools === false) return false;
  if (specIsImageModel(spec, modelId)) return false;
  if (spec.capabilities?.tools === true) return true;
  return true;
}

export function specSupportsGoogleSearch(spec: ModelSpec, modelId = spec.id): boolean {
  if (spec.capabilities?.googleSearch === false) return false;
  if (specIsImageModel(spec, modelId)) return false;
  if (spec.capabilities?.googleSearch === true) return true;
  return true;
}

export function specSupportsReasoning(spec: ModelSpec, modelId = spec.id): boolean {
  if (spec.capabilities?.reasoning === false) return false;
  if (specIsImageModel(spec, modelId)) return false;
  if (spec.capabilities?.reasoning === true) return true;
  return true;
}

/** When input modalities are unset, all composer kinds are allowed. */
export function specAllowsInputModality(spec: ModelSpec, modality: ModelModality): boolean {
  const input = spec.modalities?.input;
  if (!input || input.length === 0) return true;
  return input.includes(modality);
}

export function specAllowsComposerKind(
  spec: ModelSpec,
  kind: 'image' | 'text' | 'pdf',
): boolean {
  if (kind === 'image') {
    if (spec.capabilities?.vision === false && !specIsImageModel(spec)) return false;
    return specAllowsInputModality(spec, 'image');
  }
  if (kind === 'pdf') return specAllowsInputModality(spec, 'pdf');
  return specAllowsInputModality(spec, 'text');
}

export function firstChatModelId(
  _providerId: string,
  defaultModel: string,
  ids: string[],
  resolve: (id: string) => ModelSpec,
): string {
  const candidates = [defaultModel, ...ids].filter(Boolean);
  for (const id of candidates) {
    const spec = resolve(id);
    if (!specIsImageModel(spec, id) && spec.mode !== 'embedding') return id;
  }
  return defaultModel || ids[0] || '';
}
