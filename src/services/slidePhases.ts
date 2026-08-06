// ==================== Slide phase runners ====================
//
// Orchestrates a single slide-creator agent phase by driving the reusable
// `runAgentSession` tool loop (src/services/agentSession.ts) with a phase
// skill as the isolated session's system prompt and the phase's allowlisted
// tool set (`getToolsForPhase` from slideTools.ts).
//
// The plan runner (US-015) is the first of these. It:
//   - holds a mutable, in-memory VFS (`SlideFile[]`) that accumulates the
//     patches the model makes via `apply_patch` during the loop;
//   - routes every model tool call client-side:
//       * list_files  -> list VFS paths under a prefix
//       * read_file   -> read one file's content
//       * apply_patch -> `applyPatchOperation(files, 'plan', op)`; on success
//                        adopts the returned NEW files array and notifies the
//                        caller via `onFilesChange`
//       * ask         -> suspend the session (waiting_user) with a pendingAsk
//       * submit_plan -> signal the model's declaration that planning is done
//   - resolves to `plan_ready` when the model submits (or both /brief.md and
//     /design.md exist and are non-empty), and never auto-starts build.

import type {
  APIMessage,
  MCPTool,
  ProviderConfig,
  ToolCall,
} from '../types/index.ts';
import type { SlidePendingAsk, SlidePhase } from '../types/slides.ts';
import {
  runAgentSession,
  resumeAgentSession,
  type AgentAbortFn,
  type AgentSessionParams,
  type AgentSessionResult,
  type AgentSessionState,
  type AgentToolDispatch,
  type AgentTransport,
  type StreamDelta,
} from './agentSession.ts';
import {
  applyPatchOperation,
  type SlidePatchOperation,
} from './applyPatchHarness.ts';
import { getSlideFile, rebuildDeckProjection } from '../utils/slideVfs.ts';
import { getToolsForPhase, type SlidePatchPhase } from './slideTools.ts';

// ==================== Plan phase ====================

/** Parsed `apply_patch` arguments: either `{ operation }` or a bare operation. */
interface ApplyPatchArgs {
  operation?: SlidePatchOperation;
}

/** Arguments accepted by the `ask` tool (PRD Appendix A). */
interface AskArgs {
  question?: string;
  options?: string[];
  field?: SlidePendingAsk['payload']['field'];
}

/** Arguments accepted by `submit_plan` (FR-12). */
interface SubmitPlanArgs {
  summary?: string;
  canvas?: string;
}

/** Runtime context for external, background-routed tools (US-028/029). */
export interface SlideToolOptions {
  /** Offer `google_search` to the session (injection replaces the default tools). */
  enableGoogleSearch?: boolean;
  /**
   * Filtered MCP tool schemas from the user's configured servers (US-029),
   * fetched exactly like main chat and injected into the session's tool list
   * for plan/build/edit. They are dispatched client-side via `externalTool`
   * → `MCP_CALL_TOOL`; VFS mutation (`apply_patch`) and `ask` remain strictly
   * client-side tools that never collide with these external tools.
   */
  mcpTools?: MCPTool[];
  /**
   * Executes an external tool call (e.g. `google_search`, MCP) via the existing
   * `MCP_CALL_TOOL` background path. When absent, external tools resolve with a
   * clear error instead of hanging (FR-14).
   */
  externalTool?: ExternalToolCaller;
}

/** Executes an external tool call and returns its text result (or an error). */
export type ExternalToolCaller = (input: {
  name: string;
  args: Record<string, unknown>;
}) => Promise<{ content?: string; error?: string }>;

