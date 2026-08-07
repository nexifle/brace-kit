// ==================== Slide Creator orchestrator (US-024) ====================
//
// The thin "main/orchestrator" (PRD FR-4) that turns a user's deck prompt into
// a persisted SlideProject and drives the three isolated phase runners
// (plan/build/edit) without merging sub-session tool chatter into the main
// transcript. It is the shared logic behind the `useSlideAgent` hook, extracted
// here as a dependency-injected service so it is unit-testable without React or
// `chrome` (inject a test transport/fetcher/store).
//
// The main transcript stores user messages, the model's final text response
// (assistant), short system narrations (stop), ask cards (via pendingAsk), and
// errors — matching PRD US-012. Sub-session tool calls stay in the activity feed.

import type {
  APIMessage,
  ProviderConfig,
} from '../types/index.ts';
import type { SlideMainMessage, SlideProject, SlideCanvas, SlideFile } from '../types/slides.ts';

import {
  runPlanPhase,
  resumePlanPhase,
  runBuildPhase,
  runEditPhase,
  hasValidPlanFiles,
  PHASE_NO_DELIVERABLE,
  maxRoundsNoDeliverable,
  type PlanPhaseResult,
  type SlideActivitySink,
  type SlideToolOptions,
} from './slidePhases.ts';
import { loadSlideSkill, type SlidePhaseKey, type SlideSkillFetcher } from './slideSkills.ts';
import type { AgentTransport, AgentAbortFn, StreamDelta } from './agentSession.ts';
import { isSlideCanvas } from '../utils/slideVfs.ts';
import { supportsFunctionCalling as geminiSupportsFunctionCalling } from '../providers/presets.ts';
import type { SlideAskState } from '../store/slideStore.ts';

/** Clear message narrated when the active model can't drive the slide tool loop. */
export const SLIDE_FUNCTION_CALLING_BLOCKED =
  'The selected model does not support function calling, which Slide Creator needs to plan, build, and edit decks. Switch to a model that supports tools (e.g. an OpenAI/Anthropic-compatible or non-image Gemini model), then try again.';

/** Derive a short provisional title from the user's deck prompt. */
export function deriveSlideTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, ' ').slice(0, 60).trim();
  return cleaned.length > 0 ? cleaned : 'Untitled deck';
}

/**
 * Build isolated plan-session user turns from the main transcript.
 * Retries must include the original deck prompt — never only "continue"/Retry.
 */
export function buildPlanSessionMessages(
  project: SlideProject,
  extraUser?: string,
): APIMessage[] {
  const out: APIMessage[] = [];
  for (const m of project.messages) {
    if (m.role !== 'user') continue;
    const content = m.content.trim();
    if (!content) continue;
    out.push({ role: 'user', content });
  }
  const extra = extraUser?.trim();
  if (extra) {
    const last = out[out.length - 1];
    if (!last || last.content !== extra) {
      out.push({ role: 'user', content: extra });
    }
  }
  if (out.length === 0) {
    out.push({
      role: 'user',
      content: 'Continue planning this deck from the current workspace.',
    });
  }
  return out;
}

function makeMsg(role: SlideMainMessage['role'], content: string): SlideMainMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    createdAt: Date.now(),
  };
}

/** Prefer the model's final text; fall back only when the turn produced none. */
function assistantOrFallback(
  content: string | undefined,
  fallback: string,
): SlideMainMessage {
  const text = content?.trim();
  return makeMsg(text ? 'assistant' : 'summary', text || fallback);
}


