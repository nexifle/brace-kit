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
import { saveSlideProject, setLastActiveSlideProject } from '../utils/slideDB.ts';
import type { SlideProject, SlideFile } from '../types/slides.ts';

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
        setPendingAsk: (pendingAsk) => slideStore.setPendingAsk(pendingAsk),
        recordAnswer: (projectId, answer) => slideStore.answerAsk(projectId, answer),
        refreshDeckFromFiles: (files: SlideFile[]) => slideStore.setActiveDeckFromVfs(files),
      },
      { providerConfig }
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