/** Options for running the plan phase. */
export interface PlanPhaseParams {
  /** Phase skill text injected as the isolated session's system prompt. */
  systemPrompt: string;
  /** Isolated session messages (e.g. the user's initial deck prompt). */
  messages: APIMessage[];
  providerConfig: ProviderConfig;
  /** Base chat options; the session runner streams by default (US-035). */
  chatOptions?: Record<string, unknown>;
  /** Initial VFS. Copies it; patches never mutate the caller's array. */
  files: import('../types/slides.ts').SlideFile[];
  /** Tool set override; defaults to `getToolsForPhase('plan')`. */
  tools?: MCPTool[];
  /** Cap on model turns. */
  maxRounds?: number;
  signal?: AbortSignal;
  /** CHAT_REQUEST transport (injectable for tests). */
  transport?: AgentTransport;
  /** Abort in-flight request (injectable for tests). */
  abortRequest?: AgentAbortFn;
  /** Called after every successful `apply_patch` with the new files array. */
  onFilesChange?: (files: import('../types/slides.ts').SlideFile[]) => void;
  /** Live session updates from the runner (UI wiring). */
  onUpdate?: (state: AgentSessionState) => void;
  /** Per-turn streaming deltas (US-035) — wire to store streamingText/Reasoning. */
  onDelta?: (delta: StreamDelta) => void;
  /** External tool sharing (google_search / MCP) for the session (US-028/029). */
  toolOptions?: SlideToolOptions;
}

export type PlanPhaseStatus =
  | 'plan_ready' // submitted / both plan files valid; awaiting approval
  | 'waiting_user' // suspended on an ask; pendingAsk populated
  | 'done' // finished without a valid plan (partial) — not approval-ready
  | 'error'
  | 'cancelled';

export interface PlanPhaseResult {
  status: PlanPhaseStatus;
  /** Mutable VFS accumulated across all patches this run. */
  files: import('../types/slides.ts').SlideFile[];
  content?: string;
  pendingAsk?: SlidePendingAsk;
  error?: string;
  /** Canvas the model chose via submit_plan, if any. */
  canvasChoice?: string;
  /**
   * Agent-session transcript + next round, present on `waiting_user`, needed to
   * resume the plan session from `answerAsk`/`resumePlanPhase`.
   */
  paused?: {
    /** The paused transcript (system + user + assistant ask turn) at suspend time. */
    messages: APIMessage[];
    /** The round number to resume from — the ask turn that suspended the loop. */
    round: number;
    /** Pending-ask whose `toolCallId` ties the user's answer to the ask tool call. */
    pendingAsk: SlidePendingAsk;
  };
}

/** True when both /brief.md and /design.md exist and are non-empty. */
export function hasValidPlanFiles(
  files: import('../types/slides.ts').SlideFile[]
): boolean {
  const brief = getSlideFile(files, '/brief.md');
  const design = getSlideFile(files, '/design.md');
  return Boolean(
    brief && design && brief.content.trim().length > 0 && design.content.trim().length > 0
  );
}

/**
 * Run the plan phase: an isolated agent session that drafts `/brief.md` +
 * `/design.md` via `apply_patch`, `ask`s for missing facts, and declares
 * completion via `submit_plan`. Does not start the build phase (FR-7).
 *
 * On an `ask` the session suspends (`waiting_user`); the result carries the
 * paused transcript + round in `paused` so the caller can persist it and later
 * resume via {@link resumePlanPhase}.
 */
export async function runPlanPhase(
  params: PlanPhaseParams
): Promise<PlanPhaseResult> {
  const session = buildPlanSession(params);
  const { currentFiles, submit, sessionParams } = session;

  const result = await runAgentSession(sessionParams);

  return mapResult(result, currentFiles, submit.fired, submit.canvas);
}

/**
 * Resume a plan session that previously suspended on an `ask` (US-016
 * answerAsk). Appends the user's answer as the `ask` tool result tied to the
 * pending-ask's `toolCallId`, then re-runs the agent loop from the paused round.
 * Fails if the resume state lacks the running plan session (e.g. the phase was
 * stopped/none active).
 */