/** Persist + store mutations the orchestrator needs (implemented by the hook). */
export interface SlideAgentHost {
  /** Load the currently active slide project (for build/edit/follow-up). */
  getActiveProject: () => SlideProject | null;
  /** Set the active project in the store + persist it. */
  landProject: (project: SlideProject) => void;
  /** Push short store+persisted state transitions. */
  setPhase: (phase: SlideProject['phase']) => void;
  setBusy: (busy: boolean) => void;
  setPendingAsk: (pendingAsk: SlideAskState | null) => void;
  /** Record the user's answer in the main transcript + clear pending ask. */
  recordAnswer: (projectId: string, answer: string) => void;
  /** Refresh the deck preview from a fresh VFS (incremental during a phase). */
  refreshDeckFromFiles: (files: SlideFile[]) => void;
  /** Mark the workspace as user-stopped (clear busy + pending ask immediately). */
  markStopped: () => void;
  /** Feed a streaming delta (text/reasoning) for the active turn to the store (US-035). */
  streamDelta?: (delta: StreamDelta) => void;
  /** Clear the streaming buffers (turn commit / stop / error). */
  clearStreaming?: () => void;
  /** Append an activity-feed row (Amendment A.6). */
  pushActivity?: (event: import('../types/slides.ts').SlideActivityEvent) => void;
  /** In-place patch of an activity row by id (e.g. tool finish). */
  patchActivity?: (id: string, partial: Partial<import('../types/slides.ts').SlideActivityEvent>) => void;
  /** Read the live activity feed (for Continue routing after max-round stops). */
  getActivity?: () => import('../types/slides.ts').SlideActivityEvent[];
  /** Checkpoint a completed build/edit round's landed VFS (undo/redo history). */
  recordRound?: (files: SlideFile[], label: string) => void;
}

/** Runtime/network dependencies (injected for tests). */
export interface SlideAgentDeps {
  /**
   * Static provider snapshot (tests / simple callers). Prefer `getProviderConfig`
   * so a model/provider switch mid-session is reflected on the next phase turn.
   */
  providerConfig?: ProviderConfig;
  /**
   * Live provider/model/key at request time. Hook wires this to the main store
   * so the stable agent instance never freezes the first-render selection.
   * Wins over the static `providerConfig` field when both are set.
   */
  getProviderConfig?: () => ProviderConfig;
  /** CHAT_REQUEST transport; defaults to chrome.runtime inside the hook. */
  transport?: AgentTransport;
  /** Abort in-flight request; defaults to STOP_STREAM inside the hook. */
  abortRequest?: AgentAbortFn;
  /** Skill-file fetcher; defaults to fetch on chrome.runtime.getURL. */
  skillFetcher?: SlideSkillFetcher;
  maxRounds?: number;
  /** External tool (google_search / MCP) sharing for sub-agent sessions (US-028/029). */
  toolOptions?: SlideToolOptions;
  /**
   * Whether the active model can drive the tool loop (US-032). Defaults to the
   * pure provider check (`supportsFunctionCalling`); inject a live store-backed
   * checker from the hook so it reflects the current model instantly.
   */
  canFunctionCall?: () => boolean;
  /**
   * Live CHAT_REQUEST options (enableReasoning / reasoningLevel / …).
   * Prefer a getter so the main-store toggle is read at request time.
   * Defaults to `{}` (reasoning follows chat.service default: allowed).
   */
  getChatOptions?: () => Record<string, unknown> | object;

}


/** Cross-call state for the orchestrator's live sub-agent sessions. */
interface AgentRunState {
  running: boolean;
  paused: PlanPhaseResult['paused'] | null;
  skills: Partial<Record<SlidePhaseKey, string>>;
  abort: AbortController | null;
}

