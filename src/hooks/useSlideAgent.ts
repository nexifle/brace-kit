// ==================== Slide Creator orchestrator hook (US-024) ====================
//
// Thin React wrapper over the dependency-injected `createSlideAgent` service
// (src/services/slideOrchestrator.ts). It supplies the slideStore + main-store
// as the service's host, and the real chrome.runtime transport/abort plus the
// skill `fetch` as the runtime deps. All orchestration logic lives in the
// service so it is unit-testable without React or `chrome`.

import { useEffect, useRef } from 'react';
import { useStore } from '../store/index.ts';
import { useSlideStore } from '../store/slideStore.ts';
import { createSlideAgent } from '../services/slideOrchestrator.ts';
import type { StreamDelta } from '../services/agentSession.ts';
import { shouldEnableGoogleSearch } from '../services/slideTools.ts';
import type { SlideToolOptions } from '../services/slidePhases.ts';
import { filterMCPTools } from './tools/useTools.ts';
import { supportsFunctionCalling } from '../providers/presets.ts';
import { saveSlideProject, setLastActiveSlideProject } from '../utils/slideDB.ts';
import type { SlideProject, SlideFile } from '../types/slides.ts';
import type { MCPTool } from '../types/index.ts';
import type { SlideAskState } from '../store/slideStore.ts';

export function useSlideAgent() {
  const providerConfig = useStore((s) => s.providerConfig);
  const enableTools = useStore((s) => s.enableTools);
  const enableMCP = useStore((s) => s.enableMCP);
  const mcpServers = useStore((s) => s.mcpServers);
  const slideStore = useSlideStore();

  // The shared external-tool options for slide sub-agent sessions. Built once
  // (google_search gating + the MCP_CALL_TOOL executor); the MCP tool set is
  // refreshed by an effect below mutating `mcpTools` in place — phase runners
  // read `deps.toolOptions` at call time, so later updates take effect.
  const toolOptionsRef = useRef<SlideToolOptions | null>(null);

  // A stable agent instance bound once to the store-backed host. Created lazily
  // on first render; the host reads live store state via getState(), so it never
  // goes stale across re-renders or restores.
  const agentRef = useRef<ReturnType<typeof createSlideAgent> | null>(null);
  if (!agentRef.current) {
    toolOptionsRef.current = buildSlideToolOptions();
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
        // Streaming (US-035): paint each model-turn delta into the store so the
        // rail shows live agent text instead of waiting for the turn to finish.
        streamDelta: (delta: StreamDelta) => {
          if (delta.text) slideStore.appendStreamingText(delta.text);
          if (delta.reasoning) slideStore.appendStreamingReasoning(delta.reasoning);
        },
        clearStreaming: () => slideStore.clearStreaming(),
      },
      {
        providerConfig,
        // Spread external-tool sharing (google_search enablement + MCP execution)
        // computed from live main-store settings so sub-agents mirror main chat.
        toolOptions: toolOptionsRef.current,
        // Live function-calling check (US-032): read the CURRENT provider/model
        // from the main store so a model switch is reflected instantly, even
        // though the agent instance itself is created once.
        canFunctionCall: () => {
          const s = useStore.getState();
          const isGemini =
            s.providerConfig.providerId === 'gemini' || s.providerConfig.format === 'gemini';
          if (!isGemini) return true;
          return supportsFunctionCalling(s.providerConfig.model);
        },
      }
    );
  }

  // Keep the slide sessions' MCP tool set in sync with the main store (US-029):
  // re-fetches + filters whenever the master switches or the server list changes
  // so a session reflects the same configured MCP tools as main chat. Mutating
  // `mcpTools` on the shared options object is safe because phase runners read
  // `toolOptions` at call time.
  useEffect(() => {
    let cancelled = false;
    fetchSlideMCPTools()
      .then((tools) => {
        if (!cancelled && toolOptionsRef.current) {
          toolOptionsRef.current.mcpTools = tools;
        }
      })
      .catch(() => {
        if (!cancelled && toolOptionsRef.current) {
          toolOptionsRef.current.mcpTools = [];
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: ref is stable
  }, [enableTools, enableMCP, mcpServers]);

  return {
    createFromPrompt: agentRef.current.createFromPrompt,
    runBuild: agentRef.current.runBuild,
    sendFollowUp: agentRef.current.sendFollowUp,
    answerAsk: agentRef.current.answerAsk,
    stop: agentRef.current.stop,
    canUseFunctionCalling: agentRef.current.canUseFunctionCalling,
  };
}

/**
 * Fetch the MCP tool schemas slide sub-agent sessions should offer, filtered
 * exactly like main chat (respects the `enableTools`/`enableMCP` master
 * switches and the per-server `disabledTools` list via `filterMCPTools`). Uses
 * the same `MCP_LIST_TOOLS` background path as main chat. Returns [] when MCP /
 * tools are disabled or nothing is connected.
 */
async function fetchSlideMCPTools(): Promise<MCPTool[]> {
  const state = useStore.getState();
  if (state.enableTools === false || state.enableMCP === false) return [];
  const enabledServers = state.mcpServers.filter((s) => s.enabled !== false);
  const res = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
  return filterMCPTools(res?.tools ?? [], enabledServers);
}

/**
 * Build the base external-tool options slide sub-agent sessions share, read from
 * the live main store. `enableGoogleSearch` gates whether a plan session is even
 * offered `google_search` (US-028); `externalTool` routes any external tool call
 * through the existing background `MCP_CALL_TOOL` path that already dispatches
 * built-in tools (google_search) and MCP tools — mirroring main chat (FR-14).
 *
 * The executor is wired whenever google_search OR MCP may be offered, so an
 * MCP-only configuration still executes external tools (US-029). An unconfigured
 * session omits it and surfaces a clear "not available" error instead of a noisy
 * caller.
 */
function buildSlideToolOptions(): SlideToolOptions {
  const state = useStore.getState();
  const enableGoogleSearch = shouldEnableGoogleSearch({
    providerId: state.providerConfig.providerId,
    format: state.providerConfig.format,
    enableGoogleSearchTool: state.enableGoogleSearchTool,
    googleSearchApiKey: state.googleSearchApiKey,
  });
  const mcpEnabled = state.enableTools !== false && state.enableMCP !== false;

  const options: SlideToolOptions = {};
  if (enableGoogleSearch) options.enableGoogleSearch = true;

  if (enableGoogleSearch || mcpEnabled) {
    options.externalTool = async ({
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
  }
  return options;
}
