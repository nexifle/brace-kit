// ==================== Slide Creator orchestrator hook (US-024) ====================
//
// Thin React wrapper over the dependency-injected `createSlideAgent` service
// (src/services/slideOrchestrator.ts). It supplies the slideStore + main-store
// as the service's host, and the real chrome.runtime transport/abort plus the
// skill `fetch` as the runtime deps. All orchestration logic lives in the
// service so it is unit-testable without React or `chrome`.

import { useRef } from 'react';
import { useStore } from '../store/index.ts';
import { useSlideStore } from '../store/slideStore.ts';
import { createSlideAgent } from '../services/slideOrchestrator.ts';
import { shouldEnableGoogleSearch } from '../services/slideTools.ts';
import type { SlideToolOptions } from '../services/slidePhases.ts';
import { saveSlideProject, setLastActiveSlideProject } from '../utils/slideDB.ts';
import type { SlideProject, SlideFile } from '../types/slides.ts';
import type { SlideAskState } from '../store/slideStore.ts';

export function useSlideAgent() {
  const providerConfig = useStore((s) => s.providerConfig);
  const slideStore = useSlideStore();

  // A stable agent instance bound once to the store-backed host. Created lazily
  // on first render; the host reads live store state via getState(), so it never
  // goes stale across re-renders or restores.
  const agentRef = useRef<ReturnType<typeof createSlideAgent> | null>(null);
  if (!agentRef.current) {
    agentRef.current = createSlideAgent(
      {
        getActiveProject: () => useSlideStore.getState().activeProject,
        landProject: (project: SlideProject) => {
          setLastActiveSlideProject(project.id);
          saveSlideProject(project).catch(() => {});
          slideStore.setActiveProjectData(project);
        },
        setPhase: (phase) => slideStore.setPhase(phase),
        setBusy: (busy) => slideStore.setBusy(busy),
        setPendingAsk: (pendingAsk: SlideAskState | null) => slideStore.setPendingAsk(pendingAsk),
        recordAnswer: (projectId, answer) => slideStore.answerAsk(projectId, answer),
        refreshDeckFromFiles: (files: SlideFile[]) => slideStore.setActiveDeckFromVfs(files),
        markStopped: () => slideStore.markStopped(),
      },
      {
        providerConfig,
        // Spread external-tool sharing (google_search enablement + execution)
        // computed from live main-store settings so sub-agents mirror main chat.
        toolOptions: buildSlideToolOptions(),
      }
    );
  }

  return {
    createFromPrompt: agentRef.current.createFromPrompt,
    runBuild: agentRef.current.runBuild,
    sendFollowUp: agentRef.current.sendFollowUp,
    answerAsk: agentRef.current.answerAsk,
    stop: agentRef.current.stop,
  };
}

/**
 * Build the external-tool options slide sub-agent sessions share, read from the
 * live main store. `enableGoogleSearch` gates whether the plan session is even
 * offered `google_search` (US-028); `externalTool` routes any external tool call
 * through the existing background `MCP_CALL_TOOL` path that already dispatches
 * built-in tools (google_search) and MCP tools — mirroring main chat (FR-14).
 */
function buildSlideToolOptions(): SlideToolOptions {
  const state = useStore.getState();
  const enableGoogleSearch = shouldEnableGoogleSearch({
    providerId: state.providerConfig.providerId,
    format: state.providerConfig.format,
    enableGoogleSearchTool: state.enableGoogleSearchTool,
    googleSearchApiKey: state.googleSearchApiKey,
  });
  const externalTool = async ({
    name,
    args,
  }: {
    name: string;
    args: Record<string, unknown>;
  }) => {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MCP_CALL_TOOL',
        name,
        arguments: args,
      });
      return {
        content:
          result?.content?.map((c: { text?: string }) => c.text || JSON.stringify(c)).join('\n') ||
          JSON.stringify(result),
        error: typeof result?.error === 'string' ? result.error : undefined,
      };
    } catch (e) {
      return { error: `Error executing ${name}: ${(e as Error).message}` };
    }
  };
  // Only wire a caller when the tool may actually be offered, so an unconfigured
  // session surfaces a clear "not available" error rather than a noisy caller.
  const effective = enableGoogleSearch ? { enableGoogleSearch, externalTool } : {};
  return { ...effective };
}
