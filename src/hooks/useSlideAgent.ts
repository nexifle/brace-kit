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
import { shouldEnableGoogleSearch, shouldEnableGrokWebSearch } from '../services/slideTools.ts';
import type { SlideToolOptions } from '../services/slidePhases.ts';
import { filterMCPTools } from './tools/useTools.ts';
import { isGeminiImageModel, isXAIImageModel, supportsFunctionCalling } from '../providers/presets.ts';
import { buildChatOptions, chatOptionsStateFromStore } from '../utils/chatOptions.ts';
import { saveSlideProject, setLastActiveSlideProject } from '../utils/slideDB.ts';
import type { SlideProject, SlideFile } from '../types/slides.ts';
import type { SlidePendingAttachment } from '../utils/slideUploads.ts';
import { SLIDE_CANVAS_PRESETS } from '../types/slides.ts';
import {
  composeSlideHtml,
  projectDeckSlides,
  rebuildDeckProjection,
  syncDeckJson,
} from '../utils/slideVfs.ts';
import type { SandboxParentToSandbox, SandboxToParent } from '../utils/slideRendererProtocol.ts';
import type { MCPTool } from '../types/index.ts';
import { TITLE_GENERATION_SYSTEM_PROMPT } from '../types/index.ts';
import type { SlideAskState } from '../store/slideStore.ts';

export function useSlideAgent() {
  // providerConfig is read live via getState() inside the stable agent — do not
  // capture the React subscription snapshot into deps (it freezes first render).
  const enableTools = useStore((s) => s.enableTools);
  const enableMCP = useStore((s) => s.enableMCP);
  const mcpServers = useStore((s) => s.mcpServers);
  const providerConfig = useStore((s) => s.providerConfig);
  const enableGoogleSearchTool = useStore((s) => s.enableGoogleSearchTool);
  const googleSearchApiKey = useStore((s) => s.googleSearchApiKey);
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
        // Activity-feed sink (US-036): emit tool/file/ask rows as they dispatch.
        pushActivity: (event) => slideStore.pushActivity(event),
        patchActivity: (id, partial) => slideStore.patchActivity(id, partial),
        getActivity: () => useSlideStore.getState().activity,
        recordRound: (files, label) => slideStore.commitRound(files, label),
        verifyRender: (files) => probeRenderSlides(files),
      },
      {
        // Live provider/model/key from main store — same pattern as canFunctionCall
        // and getChatOptions. A static providerConfig here would freeze the first
        // render's selection for the entire agent lifetime (custom provider bug).
        getProviderConfig: () => useStore.getState().providerConfig,
        // External-tool sharing (google_search / Grok web_search / MCP).
        // Flags are recomputed at each phase request so a provider switch is
        // reflected — same live-read pattern as getProviderConfig.
        toolOptions: toolOptionsRef.current,
        getToolOptions: () => {
          if (toolOptionsRef.current) {
            refreshSlideToolOptions(toolOptionsRef.current);
          }
          return toolOptionsRef.current ?? undefined;
        },
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
        // Same enableReasoning / reasoningLevel / modelParameters as main chat.
        getChatOptions: () =>
          buildChatOptions(chatOptionsStateFromStore(() => useStore.getState()), {
            // Phase turns always stream (Amendment A.4); don't inherit the
            // main-chat streaming toggle as a hard off switch.
            stream: true,
          }),
        // Auto-title the project after its first plan completes (gated inside
        // the orchestrator on `!autoTitled`). Fire-and-forget.
        generateTitle: (projectId) => {
          void generateSlideProjectTitle(projectId);
        },


      }

    );
  }

  // Stable reference — after the lazy init above TS narrows agentRef.current to
  // non-null here; capture it so closures (the wrapped createFromPrompt) don't
  // re-open the nullability.
  const agent = agentRef.current;

  // Keep the slide sessions' MCP tool set + search-tool enablement in sync with
  // the main store (US-029): re-fetches + filters MCP tools whenever the master
  // switches or the server list changes, and recomputes google_search / Grok
  // web_search flags so a provider switch after init is reflected. Mutating the
  // shared options object in place is safe because phase runners read
  // `toolOptions` at call time.
  useEffect(() => {
    let cancelled = false;
    if (toolOptionsRef.current) {
      refreshSlideToolOptions(toolOptionsRef.current);
    }
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
  }, [enableTools, enableMCP, mcpServers, providerConfig, enableGoogleSearchTool, googleSearchApiKey]);

  return {
    createFromPrompt: (prompt: string, attachments?: SlidePendingAttachment[]) =>
      agent.createFromPrompt(
        prompt,
        useSlideStore.getState().defaultMode,
        attachments,
      ),
    runBuild: agent.runBuild,
    sendFollowUp: agent.sendFollowUp,
    retryFailedPhase: agent.retryFailedPhase,
    answerAsk: agent.answerAsk,
    stop: agent.stop,
    canUseFunctionCalling: agent.canUseFunctionCalling,
  };
}