export async function resumePlanPhase(
  params: PlanPhaseParams,
  resume: PlanPhaseResult['paused'],
  answer: string
): Promise<PlanPhaseResult> {
  if (!resume) {
    return {
      status: 'error',
      files: params.files.slice(),
      error: 'Cannot resume: no paused plan session is available.',
    };
  }

  const session = buildPlanSession(params);
  const { currentFiles, submit, sessionParams } = session;

  // Append the user's answer as the `ask` tool result, resuming exactly where
  // the ask suspended (the assistant ask turn is already in the transcript).
  const messages = [
    ...resume.messages,
    {
      role: 'tool' as const,
      toolCallId: resume.pendingAsk.toolCallId,
      name: 'ask' as const,
      content: answer,
    },
  ];

  const result = await resumeAgentSession(sessionParams, {
    messages,
    round: resume.round + 1,
  });

  return mapResult(result, currentFiles, submit.fired, submit.canvas);
}

/** Shared dispatcher closure + runner params for the plan session. */
function buildPlanSession(params: PlanPhaseParams) {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();
  const submit = { fired: false, canvas: undefined as string | undefined };

  const dispatchTool = async (
    toolCall: ToolCall
  ): Promise<AgentToolDispatch> => {
    switch (toolCall.name) {
      case 'list_files':
        return { content: listFiles(currentFiles, args<{ path?: string }>(toolCall).path) };
      case 'read_file':
        return { content: readFile(currentFiles, args<{ path?: string }>(toolCall).path) };
      case 'apply_patch': {
        const op = args<ApplyPatchArgs>(toolCall).operation;
        if (!op) return { content: 'Error: apply_patch requires an "operation" argument.' };
        const result = applyPatchOperation(currentFiles, 'plan', op);
        if (result.status === 'completed' && result.files) {
          currentFiles.length = 0;
          currentFiles.push(...result.files);
          params.onFilesChange?.(currentFiles);
        }
        return { content: result.output };
      }
      case 'ask':
        return { suspended: true, pendingAsk: buildPendingAsk(toolCall) };
      case 'submit_plan': {
        submit.fired = true;
        const parsed = args<SubmitPlanArgs>(toolCall);
        if (typeof parsed.canvas === 'string' && parsed.canvas) submit.canvas = parsed.canvas;
        return { content: 'Accepted. The plan is ready for user review.' };
      }
      case 'google_search':
        return dispatchExternal(params.toolOptions, toolCall);
      default:
        // Any external/MCP tool (US-029) routes through the shared
        // `MCP_CALL_TOOL` background path, mirroring main chat (FR-14).
        return dispatchExternal(params.toolOptions, toolCall);
    }
  };

  const sessionParams = {
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    tools: params.tools ?? getToolsForPhaseWithOptions('plan', params.toolOptions),
    providerConfig: params.providerConfig,
    chatOptions: params.chatOptions ?? {},
    maxRounds: params.maxRounds,
    signal: params.signal,
    transport: params.transport,
    abortRequest: params.abortRequest,
    onUpdate: params.onUpdate,
    onDelta: params.onDelta,
    dispatchTool,
  };

  return { currentFiles, submit, dispatchTool, sessionParams };
}

// ==================== Build phase ====================

/** Options for running the build phase. */
export interface BuildPhaseParams {
  /** Phase skill text injected as the isolated session's system prompt. */
  systemPrompt: string;
  /** Isolated session user messages (the build kickoff / orchestrator prompt). */
  messages: APIMessage[];
  providerConfig: ProviderConfig;
  /** Base chat options; the session runner streams by default (US-035). */
  chatOptions?: Record<string, unknown>;
  /** Current VFS, including the approved `/brief.md` + `/design.md`. Copied; never mutated. */
  files: import('../types/slides.ts').SlideFile[];
  /** Tool set override; defaults to `getToolsForPhase('build')`. */
  tools?: MCPTool[];
  /** Cap on model turns. */
  maxRounds?: number;
  signal?: AbortSignal;
  /** CHAT_REQUEST transport (injectable for tests). */
  transport?: AgentTransport;
  /** Abort in-flight request (injectable for tests). */
  abortRequest?: AgentAbortFn;
  /** Called after every successful `apply_patch` with the new files array. */
  onFilesChange?: (files: import('../types/slides.ts').SlideFile[]) => void;
  /** Live session updates from the runner (UI wiring). */
  onUpdate?: (state: AgentSessionState) => void;
  /** Per-turn streaming deltas (US-035) — wire to store streamingText/Reasoning. */
  onDelta?: (delta: StreamDelta) => void;
  /** External tool sharing (google_search / MCP) for the session (US-028/029). */
  toolOptions?: SlideToolOptions;
}

