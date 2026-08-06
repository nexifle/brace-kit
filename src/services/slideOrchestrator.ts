// ==================== Slide Creator orchestrator (US-024) ====================
//
// The thin "main/orchestrator" (PRD FR-4) that turns a user's deck prompt into
// a persisted SlideProject and drives the three isolated phase runners
// (plan/build/edit) without merging sub-session tool chatter into the main
// transcript. It is the shared logic behind the `useSlideAgent` hook, extracted
// here as a dependency-injected service so it is unit-testable without React or
// `chrome` (inject a test transport/fetcher/store).
//
// The main transcript only stores short entries: the user's message, concise
// assistant/summary narrations, ask cards (via pendingAsk), and errors —
// matching PRD US-012. Sub-session tool calls stay inside the phase runners.

import type {
  ProviderConfig,
} from '../types/index.ts';
import type { SlideMainMessage, SlideProject, SlideCanvas, SlideFile } from '../types/slides.ts';
import { DEFAULT_SLIDE_CANVAS } from '../types/slides.ts';
import {
  runPlanPhase,
  resumePlanPhase,
  runBuildPhase,
  runEditPhase,
  hasValidPlanFiles,
  type PlanPhaseResult,
  type SlideToolOptions,
} from './slidePhases.ts';
import { loadSlideSkill, type SlidePhaseKey, type SlideSkillFetcher } from './slideSkills.ts';
import type { AgentTransport, AgentAbortFn } from './agentSession.ts';
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

function makeMsg(role: SlideMainMessage['role'], content: string): SlideMainMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    createdAt: Date.now(),
  };
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
}

/** Runtime/network dependencies (injected for tests). */
export interface SlideAgentDeps {
  providerConfig: ProviderConfig;
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

  /** Whether the active model can drive the tool loop (US-032). */
  function canUseFunctionCalling(): boolean {
    if (deps.canFunctionCall) return deps.canFunctionCall();
    const pc = deps.providerConfig;
    const isGemini = pc.providerId === 'gemini' || pc.format === 'gemini';
    if (!isGemini) return true;
    return geminiSupportsFunctionCalling(pc.model);
  }

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

  /** Reflect a plan-phase result into the store + transcript. */
  async function runPlan(project: SlideProject, prompt: string): Promise<void> {
    const systemPrompt = await skill('plan');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    host.setPhase('plan');
    host.setBusy(true);

    const result = await runPlanPhase({
      systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      providerConfig: deps.providerConfig,
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'waiting_user' && result.pendingAsk) {
      state.paused = result.paused ?? null;
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
      appendMessage(next, makeMsg('summary', 'Plan ready — review the brief and design, then build.'));
      return;
    }

    if (result.status === 'done') {
      const next: SlideProject = {
        ...project,
        files: result.files,
        phase: 'plan',
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('plan');
      appendMessage(
        next,
        makeMsg('error', result.content?.trim() || 'The planner finished without a complete brief and design. Try again or rephrase.')
      );
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
      canvas: DEFAULT_SLIDE_CANVAS,
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
    host.setBusy(true);

    const result = await resumePlanPhase(
      {
        systemPrompt,
        messages: [],
        providerConfig: deps.providerConfig,
        files: project.files,
        signal: abort.signal,
        maxRounds: deps.maxRounds,
        transport: deps.transport,
        abortRequest: deps.abortRequest,
        toolOptions: deps.toolOptions,
        onFilesChange: (files) => host.refreshDeckFromFiles(files),
      },
      paused,
      answer
    );

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'waiting_user' && result.pendingAsk) {
      state.paused = result.paused ?? null;
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
      appendMessage(next, makeMsg('summary', 'Plan ready — review the brief and design, then build.'));
    } else if (result.status === 'error') {
      const next: SlideProject = { ...project, files: result.files, phase: 'error', updatedAt: Date.now() };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Planning failed.'));
    } else if (result.status === 'cancelled') {
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
    host.setBusy(true);

    const result = await runBuildPhase({
      systemPrompt,
      messages: [{ role: 'user', content: 'Build the deck from the approved brief and design.' }],
      providerConfig: deps.providerConfig,
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'ready' || result.status === 'done') {
      const next: SlideProject = {
        ...project,
        files: result.files,
        phase: 'ready',
        pendingAsk: undefined,
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('ready');
      const slides = result.files.filter((f) => /^\/slides\/.+\.html$/.test(f.path)).length;
      appendMessage(
        next,
        makeMsg('summary', slides > 0 ? `Deck built with ${slides} slide${slides === 1 ? '' : 's'}.` : 'Build finished — no renderable slides yet.')
      );
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

  /** Route a follow-up message to the edit phase. */
  async function sendFollowUp(text: string): Promise<void> {
    const message = text.trim();
    if (!message) return;
    const project = host.getActiveProject();
    if (!project || state.running) return;
    if (blockPhase(project)) return;

    const systemPrompt = await skill('edit');
    const abort = new AbortController();
    state.abort = abort;
    state.running = true;
    host.setPhase('edit');
    host.setBusy(true);

    appendMessage(project, makeMsg('user', message));

    const result = await runEditPhase({
      systemPrompt,
      messages: [{ role: 'user', content: message }],
      providerConfig: deps.providerConfig,
      files: project.files,
      signal: abort.signal,
      maxRounds: deps.maxRounds,
      transport: deps.transport,
      abortRequest: deps.abortRequest,
      toolOptions: deps.toolOptions,
      onFilesChange: (files) => host.refreshDeckFromFiles(files),
    });

    state.running = false;
    state.abort = null;
    host.setBusy(false);

    if (result.status === 'ready' || result.status === 'done') {
      // Build on the user-follow-up-appended project so the user message is kept.
      const current = host.getActiveProject() ?? project;
      const next: SlideProject = {
        ...current,
        files: result.files,
        phase: 'ready',
        updatedAt: Date.now(),
      };
      host.landProject(next);
      host.setPhase('ready');
      appendMessage(
        next,
        makeMsg('summary', result.status === 'ready' ? 'Deck updated.' : 'Edit finished — no renderable slides remain.')
      );
      return;
    }

    if (result.status === 'error') {
      const next: SlideProject = { ...project, files: result.files, phase: 'error', updatedAt: Date.now() };
      host.landProject(next);
      host.setPhase('error');
      appendMessage(next, makeMsg('error', result.error || 'Edit failed.'));
    }

    if (result.status === 'cancelled') {
      // Keep partial follow-up edits (stop() already narrated + cleared busy).
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
    stop,
    /** Whether the active model can drive the tool loop (US-032). */
    canUseFunctionCalling,
  };
}

/** Resolve the effective canvas, preferring the model's submit_plan choice. */
function pickCanvas(current: SlideCanvas, choice?: string): SlideCanvas {
  if (choice && isSlideCanvas(choice)) return choice;
  return current ?? DEFAULT_SLIDE_CANVAS;
}
