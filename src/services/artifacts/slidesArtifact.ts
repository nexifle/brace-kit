import type { SlideFile } from '../../types/slides.ts';
import {
  deckSlideCount,
  formatDeckJsonIssues,
  getSlideFile,
  hasHardDeckJsonErrors,
  rebuildDeckProjection,
  syncDeckJson,
  validateDeckJson,
  verifyDeck,
} from '../../utils/slideVfs.ts';
import type { ArtifactCheck, ArtifactStrategy, ArtifactSyncMeta, BuiltLabelOpts } from './types.ts';

export const slidesArtifact: ArtifactStrategy = {
  kind: 'slides',
  skillPack: 'slides',
  sandboxRenderProbe: true,
  supportsReorderSlides: true,
  buildKickoffInstruction:
    'The plan is approved. Build the deck now from /brief.md and /design.md. Honor the original request.',

  verify(files: SlideFile[]): ArtifactCheck {
    return verifyDeck(files);
  },

  deliverableCount(files: SlideFile[]): number {
    return deckSlideCount(files);
  },

  isBuildDeliverable(files: SlideFile[], truncated: boolean) {
    const count = deckSlideCount(files);
    const v = validateDeckJson(files);
    const hasDeck = !!getSlideFile(files, '/deck.json');
    const contractError =
      !truncated && hasDeck && hasHardDeckJsonErrors(v)
        ? formatDeckJsonIssues(v.issues)
        : undefined;
    return {
      ready: !truncated && count > 0 && !contractError,
      count,
      ...(contractError ? { error: contractError } : {}),
    };
  },

  sync(files: SlideFile[], meta?: ArtifactSyncMeta): SlideFile[] {
    return syncDeckJson(files, { title: meta?.title, canvas: meta?.canvas });
  },

  verifyFailMessage(issues: string[]): string {
    return 'Deck failed verification:\n' + issues.map((i) => `- ${i}`).join('\n');
  },

  builtRoundLabel(count: number, opts?: BuiltLabelOpts): string {
    const n = count;
    let label = n > 0 ? `Deck built · ${n} slide${n === 1 ? '' : 's'}` : 'Deck built';
    if (opts?.partial) {
      label =
        n > 0
          ? `Deck built (partial) · ${n} slide${n === 1 ? '' : 's'}`
          : 'Deck built (partial)';
    }
    if (opts?.needsReview) label += ' (needs review)';
    return label;
  },

  builtFallback(count: number): string {
    if (count > 0) return `Deck built with ${count} slide${count === 1 ? '' : 's'}.`;
    return 'Deck built.';
  },

  updatedFallback(): string {
    return 'Deck updated.';
  },

  readyActivityLabel(count: number): string {
    const n = count;
    return `Deck ready — ${n} slide${n === 1 ? '' : 's'}`;
  },

  projectKnowledge(files: SlideFile[]): string {
    const deck = rebuildDeckProjection(files);
    const paths = files.map((f) => f.path).filter(Boolean).sort().join(', ');
    return (
      '\n\n## Project state\n' +
      `- kind: slides\n` +
      `- canvas: ${deck.canvas ?? 'unset'}\n` +
      `- slide count: ${deck.slideOrder.length}\n` +
      `- files: ${paths || 'none'}`
    );
  },
};