/**
 * Terminal status for the build phase.
 * `ready` = a renderable deck was produced (deck.json projects ≥1 slide);
 * `done` = the agent finished but no valid deck / partial. `error`/`cancelled`.
 */
export type BuildPhaseStatus = 'ready' | 'done' | 'error' | 'cancelled';

export interface BuildPhaseResult {
  status: BuildPhaseStatus;
  /** Mutable VFS accumulated across all patches this run. */
  files: import('../types/slides.ts').SlideFile[];
  /** Final assistant summary narration (done/ready). */
  content?: string;
  error?: string;
}

/**
 * Run the build phase: an isolated agent session that turns the approved
 * `/brief.md` + `/design.md` into `/theme.css`, `/slides/*`, and `/deck.json`
 * via `apply_patch`. The plan docs are injected into the session context so the
 * model never needs the main chat history (FR-20).
 *
 * Resolves `ready` when the projected deck has ≥1 slide; `done` when the agent
 * finishes without a renderable deck. Build has no `ask`/`submit_plan` tools.
 */
export async function runBuildPhase(
  params: BuildPhaseParams
): Promise<BuildPhaseResult> {
  const session = buildBuildSession(params);
  const { currentFiles, sessionParams } = session;

  const result = await runAgentSession(sessionParams);

  return mapBuildResult(result, currentFiles);
}

/**
 * Shared dispatcher closure + runner params for the build session. Follows the
 * same shape as {@link buildPlanSession} but routes `apply_patch` under the
 * `build` allowlist and has no ask/submit_plan handling.
 */
function buildBuildSession(params: BuildPhaseParams) {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();

  const dispatchTool = async (
    toolCall: ToolCall
  ): Promise<AgentToolDispatch> => {
    switch (toolCall.name) {
      case 'list_files':
        return { content: listFiles(currentFiles, args<{ path?: string }>(toolCall).path) };
      case 'read_file':
        return { content: readFile(currentFiles, args<{ path?: string }>(toolCall).path) };
      case 'apply_patch': {
        const op = args<ApplyPatchArgs>(toolCall).operation;
        if (!op) return { content: 'Error: apply_patch requires an "operation" argument.' };
        const result = applyPatchOperation(currentFiles, 'build', op);
        if (result.status === 'completed' && result.files) {
          currentFiles.length = 0;
          currentFiles.push(...result.files);
          params.onFilesChange?.(currentFiles);
        }
        return { content: result.output };
      }
      case 'google_search':
        return dispatchExternal(params.toolOptions, toolCall);
      default:
        // External/MCP tool (US-029) routed via the shared `MCP_CALL_TOOL` path.
        return dispatchExternal(params.toolOptions, toolCall);
    }
  };

  const sessionParams: AgentSessionParams = {
    systemPrompt: composePlanDocsSystemPrompt(params.systemPrompt, currentFiles),
    messages: params.messages,
    tools: params.tools ?? getToolsForPhaseWithOptions('build', params.toolOptions),
    providerConfig: params.providerConfig,
    chatOptions: params.chatOptions ?? {},
    maxRounds: params.maxRounds,
    signal: params.signal,
    transport: params.transport,
    abortRequest: params.abortRequest,
    onUpdate: params.onUpdate,
    onDelta: params.onDelta,
    dispatchTool,
  };

  return { currentFiles, dispatchTool, sessionParams };
}