/**
 * Auto-title a slide project once its first plan completes, replacing the
 * provisional prompt-derived title with a short LLM title from the deck prompt
 * (mirrors chat's `generateConversationTitle`). Gated on `!project.autoTitled`
 * so re-plans never re-title. Fire-and-forget from the orchestrator; the active
 * project is re-read right before writing so a concurrently-landed build/edit
 * round's files are not clobbered by a stale snapshot.
 */
export async function generateSlideProjectTitle(projectId: string): Promise<void> {
  const project = useSlideStore.getState().activeProject;
  if (!project || project.id !== projectId || project.autoTitled) return;

  // Title messages: only user messages, first 2 + last 1 (deduplicated), 300
  // chars each — same heuristic as chat's auto-title.
  const allUserMessages = project.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content.trim().slice(0, 300))
    .filter((c) => c.length > 0);
  const firstTwo = allUserMessages.slice(0, 2);
  const lastOne = allUserMessages.length > 2 ? [allUserMessages[allUserMessages.length - 1]] : [];
  const deduped = [...firstTwo, ...lastOne.filter((c) => !firstTwo.includes(c))];
  if (deduped.length === 0) return;

  try {
    const providerConfig = useStore.getState().providerConfig;
    // Image-generation models can't produce a text title. The function-calling
    // gate lets non-Gemini image models through (only Gemini is checked at the
    // gate), so fall back to a text-capable model from the same provider —
    // mirroring chat's generateConversationTitle.
    const currentModel = providerConfig.model || '';
    const titleProviderConfig =
      isGeminiImageModel(currentModel)
        ? { ...providerConfig, model: 'gemini-3.6-flash' }
        : providerConfig.providerId === 'xai' && isXAIImageModel(currentModel)
          ? { ...providerConfig, model: 'grok-4.5' }
          : providerConfig;

    const response = await chrome.runtime.sendMessage({
      type: 'TITLE_GENERATE',
      messages: [
        { role: 'system', content: TITLE_GENERATION_SYSTEM_PROMPT },
        ...deduped.map((content) => ({ role: 'user', content })),
      ],
      providerConfig: titleProviderConfig,
    });

    if (!response?.title || response.error) return;
    const title = response.title.trim().replace(/^["']|["']$/g, '').slice(0, 50);

    // Re-read the active project at write time so we don't clobber a build/edit
    // round that landed while the title request was in flight.
    const current = useSlideStore.getState().activeProject;
    if (!current || current.id !== projectId || current.autoTitled) return;
    const files = syncDeckJson(current.files, { title });
    const next = { ...current, title, autoTitled: true, files };
    setLastActiveSlideProject(next.id);
    saveSlideProject(next).catch(() => {});
    useSlideStore.getState().setActiveProjectData(next);
  } catch (e) {
    console.error('[generateSlideProjectTitle] Failed:', e);
  }
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
 * Best-effort render probe (Phase 1 verification loop): mount a hidden sandbox
 * iframe, wait for `ready`, render each deck slide via {@link composeSlideHtml}
 * at the deck's canvas resolution, and return the ids whose `render` does not
 * ack within a per-slide timeout. On ANY infrastructure failure (sandbox not
 * ready, timeout, throw) it resolves `[]` — the probe is best-effort and never
 * a hard blocker; the deterministic VFS `verifyDeck` is the authoritative
 * corrective trigger.
 */
async function probeRenderSlides(files: SlideFile[]): Promise<string[]> {
  const deck = rebuildDeckProjection(files);
  const slides = projectDeckSlides(files, deck);
  if (slides.length === 0 || !deck.canvas) return [];
  const { width, height } = SLIDE_CANVAS_PRESETS[deck.canvas];

  const iframe = document.createElement('iframe');
  iframe.style.cssText =
    'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;visibility:hidden;pointer-events:none;';
  iframe.setAttribute('sandbox', 'allow-scripts');
  iframe.src = chrome.runtime.getURL('slide-renderer.html');
  document.body.appendChild(iframe);

  const failed: string[] = [];
  try {
    const win = iframe.contentWindow;
    if (!win) return [];

    // Wait for the sandbox `ready` (or a short hard timeout). Unavailable
    // sandbox -> skip the probe entirely (never flag every slide as failed).
    const ready = new Promise<void>((resolve) => {
      const onReady = (event: MessageEvent) => {
        const msg = event.data as Partial<SandboxToParent>;
        if (event.source === win && msg?.fromSandbox === true && msg.type === 'ready') {
          window.removeEventListener('message', onReady);
          resolve();
        }
      };
      window.addEventListener('message', onReady);
    });
    let sandboxReady = false;
    try {
      await Promise.race([
        ready,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('sandbox not ready')), 6000),
        ),
      ]);
      sandboxReady = true;
    } catch {
      // fallthrough
    }
    if (!sandboxReady) return [];

    let seq = 0;
    const requestId = () => `slide-probe-${Date.now()}-${++seq}`;
    const render = (html: string): Promise<void> =>
      new Promise((resolve, reject) => {
        const id = requestId();
        const onReply = (event: MessageEvent) => {
          const msg = event.data as Partial<SandboxToParent>;
          if (event.source !== win || msg?.fromSandbox !== true) return;
          if (msg.type === 'rendered' && msg.requestId === id) {
            clearTimeout(timer);
            window.removeEventListener('message', onReply);
            resolve();
          }
        };
        const timer = setTimeout(() => {
          window.removeEventListener('message', onReply);
          reject(new Error('render timed out'));
        }, 5000);
        window.addEventListener('message', onReply);
        win.postMessage(
          { type: 'render', html, width, height, requestId: id } as SandboxParentToSandbox,
          '*',
        );
      });

    for (const slide of slides) {
      try {
        await render(composeSlideHtml(files, slide, deck));
      } catch {
        failed.push(slide.id);
      }
    }
  } catch {
    return [];
  } finally {
    iframe.remove();
  }
  return failed;
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
  const enableGrokWebSearch =
    state.enableTools !== false && shouldEnableGrokWebSearch(state.providerConfig);
  const mcpEnabled = state.enableTools !== false && state.enableMCP !== false;

  const options: SlideToolOptions = {};
  if (enableGoogleSearch) options.enableGoogleSearch = true;
  if (enableGrokWebSearch) options.enableGrokWebSearch = true;

  if (enableGoogleSearch || enableGrokWebSearch || mcpEnabled) {
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

/**
 * Recompute the google_search / web_search (Grok) enablement flags on the shared
 * `toolOptions` object. Unlike `getProviderConfig` / `getChatOptions` (which read
 * live state inside closures), `toolOptions` is built once at init and only its
 * `mcpTools` field is refreshed by an effect. Without re-evaluating these flags,
 * a provider switch after init would leave the search tools stale (e.g. starting
 * on OpenAI then switching to Grok would never expose `web_search`).
 */
function refreshSlideToolOptions(options: SlideToolOptions): void {
  const state = useStore.getState();
  const enableGoogleSearch = shouldEnableGoogleSearch({
    providerId: state.providerConfig.providerId,
    format: state.providerConfig.format,
    enableGoogleSearchTool: state.enableGoogleSearchTool,
    googleSearchApiKey: state.googleSearchApiKey,
  });
  const enableGrokWebSearch =
    state.enableTools !== false && shouldEnableGrokWebSearch(state.providerConfig);

  // Ensure the externalTool executor survives: if neither search nor MCP is
  // active the executor is pointless, but if one becomes active we (re)create
  // it. The executor itself is a stable chrome.runtime dispatch — safe to reuse.
  const mcpEnabled = state.enableTools !== false && state.enableMCP !== false;
  const needsExecutor = enableGoogleSearch || enableGrokWebSearch || mcpEnabled;
  if (needsExecutor && !options.externalTool) {
    options.externalTool = async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
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

  options.enableGoogleSearch = enableGoogleSearch || undefined;
  options.enableGrokWebSearch = enableGrokWebSearch || undefined;
}