export function createSlideAgent(
  host: SlideAgentHost,
  deps: SlideAgentDeps
) {
  const state: AgentRunState = {
    running: false,
    paused: null,
    skills: {},
    abort: null,
  };

  /** Live provider/model/key — never freeze the first-render snapshot. */
  function providerConfig(): ProviderConfig {
    const live = deps.getProviderConfig?.();
    if (live) return live;
    if (deps.providerConfig) return deps.providerConfig;
    throw new Error('SlideAgentDeps requires getProviderConfig or providerConfig');
  }

  /** Whether the active model can drive the tool loop (US-032). */
  function canUseFunctionCalling(): boolean {
    if (deps.canFunctionCall) return deps.canFunctionCall();
    const pc = providerConfig();
    const isGemini = pc.providerId === 'gemini' || pc.format === 'gemini';
    if (!isGemini) return true;
    return geminiSupportsFunctionCalling(pc.model);
  }

  /** Feed a streaming turn delta to the store (US-035). */
  const streamDelta = (delta: StreamDelta) => host.streamDelta?.(delta);

  /** Checkpoint a completed build/edit round's landed VFS (undo/redo history). */
  const recordRound = (files: SlideFile[], label: string) =>
    host.recordRound?.(files, label);

  /** Clear any stale streaming buffers before a fresh turn/phase. */
  const prepareStream = () => host.clearStreaming?.();
  /** Live chat options (reasoning level, etc.) — same source as main chat. */
  const chatOptions = (): Record<string, unknown> => {
    const opts = deps.getChatOptions?.() ?? {};
    return opts as Record<string, unknown>;
  };



  /**
   * Activity-feed sink forwarded to phase runners (Amendment A.6). Builds a
   * push/patch sink only when the host exposes both hooks; plain/test callers
   * (no UI store) get `undefined` and the runners simply skip emission.
   */
  const activitySink = (): SlideActivitySink | undefined =>
    host.pushActivity && host.patchActivity
      ? { push: host.pushActivity, patch: host.patchActivity }
      : undefined;

  /** Land a clear error narration + error phase on a project, WITHOUT starting a phase. */
  function blockPhase(project: SlideProject): boolean {
    if (canUseFunctionCalling()) return false;
    appendMessage(
      { ...project, phase: 'error', pendingAsk: undefined, updatedAt: Date.now() },
      makeMsg('error', SLIDE_FUNCTION_CALLING_BLOCKED)
    );
    host.setPhase('error');
    return true;
  }

  async function skill(phase: SlidePhaseKey): Promise<string> {
    if (state.skills[phase]) return state.skills[phase] as string;
    const text = await loadSlideSkill(phase, {
      ...(deps.skillFetcher ? { fetcher: deps.skillFetcher } : {}),
    });
    state.skills[phase] = text;
    return text;
  }

  function appendMessage(project: SlideProject, msg: SlideMainMessage): SlideProject {
    const next = { ...project, messages: [...project.messages, msg], updatedAt: Date.now() };
    host.landProject(next);
    return next;
  }

  /**
   * No-deliverable terminal (`status: 'done'`).
   * Error line is ALWAYS the shared PHASE_NO_DELIVERABLE copy (matches activity).
   * Model prose is optional assistant narration — never the error reason.
   */
  function landNoDeliverable(
    base: SlideProject,
    files: SlideFile[],
    content: string | undefined,
    phaseKey: keyof typeof PHASE_NO_DELIVERABLE,
    projectPhase: SlideProject['phase'],
  ): void {
    let next: SlideProject = {
      ...base,
      files,
      phase: projectPhase,
      pendingAsk: undefined,
      updatedAt: Date.now(),
    };
    host.landProject(next);
    host.setPhase(projectPhase);
    host.setPendingAsk(null);
    const narration = content?.trim();
    if (narration) {
      next = appendMessage(next, makeMsg('assistant', narration));
    }
    appendMessage(next, makeMsg('error', PHASE_NO_DELIVERABLE[phaseKey]));
  }

  /** Reflect a plan-phase result into the store + transcript. */
  async function runPlan(project: SlideProject, prompt?: string): Promise<void> {
    const systemPrompt = await skill('plan');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    host.setPhase('plan');
    prepareStream();
    host.setBusy(true);

    const result = await runPlanPhase({
      systemPrompt,
      // Prefer full transcript user turns so Retry / "continue" still see the
      // original deck brief — not an empty session with only the kickoff word.
      messages: buildPlanSessionMessages(project, prompt),
      providerConfig: providerConfig(),
      chatOptions: chatOptions(),
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onDelta: streamDelta,
      onRoundStart: prepareStream,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
      onActivity: activitySink(),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'waiting_user' && result.pendingAsk) {
      state.paused = result.paused ?? null;
      host.clearStreaming?.();
      const next: SlideProject = {
        ...project,
        files: result.files,
        pendingAsk: result.pendingAsk,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPendingAsk({ ...result.pendingAsk, projectId: project.id });
      return;
    }

    if (result.status === 'plan_ready') {
      state.paused = null;
      const canvas = pickCanvas(project.canvas, result.canvasChoice);
      const next: SlideProject = {
        ...project,
        files: result.files,
        phase: 'plan_ready',
        canvas,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('plan_ready');
      appendMessage(next, assistantOrFallback(result.content, 'Plan ready — review the brief and design, then build.'));
      return;
    }

    if (result.status === 'done') {
      landNoDeliverable(project, result.files, result.content, 'plan', 'plan');
      return;
    }

    if (result.status === 'error') {
      const next: SlideProject = { ...project, files: result.files, phase: 'error', updatedAt: Date.now() };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Planning failed.'));
    }

    if (result.status === 'cancelled') {
      // Keep partial files (stop() already narrated + cleared busy). Land on the
      // FRESH active project so the "Generation stopped" message survives, and
      // persist the partial VFS so a reload returns to the same stopped state.
      const current = host.getActiveProject() ?? project;
      host.landProject({
        ...current,
        files: result.files,
        stopped: true,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      });
    }
  }

  /** Create a new project and start the plan phase. */
  async function createFromPrompt(prompt: string): Promise<void> {
    const text = prompt.trim();
    if (!text) return;
    const now = Date.now();
    const project: SlideProject = {
      id: `sp_${now}_${Math.random().toString(36).slice(2, 7)}`,
      title: deriveSlideTitle(text),
      createdAt: now,
      updatedAt: now,
      phase: 'plan',
      canvas: null,

      messages: [makeMsg('user', text)],
      files: [],
    };
    host.landProject(project);
    if (blockPhase(project)) return;
    await runPlan(project, text);
  }

  /** Resume a plan session that suspended on an `ask`. */
  async function answerAsk(projectId: string, answer: string): Promise<void> {
    const paused = state.paused;
    const project = host.getActiveProject();
    if (!paused || !project || project.id !== projectId) {
      // The answer was already recorded as a transcript entry; nothing to resume.
      return;
    }

    host.recordAnswer(projectId, answer);
    if (blockPhase(project)) return;

    const systemPrompt = await skill('plan');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    prepareStream();
    host.setBusy(true);

    const result = await resumePlanPhase(
      {
        systemPrompt,
        messages: [],
        providerConfig: providerConfig(),
        chatOptions: chatOptions(),
        files: project.files,
        signal: abort.signal,
        maxRounds: deps.maxRounds,
        transport: deps.transport,
        abortRequest: deps.abortRequest,
        toolOptions: deps.toolOptions,
        onDelta: streamDelta,
        onRoundStart: prepareStream,
        onFilesChange: (files) => host.refreshDeckFromFiles(files),
        onActivity: activitySink(),
      },
      paused,
      answer
    );

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'waiting_user' && result.pendingAsk) {
      state.paused = result.paused ?? null;
      host.clearStreaming?.();
      const next: SlideProject = {
        ...project,
        files: result.files,
        pendingAsk: result.pendingAsk,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPendingAsk({ ...result.pendingAsk, projectId: project.id });
      return;
    }

    if (result.status === 'plan_ready') {
      state.paused = null;
      host.setPendingAsk(null);
      const canvas = pickCanvas(project.canvas, result.canvasChoice);
      const next: SlideProject = {
        ...project,
        files: result.files,
        phase: 'plan_ready',
        canvas,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('plan_ready');
      appendMessage(
        next,
        assistantOrFallback(
          result.content,
          'Plan ready — review the brief and design, then build.',
        ),
      );
      return;
    }

    if (result.status === 'done') {
      state.paused = null;
      landNoDeliverable(project, result.files, result.content, 'plan', 'plan');
      return;
    }

    if (result.status === 'error') {
      state.paused = null;
      host.setPendingAsk(null);
      const next: SlideProject = {
        ...project,
        files: result.files,
        phase: 'error',
        pendingAsk: undefined,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Planning failed.'));
      return;
    }

    if (result.status === 'cancelled') {
      // Keep partial files from the resumed plan session.
      const current = host.getActiveProject() ?? project;
      host.landProject({
        ...current,
        files: result.files,
        stopped: true,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      });
    }
  }

  /** Run the build phase against the approved plan docs. */
  async function runBuild(): Promise<void> {
    const project = host.getActiveProject();
    if (!project || state.running) return;
    if (blockPhase(project)) return;
    if (!hasValidPlanFiles(project.files)) return;

    const systemPrompt = await skill('build');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    host.setPhase('build');
    prepareStream();
    host.setBusy(true);

    const result = await runBuildPhase({
      systemPrompt,
      messages: [{ role: 'user', content: 'Build the deck from the approved brief and design.' }],
      providerConfig: providerConfig(),
      chatOptions: chatOptions(),
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onDelta: streamDelta,
      onRoundStart: prepareStream,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
      onActivity: activitySink(),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'ready') {
      const next: SlideProject = {
        ...project,
        files: result.files,
        phase: 'ready',
        pendingAsk: undefined,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('ready');
      // slideCount comes from the same mapBuildResult projection as the activity feed.
      const slides = result.slideCount ?? 0;
      recordRound(
        result.files,
        slides > 0 ? `Deck built · ${slides} slide${slides === 1 ? '' : 's'}` : 'Deck built',
      );
      appendMessage(
        next,
        assistantOrFallback(
          result.content,
          slides > 0
            ? `Deck built with ${slides} slide${slides === 1 ? '' : 's'}.`
            : 'Deck built.',
        ),
      );
      return;
    }

    if (result.status === 'done') {
      if (result.truncated) {
        const slides = result.slideCount ?? 0;
        const next: SlideProject = {
          ...project,
          files: result.files,
          // Keep previewable phase if something projects; still error that run was incomplete.
          phase: slides > 0 ? 'ready' : 'error',
          pendingAsk: undefined,
          updatedAt: Date.now(),
        };
        host.landProject(next);
        host.setPhase(next.phase);
        host.setPendingAsk(null);
        if (slides > 0) {
          recordRound(
            result.files,
            `Deck built (partial) · ${slides} slide${slides === 1 ? '' : 's'}`,
          );
        }
        const narration = result.content?.trim();
        let landed = next;
        if (narration) {
          landed = appendMessage(landed, makeMsg('assistant', narration));
        }
        appendMessage(
          landed,
          makeMsg(
            'error',
            maxRoundsNoDeliverable('build', result.rounds, result.slideCount),
          ),
        );
        return;
      }
      landNoDeliverable(project, result.files, result.content, 'build', 'error');
      return;
    }

    if (result.status === 'error') {
      const next: SlideProject = { ...project, files: result.files, phase: 'error', updatedAt: Date.now() };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Build failed.'));
    }

    if (result.status === 'cancelled') {
      // Keep the partially-built deck files (stop() already narrated + cleared busy).
      host.landProject({
        ...project,
        files: result.files,
        stopped: true,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * True when a freeform message should resume/re-run planning rather than
   * edit. Edit is only for post-plan work (approved brief+design, or a deck).
   * Failed API plan turns leave phase `error` with empty/partial VFS — those
   * must NOT jump to the edit skill ("continue" after a plan 402).
   */
  function shouldResumePlan(project: SlideProject): boolean {
    if (!hasValidPlanFiles(project.files)) return true;
    return project.phase === 'plan' || project.phase === 'idle';
  }

  /**
   * Retry / Continue after a failed or max-round-truncated phase.
   * Does not invent a user "continue" transcript turn.
   * Routes by the latest phase_failed activity row when available so a truncated
   * edit does not accidentally re-run build.
   */
  async function retryFailedPhase(): Promise<void> {
    const project = host.getActiveProject();
    if (!project || state.running) return;
    if (blockPhase(project)) return;

    const activity = host.getActivity?.() ?? [];
    let failedPhase: 'plan' | 'build' | 'edit' | undefined;
    for (let i = activity.length - 1; i >= 0; i--) {
      const ev = activity[i];
      if (ev?.type === 'phase_failed' && (ev.phase === 'plan' || ev.phase === 'build' || ev.phase === 'edit')) {
        failedPhase = ev.phase;
        break;
      }
    }

    if (failedPhase === 'edit') {
      // Resume edit with an explicit continue instruction (no user bubble).
      await runEditContinue(project);
      return;
    }

    if (failedPhase === 'build' || hasValidPlanFiles(project.files)) {
      await runBuild();
      return;
    }

    await runPlan(project);
  }

  /** Continue a truncated edit phase without adding a user transcript message. */
  async function runEditContinue(project: SlideProject): Promise<void> {
    const systemPrompt = await skill('edit');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    host.setPhase('edit');
    prepareStream();
    host.setBusy(true);

    const result = await runEditPhase({
      systemPrompt,
      messages: [
        {
          role: 'user',
          content:
            'Continue the previous edit from the current workspace. Finish any incomplete work; do not undo successful changes.',
        },
      ],
      providerConfig: providerConfig(),
      chatOptions: chatOptions(),
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onDelta: streamDelta,
      onRoundStart: prepareStream,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
      onActivity: activitySink(),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    // Reuse sendFollowUp terminal handling by synthesizing via the same branches.
    // Inline the same land paths as sendFollowUp for ready/done/error/cancelled.
    if (result.status === 'ready') {
      const current = host.getActiveProject() ?? project;
      const next: SlideProject = {
        ...current,
        files: result.files,
        phase: 'ready',
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('ready');
      recordRound(result.files, 'Continue edit');
      appendMessage(next, assistantOrFallback(result.content, 'Deck updated.'));
      return;
    }
    if (result.status === 'done') {
      const current = host.getActiveProject() ?? project;
      if (result.truncated) {
        const slides = result.slideCount ?? 0;
        const next: SlideProject = {
          ...current,
          files: result.files,
          phase: slides > 0 ? 'ready' : 'error',
          pendingAsk: undefined,
          updatedAt: Date.now(),
        };
        host.landProject(next);
        host.setPhase(next.phase);
        host.setPendingAsk(null);
        if (slides > 0) {
          recordRound(result.files, 'Continue edit');
        }
        const narration = result.content?.trim();
        let landed = next;
        if (narration) landed = appendMessage(landed, makeMsg('assistant', narration));
        appendMessage(
          landed,
          makeMsg('error', maxRoundsNoDeliverable('edit', result.rounds, result.slideCount)),
        );
        return;
      }
      landNoDeliverable(current, result.files, result.content, 'edit', 'error');
      return;
    }
    if (result.status === 'error') {
      const current = host.getActiveProject() ?? project;
      const next: SlideProject = {
        ...current,
        files: result.files,
        phase: 'error',
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Edit failed.'));
      return;
    }
    if (result.status === 'cancelled') {
      const current = host.getActiveProject() ?? project;
      host.landProject({
        ...current,
        files: result.files,
        stopped: true,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * Route a freeform composer message: re-plan until brief+design are valid,
   * otherwise run the edit phase (follow-ups on an existing deck/plan).
   */
  async function sendFollowUp(text: string): Promise<void> {
    const message = text.trim();
    if (!message) return;
    const project = host.getActiveProject();
    if (!project || state.running) return;
    if (blockPhase(project)) return;

    if (shouldResumePlan(project)) {
      // Land the follow-up in the transcript, then re-plan with ALL user turns
      // (original deck prompt + this message) so the model isn't context-blind.
      const next = appendMessage(project, makeMsg('user', message));
      await runPlan(next);
      return;
    }

    const systemPrompt = await skill('edit');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    host.setPhase('edit');
    prepareStream();
    host.setBusy(true);

    appendMessage(project, makeMsg('user', message));

    const result = await runEditPhase({
      systemPrompt,
      messages: [{ role: 'user', content: message }],
      providerConfig: providerConfig(),
      chatOptions: chatOptions(),
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onDelta: streamDelta,
      onRoundStart: prepareStream,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
      onActivity: activitySink(),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'ready') {
      const current = host.getActiveProject() ?? project;
      const next: SlideProject = {
        ...current,
        files: result.files,
        phase: 'ready',
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('ready');
      recordRound(result.files, message);
      appendMessage(next, assistantOrFallback(result.content, 'Deck updated.'));
      return;
    }

    if (result.status === 'done') {
      const current = host.getActiveProject() ?? project;
      if (result.truncated) {
        const slides = result.slideCount ?? 0;
        const next: SlideProject = {
          ...current,
          files: result.files,
          phase: slides > 0 ? 'ready' : 'error',
          pendingAsk: undefined,
          updatedAt: Date.now(),
        };
        host.landProject(next);
        host.setPhase(next.phase);
        host.setPendingAsk(null);
        if (slides > 0) {
          recordRound(result.files, message);
        }
        const narration = result.content?.trim();
        let landed = next;
        if (narration) {
          landed = appendMessage(landed, makeMsg('assistant', narration));
        }
        appendMessage(
          landed,
          makeMsg('error', maxRoundsNoDeliverable('edit', result.rounds, result.slideCount)),
        );
        return;
      }
      landNoDeliverable(current, result.files, result.content, 'edit', 'error');
      return;
    }

    if (result.status === 'error') {
      const current = host.getActiveProject() ?? project;
      const next: SlideProject = {
        ...current,
        files: result.files,
        phase: 'error',
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Edit failed.'));
    }

    if (result.status === 'cancelled') {
      const current = host.getActiveProject() ?? project;
      host.landProject({
        ...current,
        files: result.files,
        stopped: true,
        pendingAsk: undefined,
        updatedAt: Date.now(),
      });
    }
  }

  /** Abort the in-flight phase, leaving partial VFS consistent. */
  function stop(): void {
    state.abort?.abort();
    state.abort = null;
    state.running = false;
    state.paused = null;
    // Immediately reflect the stop in the store (clear busy + any suspended ask)
    // so the UI isn't stuck on a pending AskPrompt or a busy composer/spinner.
    host.markStopped();
    // Narrate the stop in the transcript so a reload shows why it halted.
    const project = host.getActiveProject();
    if (project) {
      appendMessage(
        { ...project, stopped: true, pendingAsk: undefined, updatedAt: Date.now() },
        makeMsg('summary', 'Generation stopped — partial work was kept.')
      );
    }
  }

  return {
    createFromPrompt,
    answerAsk,
    runBuild,
    sendFollowUp,
    /** Re-run plan/build after a phase failure without a fake "continue" turn. */
    retryFailedPhase,
    stop,
    /** Whether the active model can drive the tool loop (US-032). */
    canUseFunctionCalling,
  };
}

/** Prefer submit_plan canvas, else the project's already-chosen canvas — never invent one. */
function pickCanvas(
  current: SlideCanvas | null,
  choice?: string,
): SlideCanvas | null {
  if (choice && isSlideCanvas(choice)) return choice;
  return current;
}