/**
 * Inject the approved `/brief.md` + `/design.md` into the system prompt so the
 * isolated build/edit sub-agent has the full plan in context (not the main chat
 * history). Missing/empty docs are simply omitted — the skill's read-first
 * discipline still applies afterwards.
 */
function composePlanDocsSystemPrompt(
  systemPrompt: string,
  files: import('../types/slides.ts').SlideFile[]
): string {
  const brief = getSlideFile(files, '/brief.md');
  const design = getSlideFile(files, '/design.md');
  const parts = [systemPrompt];
  if (brief && brief.content.trim().length > 0) {
    parts.push('\n\n--- /brief.md (approved) ---\n' + brief.content);
  }
  if (design && design.content.trim().length > 0) {
    parts.push('\n\n--- /design.md (approved) ---\n' + design.content);
  }
  return parts.join('');
}

/** Map the runner's terminal session state onto the build-phase result. */
function mapBuildResult(
  result: AgentSessionResult,
  files: import('../types/slides.ts').SlideFile[]
): BuildPhaseResult {
  const base = { files: files.slice() };
  switch (result.status) {
    case 'error':
      return { ...base, status: 'error', error: result.error };
    case 'cancelled':
      return { ...base, status: 'cancelled' };
    case 'waiting_user':
      // Build has no ask tool — an unexpected suspend degrades to a partial
      // done rather than leaving the UI stuck.
      return { ...base, status: 'done', content: result.content };
    case 'done':
    default: {
      // Readiness = the projected deck renders ≥1 slide.
      const deck = rebuildDeckProjection(files);
      return {
        ...base,
        status: deck.slideOrder.length > 0 ? 'ready' : 'done',
        content: result.content,
      };
    }
  }
}


// ==================== Edit phase ====================

/** Options for running the edit (follow-up) phase. */
export interface EditPhaseParams {
  /** Edit skill text injected as the isolated session's system prompt. */
  systemPrompt: string;
  /** Isolated session user messages (the user's follow-up request). */
  messages: APIMessage[];
  providerConfig: ProviderConfig;
  /** Base chat options; the session runner streams by default (US-035). */
  chatOptions?: Record<string, unknown>;
  /** Current VFS, including the built `/deck.json`, `/theme.css`, `/slides/*`. Copied; never mutated. */
  files: import('../types/slides.ts').SlideFile[];
  /** Tool set override; defaults to `getToolsForPhase('edit')`. */
  tools?: MCPTool[];
  /** Cap on model turns. */
  maxRounds?: number;
  signal?: AbortSignal;
  /** CHAT_REQUEST transport (injectable for tests). */
  transport?: AgentTransport;
  /** Abort in-flight request (injectable for tests). */
  abortRequest?: AgentAbortFn;
  /** Called after every successful `apply_patch` with the new files array. */
  onFilesChange?: (files: import('../types/slides.ts').SlideFile[]) => void;
  /** Live session updates from the runner (UI wiring). */
  onUpdate?: (state: AgentSessionState) => void;
  /** Per-turn streaming deltas (US-035) — wire to store streamingText/Reasoning. */
  onDelta?: (delta: StreamDelta) => void;
  /** External tool sharing (google_search / MCP) for the session (US-028/029). */
  toolOptions?: SlideToolOptions;
}

/**
 * Terminal status for the edit phase.
 * `ready` = the deck still projects ≥1 slide after the edit (previewable);
 * `done` = the agent finished but no renderable deck remains / partial.
 * `error`/`cancelled` passthrough.
 */
export type EditPhaseStatus = 'ready' | 'done' | 'error' | 'cancelled';

export interface EditPhaseResult {
  status: EditPhaseStatus;
  /** Mutable VFS accumulated across all patches this run. */
  files: import('../types/slides.ts').SlideFile[];
  /** Final assistant summary narration (done/ready). */
  content?: string;
  error?: string;
}

