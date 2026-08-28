import type { BuilderKind } from '../../types/slides.ts';
import { normalizeBuilderKind } from '../../types/slides.ts';
import type { ArtifactStrategy } from './types.ts';
import { slidesArtifact } from './slidesArtifact.ts';
import { webArtifact } from './webArtifact.ts';

export type { ArtifactCheck, ArtifactStrategy, ArtifactSyncMeta } from './types.ts';
export { slidesArtifact } from './slidesArtifact.ts';
export { webArtifact } from './webArtifact.ts';

/** The only kind switch. Orchestrator and phases must not branch on kind. */
export function artifactFor(kind: BuilderKind | undefined): ArtifactStrategy {
  return normalizeBuilderKind(kind) === 'site' ? webArtifact : slidesArtifact;
}
