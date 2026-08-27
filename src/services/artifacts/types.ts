import type { BuilderKind, SlideCanvas, SlideFile } from '../../types/slides.ts';
import type { BuilderSkillPack } from '../slideSkills.ts';

export type ArtifactCheck = { ok: boolean; issues: string[] };

export interface ArtifactSyncMeta {
  title?: string;
  canvas?: SlideCanvas;
}

export interface BuiltLabelOpts {
  partial?: boolean;
  needsReview?: boolean;
}

/**
 * Kind-owned artifact policy. The builder agent loop depends on this
 * abstraction — never on deck.json or site.json directly.
 */
export interface ArtifactStrategy {
  readonly kind: BuilderKind;
  readonly skillPack: BuilderSkillPack;
  /** Slide PNG sandbox only. Web uses document preview. */
  readonly sandboxRenderProbe: boolean;
  readonly supportsReorderSlides: boolean;
  verify(files: SlideFile[]): ArtifactCheck;
  sync(files: SlideFile[], meta?: ArtifactSyncMeta): SlideFile[];
  /** Projectable units (slides or pages). */
  deliverableCount(files: SlideFile[]): number;
  isBuildDeliverable(
    files: SlideFile[],
    truncated: boolean,
  ): { ready: boolean; count: number; error?: string };
  verifyFailMessage(issues: string[]): string;
  builtRoundLabel(count: number, opts?: BuiltLabelOpts): string;
  builtFallback(count: number): string;
  updatedFallback(): string;
  readyActivityLabel(count: number): string;
  projectKnowledge(files: SlideFile[]): string;
  /**
   * User turn that starts the build session after plan approval.
   * Orchestrator prepends the original request; this is only the execute bridge.
   */
  readonly buildKickoffInstruction: string;
}