/**
 * Run the edit (follow-up) phase: an isolated agent session that applies a
 * user's follow-up request as surgical, read-first `apply_patch` changes to an
 * already-built deck (`/deck.json`, `/theme.css`, `/slides/*`). The approved
 * `/brief.md` + `/design.md` are injected as context so the sub-agent stays
 * on-system without the main chat history. Edit has no `ask`/`submit_plan`
 * tools.
 *
 * Resolves `ready` when the projected deck still has ≥1 slide; `done` when the
 * agent finishes without a renderable deck.
 */
export async function runEditPhase(
  params: EditPhaseParams
): Promise<EditPhaseResult> {
  const session = buildEditSession(params);
  const { currentFiles, sessionParams } = session;

  const result = await runAgentSession(sessionParams);

  return mapBuildResult(result, currentFiles);
}

/**
 * Shared dispatcher closure + runner params for the edit session. Follows the
 * exact build-runner shape but routes `apply_patch` under the `edit` allowlist
 * (build paths PLUS `/brief.md` + `/design.md`).
 */
function buildEditSession(params: EditPhaseParams) {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();

  const dispatchTool = async (
    toolCall: ToolCall
  ): Promise<AgentToolDispatch> => {
    switch (toolCall.name) {
      case 'list_files':
        return { content: listFiles(currentFiles, args<{ path?: string }>(toolCall).path) };
      case 'read_file':
        return { content: readFile(currentFiles, args<{ path?: string }>(toolCall).path) };
      case 'apply_patch': {
        const op = args<ApplyPatchArgs>(toolCall).operation;
        if (!op) return { content: 'Error: apply_patch requires an "operation" argument.' };
        const result = applyPatchOperation(currentFiles, 'edit', op);
        if (result.status === 'completed' && result.files) {
          currentFiles.length = 0;
          currentFiles.push(...result.files);
          params.onFilesChange?.(currentFiles);
        }
        return { content: result.output };
      }
      case 'google_search':
        return dispatchExternal(params.toolOptions, toolCall);
      default:
        // External/MCP tool (US-029) routed via the shared `MCP_CALL_TOOL` path.
        return dispatchExternal(params.toolOptions, toolCall);
    }
  };

  const sessionParams: AgentSessionParams = {
    systemPrompt: composePlanDocsSystemPrompt(params.systemPrompt, currentFiles),
    messages: params.messages,
    tools: params.tools ?? getToolsForPhaseWithOptions('edit', params.toolOptions),
    providerConfig: params.providerConfig,
    chatOptions: params.chatOptions ?? {},
    maxRounds: params.maxRounds,
    signal: params.signal,
    transport: params.transport,
    abortRequest: params.abortRequest,
    onUpdate: params.onUpdate,
    onDelta: params.onDelta,
    dispatchTool,
  };

  return { currentFiles, dispatchTool, sessionParams };
}

function mapResult(
  result: AgentSessionResult,
  files: import('../types/slides.ts').SlideFile[],
  submitted: boolean,
  canvasChoice: string | undefined
): PlanPhaseResult {
  const base = {
    files: files.slice(),
    ...(canvasChoice ? { canvasChoice } : {}),
  };
  switch (result.status) {
    case 'waiting_user':
      return {
        ...base,
        status: 'waiting_user',
        pendingAsk: result.pendingAsk,
        paused: {
          messages: result.messages,
          round: result.rounds,
          pendingAsk: result.pendingAsk as SlidePendingAsk,
        },
      };
    case 'error':
      return { ...base, status: 'error', error: result.error };
    case 'cancelled':
      return { ...base, status: 'cancelled' };
    case 'done':
    default:
      // Approval-ready iff the model submitted OR both plan files are valid.
      return {
        ...base,
        status: submitted || hasValidPlanFiles(files) ? 'plan_ready' : 'done',
        content: result.content,
      };
  }
}

