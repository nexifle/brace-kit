/**
 * Composer gates + copy for per-model specs (tools, reasoning, attachments).
 */

import type { AppState, ModelSpec } from '../types/index.ts';
import { resolveModelSpec, specAllowsComposerKind } from '../providers/modelSpecs.ts';
import type { ComposerAttachmentKind } from './composerAttachments.ts';

export type CapabilityAlertKind = 'tools' | 'reasoning' | 'image' | 'pdf' | 'text';

export const CAPABILITY_ALERTS: Record<
  CapabilityAlertKind,
  { title: string; description: string }
> = {
  tools: {
    title: "This model doesn't support tool calling",
    description: 'Turn tools off, or edit the model spec if that was a mistake.',
  },
  reasoning: {
    title: "This model doesn't support reasoning",
    description: 'Turn thinking off, or edit the model spec if that was a mistake.',
  },
  image: {
    title: "This model doesn't accept images",
    description: 'Remove the attachment, or edit input modalities if that was a mistake.',
  },
  pdf: {
    title: "This model doesn't accept PDFs",
    description: 'Remove the attachment, or edit input modalities if that was a mistake.',
  },
  text: {
    title: "This model doesn't accept text files",
    description: 'Remove the attachment, or edit input modalities if that was a mistake.',
  },
};

export function resolveSpecFromAppState(state: {
  providerConfig: { providerId: string; model: string };
  customProviders: AppState['customProviders'];
  fetchedModels: AppState['fetchedModels'];
}): ModelSpec {
  const providerId = state.providerConfig.providerId;
  return resolveModelSpec({
    providerId,
    modelId: state.providerConfig.model,
    custom: state.customProviders.find((p) => p.id === providerId) ?? null,
    fetched: state.fetchedModels[providerId],
  });
}

export function composerAcceptAttribute(spec: ModelSpec): string {
  const input = spec.modalities?.input;
  if (!input || input.length === 0) return 'image/*,.txt,.csv,.pdf';
  const parts: string[] = [];
  if (input.includes('image')) parts.push('image/*');
  if (input.includes('text')) parts.push('.txt,.csv,text/plain,text/csv');
  if (input.includes('pdf')) parts.push('.pdf,application/pdf');
  return parts.join(',') || 'image/*,.txt,.csv,.pdf';
}

export function attachmentKindBlocked(
  spec: ModelSpec,
  kind: ComposerAttachmentKind,
): CapabilityAlertKind | null {
  if (specAllowsComposerKind(spec, kind)) return null;
  return kind;
}
