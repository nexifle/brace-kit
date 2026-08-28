import type { SlideFile } from '../../types/slides.ts';
import { collectPageHtmlPaths, rebuildSiteProjection, syncSiteJson, verifySite } from '../../utils/siteVfs.ts';
import type { ArtifactCheck, ArtifactStrategy, ArtifactSyncMeta, BuiltLabelOpts } from './types.ts';

export const webArtifact: ArtifactStrategy = {
    kind: 'site',
    skillPack: 'web',
    sandboxRenderProbe: false,
    supportsReorderSlides: false,
    buildKickoffInstruction:
      'The plan is approved. Build the site now from /brief.md and /design.md. Honor the original request.',

    verify(files: SlideFile[]): ArtifactCheck {
      return verifySite(files);
    },

    deliverableCount(files: SlideFile[]): number {
      return collectPageHtmlPaths(files).length;
    },

    isBuildDeliverable(files: SlideFile[], truncated: boolean) {
      const count = collectPageHtmlPaths(files).length;
      return { ready: !truncated && count > 0, count };
    },

    sync(files: SlideFile[], meta?: ArtifactSyncMeta): SlideFile[] {
      return syncSiteJson(files, 'site', meta?.title);
    },

    verifyFailMessage(issues: string[]): string {
      return 'Site failed verification:\n' + issues.map((i) => `- ${i}`).join('\n');
    },

    builtRoundLabel(count: number, opts?: BuiltLabelOpts): string {
      const n = count;
      let label = n > 0 ? `Site built · ${n} page${n === 1 ? '' : 's'}` : 'Site built';
      if (opts?.partial) {
        label =
          n > 0
            ? `Site built (partial) · ${n} page${n === 1 ? '' : 's'}`
            : 'Site built (partial)';
      }
      if (opts?.needsReview) label += ' (needs review)';
      return label;
    },

    builtFallback(count: number): string {
      if (count > 0) return `Site built with ${count} page${count === 1 ? '' : 's'}.`;
      return 'Site built.';
    },

    updatedFallback(): string {
      return 'Site updated.';
    },

    readyActivityLabel(count: number): string {
      const n = count;
      return `Site ready — ${n} page${n === 1 ? '' : 's'}`;
    },

    projectKnowledge(files: SlideFile[]): string {
      const site = rebuildSiteProjection(files, 'site');
      const paths = files.map((f) => f.path).filter(Boolean).sort().join(', ');
      return (
        '\n\n## Project state\n' +
        `- kind: site\n` +
        `- title: ${site.title}\n` +
        `- pages: ${site.pages.length}\n` +
        `- files: ${paths || 'none'}`
      );
    },
};