function buildPendingAsk(toolCall: ToolCall): SlidePendingAsk {
  const parsed = args<AskArgs>(toolCall);
  const now = Date.now();
  return {
    id: `ask_${now}_${Math.random().toString(36).slice(2, 7)}`,
    toolCallId: toolCall.id,
    sessionRef: 'plan' as SlidePhase,
    payload: {
      question: typeof parsed.question === 'string' ? parsed.question : 'Could you clarify?',
      options: Array.isArray(parsed.options) ? parsed.options : undefined,
      field: parsed.field,
    },
    createdAt: now,
  };
}

/** List VFS paths under a prefix (or root when omitted/`/`). */
function listFiles(
  files: import('../types/slides.ts').SlideFile[],
  prefix?: string
): string {
  const raw = prefix && prefix.trim() ? prefix.trim() : '/';
  const norm = raw.endsWith('/') ? raw : `${raw}/`;
  const paths = files
    .filter((f) => f.path === raw || f.path.startsWith(norm))
    .map((f) => f.path)
    .sort();
  return JSON.stringify(paths, null, 2);
}

/** Read one file's content, or a Codex-style error string when missing. */
function readFile(
  files: import('../types/slides.ts').SlideFile[],
  path?: string
): string {
  if (!path) return 'Error: read_file requires a "path" argument.';
  const file = getSlideFile(files, path);
  if (!file) return `Error: File not found: ${path}`;
  return file.content;
}

/** Safely parse the tool call's `arguments` JSON string. */
function args<T>(toolCall: ToolCall): T {
  try {
    return JSON.parse(toolCall.arguments) as T;
  } catch {
    return {} as T;
  }
}

// ==================== External tool helpers (US-028/029) ====================

/**
 * Resolve a phase's tool list, injecting `google_search` on top when the
 * caller's `toolOptions.enableGoogleSearch` is set (plan, and build/edit when
 * opted in), plus any filtered MCP tools from `toolOptions.mcpTools` (US-029).
 * A caller-provided `tools` override is always respected verbatim.
 *
 * MCP tools are appended AFTER the slide tools and any external tool whose name
 * collides with the slide set (or `google_search`) is dropped — the slide
 * handler wins so `apply_patch`/`ask`/`list_files`/`read_file` stay strictly
 * client-side and the sole-VFS-mutator invariant holds.
 */
function getToolsForPhaseWithOptions(
  phase: SlidePatchPhase,
  toolOptions: SlideToolOptions | undefined
): MCPTool[] {
  const base = getToolsForPhase(phase, {
    enableGoogleSearch: toolOptions?.enableGoogleSearch,
  });
  const slideNames = new Set(base.map((t) => t.name));
  const external = (toolOptions?.mcpTools ?? []).filter(
    (tool) => !slideNames.has(tool.name)
  );
  return [...base, ...external];
}

/**
 * Dispatch an external tool call (`google_search`, future MCP) through the
 * injected `SlideToolOptions.externalTool`, or surface a clear error when no
 * executor is wired. Converts `{ content?: [], error?: string }` into the
 * tool-result body fed back to the model — an empty result maps to a
 * human-readable "no content" note so the loop never stalls on a blank turn.
 */
function dispatchExternal(
  toolOptions: SlideToolOptions | undefined,
  toolCall: ToolCall
): Promise<AgentToolDispatch> {
  const parsed = args<{ query?: string }>(toolCall);
  const executor = toolOptions?.externalTool;
  if (!executor) {
    return Promise.resolve({
      content: `Error: ${toolCall.name} is not available in this session. It can be enabled in Settings (enable Google Search / MCP).`,
    });
  }
  return executor({ name: toolCall.name, args: parsed ?? {} }).then((result) => ({
    content:
      result.content ||
      (result.error ? `Error: ${result.error}` : 'The tool returned no content.'),
  }));
}
