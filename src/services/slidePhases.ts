// ==================== Slide phase runners ====================
//
// Orchestrates a single slide-creator agent phase by driving the reusable
// `runAgentSession` tool loop (src/services/agentSession.ts) with a compact
// phase stub + skill catalog as the isolated session's system prompt and the
// phase's allowlisted tool set (`getToolsForPhase` from slideTools.ts). Full
// SKILL.md / references are pulled on demand via `load_skill`.
//
// The plan runner (US-015) is the first of these. It:
//   - holds a mutable, in-memory VFS (`SlideFile[]`) that accumulates the
//     patches the model makes via `apply_patch` during the loop;
//   - routes every model tool call client-side:
//       * list_files  -> list VFS paths under a prefix
//       * read_file   -> read one file's content
//       * load_skill  -> packed phase SKILL.md / references (not VFS)
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
import type {
  SlideActivityEvent,
  SlidePendingAsk,
  SlidePhase,
} from '../types/slides.ts';
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
import type { AgentContextOptions } from './agentContext.ts';
import {
  applyPatchOperation,
  parseApplyPatchArgs,
  type SlidePatchOperation,
} from './applyPatchHarness.ts';
import {
  collectSlideIds,
  deckSlideCount,
  formatDeckJsonIssues,
  getSlideFile,
  hasHardDeckJsonErrors,
  reorderSlideFiles,
  slideHtmlPath,
  syncDeckJson,
  validateDeckJson,
} from '../utils/slideVfs.ts';
import { getToolsForPhase, type SlidePatchPhase } from './slideTools.ts';
import {
  collectLoadedSkillIds,
  loadSlideSkillResource,
  type SlidePhaseKey,
  type SlideSkillFetcher,
} from './slideSkills.ts';
import { normalizeAskPayload } from '../utils/slideAsk.ts';
import { encodeImageForVisionDataUrl } from '../utils/slideImageResize.ts';
import { attachmentKindFromPath } from '../utils/slideUploads.ts';
import {
  askAnsweredLabel,
  connectingActivityLabel,
  fileDeletedLabel,
  fileWrittenLabel,
  modelRoundLabel,
  phaseCompletedLabel,
  phaseFailedLabel,
  phaseStartedLabel,
  phaseStoppedLabel,
  toolFailedLabel,
  toolStartedLabel,
  type SlideActivityPhase,
  type SlidePatchOpLabel,
} from '../utils/slideActivityLabels.ts';

// ==================== Plan phase ====================



/** Arguments accepted by the `ask` tool (PRD Appendix A). */
interface AskArgs {
  /** Multi-question form (preferred). */
  questions?: Array<{
    id?: string;
    question?: string;
    text?: string;
    options?: string[];
    multiple?: boolean;
    freeText?: boolean;
    field?: SlidePendingAsk['payload']['questions'][number]['field'];
  }>;
  /** Legacy single-question form. */
  question?: string;
  options?: string[];
  multiple?: boolean;
  freeText?: boolean;
  field?: SlidePendingAsk['payload']['questions'][number]['field'];
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
  /** Offer the Grok `web_search` tool to the session (grok provider only). */
  enableGrokWebSearch?: boolean;
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

/**
 * Push/patch hooks for the activity feed (Amendment A.5/A.6). Phase runners
 * emit a `tool_started` running row before each dispatch and patch it to
 * completed/failed after, plus `file_written`/`file_deleted` rows for successful
 * `apply_patch`. The store wires these to `pushActivity`/`patchActivity`.
 */
export interface SlideActivitySink {
  push: (event: SlideActivityEvent) => void;
  patch: (id: string, partial: Partial<SlideActivityEvent>) => void;
}

/** Parsed tool-call args needed to build a `tool_started` label. */
interface ActivityArgs {
  path?: string;
  patchOp?: SlidePatchOpLabel;
  query?: string;
  skillName?: string;
}

/** Parse the label-relevant bits from a tool call's `arguments` JSON. */
function activityArgs(toolCall: ToolCall): ActivityArgs | undefined {
  const parsed = args<Record<string, unknown>>(toolCall);
  const patch = parseApplyPatchArgs(parsed);
  return {
    path: patch.ok
      ? patch.operation.path
      : typeof parsed?.path === 'string'
        ? (parsed.path as string)
        : undefined,
    patchOp: patch.ok ? (patch.operation.type as SlidePatchOpLabel) : undefined,
    query: typeof parsed?.query === 'string' ? (parsed.query as string) : undefined,
    skillName: typeof parsed?.name === 'string' ? (parsed.name as string) : undefined,
  };
}

/**
 * Dispatch `apply_patch` for a phase: parse flat or nested args, apply under
 * the phase allowlist, adopt files on success, emit activity.
 *
 * After a successful build/edit patch the VFS is re-synced via
 * {@link syncDeckJson}: `/deck.json` is code-owned, its `slideOrder` recomputed
 * from the actual `/slides/*.html` files and `theme` from `/theme.css`, so the
 * deck is always valid no matter how many slides the agent created or deleted.
 * Plan is docs-only and produces no slides, so it does not sync.
 */
function dispatchApplyPatch(
  toolCall: ToolCall,
  round: number,
  phase: SlidePatchPhase,
  currentFiles: import('../types/slides.ts').SlideFile[],
  onFilesChange: ((files: import('../types/slides.ts').SlideFile[]) => void) | undefined,
  emitter: ReturnType<typeof createActivityEmitter>,
): { content: string } {
  const row = emitter.started(toolCall, round);
  const parsed = parseApplyPatchArgs(args<unknown>(toolCall));
  if (!parsed.ok) {
    emitter.failed(row, parsed.error);
    return { content: parsed.error };
  }
  const op = parsed.operation;
  const result = applyPatchOperation(currentFiles, phase, op);
  if (result.status !== 'completed' || !result.files) {
    emitter.failed(row, result.output);
    return { content: result.output };
  }

  currentFiles.length = 0;
  currentFiles.push(...result.files);
  if (phase === 'build' || phase === 'edit') {
    const synced = syncDeckJson(currentFiles);
    currentFiles.length = 0;
    currentFiles.push(...synced);
  }
  onFilesChange?.(currentFiles);
  emitter.complete(row);
  if (op.path) emitter.fileChanged(op.type, op.path, round, toolCall.id);
  return { content: result.output };
}

/**
 * Dispatch `reorder_slides`: parse `order` (current slide ids in the desired
 * final sequence), renumber the slide files in place via
 * {@link reorderSlideFiles}, adopt files, re-sync deck.json, emit activity.
 *
 * `reorder_slides` is an explicit, tightly-scoped second VFS mutator (see the
 * FR-11b note in `slideTools.ts`): it only renames `/slides/*.{html,css}` — a
 * subset of the build/edit allowlists — never writes arbitrary paths, and
 * never mutates the input array. It deliberately does NOT route through
 * `applyPatchOperation` because a reorder is a multi-file atomic rename rather
 * than a single patch; it is listed in `isSlideVfsMutator` so the phase runners
 * and activity feed treat it as a mutation.
 */
function dispatchReorderSlides(
  toolCall: ToolCall,
  round: number,
  phase: SlidePatchPhase,
  currentFiles: import('../types/slides.ts').SlideFile[],
  onFilesChange: ((files: import('../types/slides.ts').SlideFile[]) => void) | undefined,
  emitter: ReturnType<typeof createActivityEmitter>,
): { content: string } {
  const row = emitter.started(toolCall, round);
  const result = reorderSlideFiles(currentFiles, args<{ order?: unknown }>(toolCall).order);
  if (!result.ok || !result.files) {
    emitter.failed(row, result.error ?? 'Error: reorder_slides failed.');
    return { content: result.error ?? 'Error: reorder_slides failed.' };
  }

  currentFiles.length = 0;
  currentFiles.push(...result.files);
  if (phase === 'build' || phase === 'edit') {
    const synced = syncDeckJson(currentFiles);
    currentFiles.length = 0;
    currentFiles.push(...synced);
  }
  onFilesChange?.(currentFiles);
  emitter.complete(row);

  // Emit a file_written row only for slides whose path actually changed.
  const ids = collectSlideIds(result.files);
  for (const { to } of result.renames ?? []) {
    emitter.fileChanged('rename_file', slideHtmlPath(to), round, toolCall.id);
  }
  return {
    content: `Reordered slides to: [${ids.join(', ')}]`,
  };
}

/**
 * Per-session activity emitter. Owns a monotonically increasing event `seq` so
 * a phase run's rows are stable and ordered (`${phase}_${round}_${seq}`). The
 * `ask` tool row uses the pending-ask's id so a later resume can patch it to
 * completed and emit `ask_answered`.
 */
function createActivityEmitter(phase: SlideActivityPhase, sink?: SlideActivitySink) {
  let seq = 0;
  // Fixed id of the `connecting` row so both a run and its later resume (a FRESH
  // emitter) close the same row when the first model round starts (A.5).
  const connectingId = `${phase}_connecting`;
  // True once a model round has begun — the `connecting` row is then already
  // resolved (completed). Terminal events must NOT re-patch it to cancelled/
  // failed, except when the phase ends before ANY round started (pre-abort).
  let roundStartedFlag = false;
  return {
    /** Emit `phase_started` (completed check) + `connecting` (running spinner) at run start (A.5). */
    phaseStarted(): void {
      sink?.push({
        id: `${phase}_phase_started`,
        type: 'phase_started',
        status: 'completed',
        ts: Date.now(),
        phase,
        label: phaseStartedLabel(phase),
      });
      sink?.push({
        id: connectingId,
        type: 'connecting',
        status: 'running',
        ts: Date.now(),
        phase,
        label: connectingActivityLabel(),
      });
    },
    /**
     * Emit a `model_round_started` running row for the given round, completing
     * the earlier `connecting` row once a model request is actually sent.
     */
    roundStarted(round: number): void {
      if (!roundStartedFlag) {
        sink?.patch(connectingId, { status: 'completed' });
        roundStartedFlag = true;
      }
      sink?.push({
        id: `${phase}_round_${round}`,
        type: 'model_round_started',
        status: 'running',
        ts: Date.now(),
        phase,
        round,
        label: modelRoundLabel(round),
      });
    },
    /**
     * Close the round's running row. Keep reasoning in `detail` and assistant
     * prose in `content` so the chat timeline can place both before tools from
     * later rounds (US-039 ordering).
     */
    roundCompleted(
      round: number,
      response?: { content?: string; reasoning_content?: string; error?: string },
    ): void {
      const failed = !!response?.error?.trim();
      const reasoning = !failed ? response?.reasoning_content?.trim() : undefined;
      const content = !failed ? response?.content?.trim() : undefined;
      sink?.patch(`${phase}_round_${round}`, {
        status: failed ? 'failed' : 'completed',
        ...(reasoning ? { detail: reasoning } : {}),
        ...(content ? { content } : {}),
      });
    },


    /** Emit `phase_completed` on a terminal success; build carries the slide count. */
    phaseCompleted(opts?: { slideCount?: number }): void {
      sink?.push({
        id: `${phase}_phase_completed_${++seq}`,
        type: 'phase_completed',
        status: 'completed',
        ts: Date.now(),
        phase,
        label: phaseCompletedLabel(phase, opts),
      });
    },
    /** Emit `phase_stopped` on a user cancel; settle the connecting spinner if no round started. */
    phaseStopped(): void {
      if (!roundStartedFlag) sink?.patch(connectingId, { status: 'cancelled' });
      sink?.push({
        id: `${phase}_phase_stopped_${++seq}`,
        type: 'phase_stopped',
        status: 'cancelled',
        ts: Date.now(),
        phase,
        label: phaseStoppedLabel(),
      });
    },
    /** Emit `phase_failed` on a transport/error; settle the connecting spinner if no round started. */
    phaseFailed(message: string): void {
      if (!roundStartedFlag) sink?.patch(connectingId, { status: 'failed' });
      sink?.push({
        id: `${phase}_phase_failed_${++seq}`,
        type: 'phase_failed',
        status: 'failed',
        ts: Date.now(),
        phase,
        label: phaseFailedLabel(message),
        ...(message ? { detail: message } : {}),
      });
    },
    /** Emit a `tool_started` running row, returning its id. */
    started(toolCall: ToolCall, round: number, opts?: { id?: string }): string {
      const id = opts?.id ?? `${phase}_${round}_${++seq}`;
      const a = activityArgs(toolCall);
      sink?.push({
        id,
        type: 'tool_started',
        status: 'running',
        ts: Date.now(),
        phase,
        round,
        toolName: toolCall.name,
        toolCallId: toolCall.id,
        label: toolStartedLabel(toolCall.name, a),
        // Path lives in the label (and on file_written cards) — do not mirror
        // it as a detail subline under the tool row.
      });
      return id;
    },
    /** Patch a running row to completed (success). */
    complete(id: string): void {
      sink?.patch(id, { status: 'completed' });
    },
    /** Patch a running row to failed with a reason (≤80 chars via helper). */
    failed(id: string, reason: string): void {
      // The tool-result reason (apply_patch output / read error) already starts
      // with `Error: `; strip it so the row reads `Failed: ...`, not
      // `Failed: Error: ...`, while keeping the full reason as the detail.
      const clean = (reason ?? '').replace(/^Error:\s*/, '').trim();
      sink?.patch(id, {
        status: 'failed',
        label: toolFailedLabel(clean),
        detail: reason,
      });
    },
    /** Emit a `file_written`/`file_deleted` row for a successful `apply_patch`. */
    fileChanged(
      op: SlidePatchOperation['type'],
      path: string,
      round: number,
      toolCallId?: string,
    ): void {
      sink?.push({
        id: `${phase}_${round}_${++seq}`,
        type: op === 'delete_file' ? 'file_deleted' : 'file_written',
        status: 'completed',
        ts: Date.now(),
        phase,
        round,
        patchOp: op,
        path,
        ...(toolCallId ? { toolCallId } : {}),
        label: op === 'delete_file' ? fileDeletedLabel(path) : fileWrittenLabel(op, path),
      });
    },
    /** Emit an `ask_answered` row when a suspended ask is resumed (A.6). */
    askAnswered(toolCallId: string, round: number): void {
      // A resumed plan session builds a FRESH emitter (seq resets to 0), yet
      // reuses the suspended round — so this id would collide with an earlier
      // `tool_started`/`file_written` id in the same round (e.g. when
      // list/read/apply_patch ran before the ask, consuming `_1`). pushActivity
      // appends without dedupe and patchActivity patches every matching id, so a
      // duplicate id would corrupt later patches. Suffix with a unique tag
      // (Amendment A.5 allows `…` + uuid-style id).
      sink?.push({
        id: `${phase}_${round}_${++seq}_${Math.random().toString(36).slice(2, 7)}`,
        type: 'ask_answered',
        status: 'completed',
        ts: Date.now(),
        phase,
        round,
        toolName: 'ask',
        toolCallId,
        label: askAnsweredLabel(),
      });
    },
  };
}

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
  /**
   * Clear live streaming buffers at the start of each model round so prior-round
   * text/reasoning cannot linger under later tools (US-039 ordering).
   */
  onRoundStart?: () => void;
  /** External tool sharing (google_search / MCP) for the session (US-028/029). */
  toolOptions?: SlideToolOptions;
  /** When false, `read_file` on an image returns an error instead of pixels. */
  sendImageParts?: boolean;
  /** Activity-feed sink (Amendment A.6): emit tool/file/ask rows as tools dispatch. */
  onActivity?: SlideActivitySink;
  /** Packed skill fetcher for `load_skill` (tests inject; production uses chrome URLs). */
  skillFetcher?: SlideSkillFetcher;
  skillBaseUrl?: string;
  /** Cache-safe context bounds for the agent loop (tests inject tiny budgets). */
  agentContext?: Partial<AgentContextOptions>;
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
   * The plan-session conversation WITHOUT the leading system message (user +
   * assistant + tool turns) from a completed round. Persisted on the project so
   * a follow-up re-plan continues the same context — the prior round's
   * transcript becomes a cacheable prefix for the next round.
   */
  transcript?: APIMessage[];
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
  const { currentFiles, submit, emitter, sessionParams } = session;

  emitter.phaseStarted();
  const result = await runAgentSession(sessionParams);

  const mapped = mapResult(result, currentFiles, submit.canvas);
  emitPhaseTerminal(emitter, mapped.status, {
    ...(mapped.error ? { error: mapped.error } : {}),
    noDeliverable: PHASE_NO_DELIVERABLE.plan,
  });
  return mapped;
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

  const session = buildPlanSession(params, resume.messages);
  const { currentFiles, submit, emitter, sessionParams } = session;

  // Close the suspended ask's running row + emit `ask_answered` (A.6). The
  // suspended `tool_started` row was keyed by the pending-ask id, so the store
  // sink (shared across the pause + resume) can patch it directly.
  if (resume.pendingAsk) {
    params.onActivity?.patch(resume.pendingAsk.id, { status: 'completed' });
    emitter.askAnswered(resume.pendingAsk.toolCallId, resume.round);
  }

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

  const mapped = mapResult(result, currentFiles, submit.canvas);
  emitPhaseTerminal(emitter, mapped.status, {
    ...(mapped.error ? { error: mapped.error } : {}),
    noDeliverable: PHASE_NO_DELIVERABLE.plan,
  });
  return mapped;
}

/** Shared dispatcher closure + runner params for the plan session. */
function buildPlanSession(params: PlanPhaseParams, seedMessages?: APIMessage[]) {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();
  const submit = { fired: false, canvas: undefined as string | undefined };
  // Per-run activity emitter (Amendment A.6) for tool/file/ask rows.
  const emitter = createActivityEmitter('plan', params.onActivity);
  // Skills already fetched this session (cleared on compact so reload is allowed).
  const loadedSkills = collectLoadedSkillIds(seedMessages ?? params.messages);

  const dispatchTool = async (
    toolCall: ToolCall,
    round: number
  ): Promise<AgentToolDispatch> => {
    switch (toolCall.name) {
      case 'list_files': {
        const row = emitter.started(toolCall, round);
        const content = listFiles(currentFiles, args<{ path?: string }>(toolCall).path);
        if (content.startsWith('Error:')) emitter.failed(row, content);
        else emitter.complete(row);
        return { content };
      }
      case 'read_file': {
        const row = emitter.started(toolCall, round);
        const content = await readFile(
          currentFiles,
          args<{ path?: string }>(toolCall).path,
          params.sendImageParts !== false,
        );
        if (content.startsWith('Error:')) emitter.failed(row, content);
        else emitter.complete(row);
        return { content };
      }
      case 'load_skill':
        return dispatchLoadSkill(toolCall, round, 'plan', params, emitter, loadedSkills);
      case 'apply_patch':
        return dispatchApplyPatch(
          toolCall,
          round,
          'plan',
          currentFiles,
          params.onFilesChange,
          emitter,
        );
      case 'ask': {
        const pendingAsk = buildPendingAsk(toolCall);
        // Row id = pendingAsk id so a resume can close it + emit ask_answered.
        emitter.started(toolCall, round, { id: pendingAsk.id });
        return { suspended: true, pendingAsk };
      }
      case 'submit_plan': {
        const row = emitter.started(toolCall, round);
        submit.fired = true;
        const parsed = args<SubmitPlanArgs>(toolCall);
        if (typeof parsed.canvas === 'string' && parsed.canvas) submit.canvas = parsed.canvas;
        emitter.complete(row);
        return { content: 'Accepted. The plan is ready for user review.' };
      }
      case 'google_search':
        return emitExternalActivity(params, emitter, toolCall, round);
      default:
        // Any external/MCP tool (US-029) routes through the shared
        // `MCP_CALL_TOOL` background path, mirroring main chat (FR-14).
        return emitExternalActivity(params, emitter, toolCall, round);
    }
  };

  const sessionParams: AgentSessionParams = {
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
    onCompact: () => loadedSkills.clear(),
    agentContext: params.agentContext,
    onRoundStart: (round: number) => {
      params.onRoundStart?.();
      emitter.roundStarted(round);
    },
    onRoundComplete: (
      round: number,
      response?: { content?: string; reasoning_content?: string },
    ) => emitter.roundCompleted(round, response),
    dispatchTool,
  };

  return { currentFiles, submit, emitter, dispatchTool, sessionParams, loadedSkills };
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
  /** Clear live streaming buffers at the start of each model round (US-039). */
  onRoundStart?: () => void;
  /** External tool sharing (google_search / MCP) for the session (US-028/029). */
  toolOptions?: SlideToolOptions;
  /** When false, `read_file` on an image returns an error instead of pixels. */
  sendImageParts?: boolean;
  /** Activity-feed sink (Amendment A.6): emit tool/file/ask rows as tools dispatch. */
  onActivity?: SlideActivitySink;
  /** Packed skill fetcher for `load_skill`. */
  skillFetcher?: SlideSkillFetcher;
  skillBaseUrl?: string;
  /** Cache-safe context bounds for the agent loop (tests inject tiny budgets). */
  agentContext?: Partial<AgentContextOptions>;
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
  /**
   * Projectable slide count from {@link rebuildDeckProjection} at terminal time.
   * Set for `ready`/`done` so callers never re-count HTML paths independently.
   */
  slideCount?: number;
  /** Final assistant summary narration (done/ready). */
  content?: string;
  error?: string;
  /** True when the agent loop hit maxRounds (partial). */
  truncated?: boolean;
  /** Model rounds completed when the phase ended (useful for truncated copy). */
  rounds?: number;
  /** The build session conversation (minus the leading system message), for continuation. */
  transcript?: APIMessage[];
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
  const { currentFiles, emitter, sessionParams } = session;

  emitter.phaseStarted();
  const result = await runAgentSession(sessionParams);

  const mapped = mapBuildResult(result, currentFiles);
  emitPhaseTerminal(emitter, mapped.status, {
    ...(mapped.error ? { error: mapped.error } : {}),
    ...(mapped.status === 'ready' && mapped.slideCount != null
      ? { slideCount: mapped.slideCount }
      : {}),
    noDeliverable: mapped.truncated
      ? maxRoundsNoDeliverable('build', mapped.rounds, mapped.slideCount)
      : PHASE_NO_DELIVERABLE.build,
  });
  // Carry the build conversation (minus the leading system message) so a
  // follow-up after a stopped/failed build can continue the same context
  // (mirrors planTranscript/editTranscript).
  return { ...mapped, transcript: stripSystemMessage(result.messages) };
}

/**
 * Shared dispatcher closure + runner params for the build session. Follows the
 * same shape as {@link buildPlanSession} but routes `apply_patch` under the
 * `build` allowlist and has no ask/submit_plan handling.
 */
function buildBuildSession(params: BuildPhaseParams) {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();
  const emitter = createActivityEmitter('build', params.onActivity);
  const loadedSkills = collectLoadedSkillIds(params.messages);

  const dispatchTool = async (
    toolCall: ToolCall,
    round: number
  ): Promise<AgentToolDispatch> => {
    switch (toolCall.name) {
      case 'list_files': {
        const row = emitter.started(toolCall, round);
        const content = listFiles(currentFiles, args<{ path?: string }>(toolCall).path);
        if (content.startsWith('Error:')) emitter.failed(row, content);
        else emitter.complete(row);
        return { content };
      }
      case 'read_file': {
        const row = emitter.started(toolCall, round);
        const content = await readFile(
          currentFiles,
          args<{ path?: string }>(toolCall).path,
          params.sendImageParts !== false,
        );
        if (content.startsWith('Error:')) emitter.failed(row, content);
        else emitter.complete(row);
        return { content };
      }
      case 'load_skill':
        return dispatchLoadSkill(toolCall, round, 'build', params, emitter, loadedSkills);
      case 'apply_patch':
        return dispatchApplyPatch(
          toolCall,
          round,
          'build',
          currentFiles,
          params.onFilesChange,
          emitter,
        );
      case 'reorder_slides':
        return dispatchReorderSlides(
          toolCall,
          round,
          'build',
          currentFiles,
          params.onFilesChange,
          emitter,
        );
      case 'google_search':
        return emitExternalActivity(params, emitter, toolCall, round);
      default:
        // External/MCP tool (US-029) routed via the shared `MCP_CALL_TOOL` path.
        return emitExternalActivity(params, emitter, toolCall, round);
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
    onCompact: () => loadedSkills.clear(),
    agentContext: params.agentContext,
    onRoundStart: (round: number) => {
      params.onRoundStart?.();
      emitter.roundStarted(round);
    },
    onRoundComplete: (
      round: number,
      response?: { content?: string; reasoning_content?: string },
    ) => emitter.roundCompleted(round, response),
    dispatchTool,
  };

  return { currentFiles, emitter, dispatchTool, sessionParams, loadedSkills };
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
  files: import('../types/slides.ts').SlideFile[],
): BuildPhaseResult {
  const base = { files: files.slice() };
  switch (result.status) {
    case 'error':
      return { ...base, status: 'error', error: result.error };
    case 'cancelled':
      return { ...base, status: 'cancelled' };
    case 'waiting_user':
      // Build has no ask tool — unexpected suspend is a partial (no deliverable).
      return { ...base, status: 'done', slideCount: 0, content: result.content };
    case 'done':
    default: {
      // Projection is the readiness source — but a max-rounds truncation is never
      // a successful full deck even if one early slide already projects, and a
      // structurally invalid deck.json is never a valid deliverable either.
      const slideCount = deckSlideCount(files);
      const truncated = !!result.truncated;
      const v = validateDeckJson(files);
      // Surface a specific error only for HARD contract violations: invalid
      // JSON/non-object, a present-but-wrong canvas, a present-but-malformed
      // slideOrder, or a non-path theme. Extra top-level keys and the `aspect`
      // key are advisory (the projection ignores them) and do NOT block
      // readiness — the agent may add properties as long as the required values
      // are correct. Soft warnings (missing canvas/slideOrder, which degrade
      // gracefully) do not block. A deck.json entirely absent is a plain
      // no-deliverable and keeps the generic narration (deleting it is allowed).
      const hasDeck = !!getSlideFile(files, '/deck.json');
      const contractError =
        !truncated && hasDeck && hasHardDeckJsonErrors(v)
          ? formatDeckJsonIssues(v.issues)
          : undefined;
      const ready = !truncated && slideCount > 0 && !contractError;
      return {
        ...base,
        status: ready ? 'ready' : 'done',
        slideCount,
        content: result.content,
        rounds: result.rounds,
        ...(truncated ? { truncated: true } : {}),
        ...(contractError ? { error: contractError } : {}),
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
  /** Clear live streaming buffers at the start of each model round (US-039). */
  onRoundStart?: () => void;
  /** External tool sharing (google_search / MCP) for the session (US-028/029). */
  toolOptions?: SlideToolOptions;
  /** When false, `read_file` on an image returns an error instead of pixels. */
  sendImageParts?: boolean;
  /** Activity-feed sink (Amendment A.6): emit tool/file/ask rows as tools dispatch. */
  onActivity?: SlideActivitySink;
  /** Packed skill fetcher for `load_skill`. */
  skillFetcher?: SlideSkillFetcher;
  skillBaseUrl?: string;
  /** Cache-safe context bounds for the agent loop (tests inject tiny budgets). */
  agentContext?: Partial<AgentContextOptions>;
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
  /** Projectable slide count at terminal time (same source as build). */
  slideCount?: number;
  /** Final assistant summary narration (done/ready). */
  content?: string;
  error?: string;
  /** True when the agent loop hit maxRounds (partial). */
  truncated?: boolean;
  /** Model rounds completed when the phase ended. */
  rounds?: number;
  /** The edit session conversation (minus the leading system message), for continuation. */
  transcript?: APIMessage[];
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
  const { currentFiles, emitter, sessionParams } = session;

  emitter.phaseStarted();
  const result = await runAgentSession(sessionParams);

  const mapped = mapBuildResult(result, currentFiles);
  emitPhaseTerminal(emitter, mapped.status, {
    ...(mapped.error ? { error: mapped.error } : {}),
    noDeliverable: mapped.truncated
      ? maxRoundsNoDeliverable('edit', mapped.rounds, mapped.slideCount)
      : PHASE_NO_DELIVERABLE.edit,
  });
  // Carry the edit conversation (minus the leading system message) so a
  // subsequent follow-up continues the same context (mirrors planTranscript).
  return { ...mapped, transcript: stripSystemMessage(result.messages) };
}

/**
 * Shared dispatcher closure + runner params for the edit session. Follows the
 * exact build-runner shape but routes `apply_patch` under the `edit` allowlist
 * (build paths PLUS `/brief.md` + `/design.md`).
 */
function buildEditSession(params: EditPhaseParams) {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();
  const emitter = createActivityEmitter('edit', params.onActivity);
  const loadedSkills = collectLoadedSkillIds(params.messages);

  const dispatchTool = async (
    toolCall: ToolCall,
    round: number
  ): Promise<AgentToolDispatch> => {
    switch (toolCall.name) {
      case 'list_files': {
        const row = emitter.started(toolCall, round);
        const content = listFiles(currentFiles, args<{ path?: string }>(toolCall).path);
        if (content.startsWith('Error:')) emitter.failed(row, content);
        else emitter.complete(row);
        return { content };
      }
      case 'read_file': {
        const row = emitter.started(toolCall, round);
        const content = await readFile(
          currentFiles,
          args<{ path?: string }>(toolCall).path,
          params.sendImageParts !== false,
        );
        if (content.startsWith('Error:')) emitter.failed(row, content);
        else emitter.complete(row);
        return { content };
      }
      case 'load_skill':
        return dispatchLoadSkill(toolCall, round, 'edit', params, emitter, loadedSkills);
      case 'apply_patch':
        return dispatchApplyPatch(
          toolCall,
          round,
          'edit',
          currentFiles,
          params.onFilesChange,
          emitter,
        );
      case 'reorder_slides':
        return dispatchReorderSlides(
          toolCall,
          round,
          'edit',
          currentFiles,
          params.onFilesChange,
          emitter,
        );
      case 'google_search':
        return emitExternalActivity(params, emitter, toolCall, round);
      default:
        // External/MCP tool (US-029) routed via the shared `MCP_CALL_TOOL` path.
        return emitExternalActivity(params, emitter, toolCall, round);
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
    onCompact: () => loadedSkills.clear(),
    agentContext: params.agentContext,
    onRoundStart: (round: number) => {
      params.onRoundStart?.();
      emitter.roundStarted(round);
    },
    onRoundComplete: (
      round: number,
      response?: { content?: string; reasoning_content?: string },
    ) => emitter.roundCompleted(round, response),
    dispatchTool,
  };

  return { currentFiles, emitter, dispatchTool, sessionParams, loadedSkills };
}

/** Terminal copy when a runner ends `done` without a usable deliverable. */
export const PHASE_NO_DELIVERABLE: Record<SlideActivityPhase, string> = {
  plan: 'The planner finished without a complete brief and design.',
  build: 'Build finished without producing a renderable deck.',
  edit: 'Edit finished without a renderable slide remaining.',
};

/**
 * Clear copy when the agent tool-loop hit max model rounds (one CHAT_REQUEST =
 * one round). Surfaces in the activity feed + transcript so "Deck ready" is
 * never implied for a truncated run.
 */
export function maxRoundsNoDeliverable(
  phase: 'plan' | 'build' | 'edit',
  rounds?: number,
  slideCount?: number,
): string {
  const n = rounds != null && rounds > 0 ? rounds : undefined;
  const limit = n != null ? `${n} model round${n === 1 ? '' : 's'}` : 'the model-round limit';
  if (phase === 'build') {
    const slides = slideCount ?? 0;
    if (slides > 0) {
      return `Hit ${limit} with only ${slides} slide${slides === 1 ? '' : 's'} projectable — full deck not finished. Partial work was kept.`;
    }
    return `Hit ${limit} before a renderable deck was produced. Partial work was kept.`;
  }
  if (phase === 'edit') {
    return `Hit ${limit} before edits finished. Partial work was kept.`;
  }
  return `Hit ${limit} before the plan was complete. Partial work was kept.`;
}

/** True when a phase_failed label is a max-round truncation (not a hard error). */
export function isMaxRoundsFailureLabel(label: string | undefined): boolean {
  if (!label) return false;
  // Strip activity "Error: " prefix if present.
  const t = label.replace(/^Error:\s*/i, '');
  return /\bmodel round/i.test(t) || /\bmodel-round limit\b/i.test(t);
}

/** Terminal statuses shared by the plan/build/edit runners. */
type PhaseTerminalStatus = PlanPhaseStatus | BuildPhaseStatus | EditPhaseStatus;

/**
 * Emit the terminal phase-lifecycle row for a runner result (Amendment A.5):
 * `phase_completed` on success (build includes the slide count), `phase_stopped`
 * on user cancel, `phase_failed` on a transport error, and `phase_failed` (rather
 * than a bogus "ready" label) when the phase ended `done` with no deliverable.
 * A `waiting_user` suspend emits nothing — the phase is still alive (the running
 * `ask` row is the spinner).
 */
function emitPhaseTerminal(
  emitter: ReturnType<typeof createActivityEmitter>,
  status: PhaseTerminalStatus,
  opts: { error?: string; slideCount?: number; noDeliverable?: string }
): void {
  switch (status) {
    case 'error':
      emitter.phaseFailed(opts.error ?? '');
      break;
    case 'cancelled':
      emitter.phaseStopped();
      break;
    case 'waiting_user':
      break;
    case 'plan_ready':
    case 'ready':
      emitter.phaseCompleted(
        opts?.slideCount != null ? { slideCount: opts.slideCount } : undefined
      );
      break;
    case 'done':
      emitter.phaseFailed(opts.noDeliverable ?? '');
      break;
  }
}

function mapResult(
  result: AgentSessionResult,
  files: import('../types/slides.ts').SlideFile[],
  canvasChoice: string | undefined,
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
      // Single readiness source for plan: both /brief.md + /design.md non-empty.
      // submit_plan alone must not mark plan_ready (Build CTA also requires files).
      return {
        ...base,
        status: hasValidPlanFiles(files) ? 'plan_ready' : 'done',
        content: result.content,
        // Persist the conversation (minus the leading system message) so a
        // follow-up re-plan continues the same context.
        transcript: stripSystemMessage(result.messages),
      };
  }
}

/** Drop the leading `role: 'system'` message from a session transcript. */
function stripSystemMessage(messages: APIMessage[]): APIMessage[] {
  if (messages.length > 0 && messages[0].role === 'system') {
    return messages.slice(1);
  }
  return messages;
}

function buildPendingAsk(toolCall: ToolCall): SlidePendingAsk {
  const parsed = args<AskArgs>(toolCall);
  const now = Date.now();
  const payload =
    normalizeAskPayload(parsed) ??
    // Fallback so a malformed/empty call still suspends with a usable prompt.
    normalizeAskPayload({ question: 'Could you clarify?' })!;
  return {
    id: `ask_${now}_${Math.random().toString(36).slice(2, 7)}`,
    toolCallId: toolCall.id,
    sessionRef: 'plan' as SlidePhase,
    payload,
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

/** Last vision encode per VFS path so repeated read_file does not re-canvas. */
const visionReadCache = new Map<string, { source: string; encoded: string }>();

export function imageReadBlockedMessage(path: string): string {
  return (
    `Error: Cannot view ${path}. The active model is not multimodal, so read_file cannot return image pixels. ` +
    `The file remains at ${path}. Do not paste a data URL into HTML/CSS. ` +
    `Only reference this path in slide markup if the user asked you to use this file on the deck.`
  );
}

/** Read one file's content, or a Codex-style error string when missing. */
async function readFile(
  files: import('../types/slides.ts').SlideFile[],
  path?: string,
  sendImageParts = true,
): Promise<string> {
  if (!path) return 'Error: read_file requires a "path" argument.';
  const file = getSlideFile(files, path);
  if (!file) return `Error: File not found: ${path}`;
  if (attachmentKindFromPath(path, file.content) === 'image') {
    if (!sendImageParts) return imageReadBlockedMessage(path);
    if (!file.content.startsWith('data:image/')) return file.content;
    const hit = visionReadCache.get(path);
    if (hit && hit.source === file.content) return hit.encoded;
    try {
      const encoded = (await encodeImageForVisionDataUrl(file.content)).dataUrl;
      visionReadCache.set(path, { source: file.content, encoded });
      return encoded;
    } catch {
      return file.content;
    }
  }
  return file.content;
}

async function dispatchLoadSkill(
  toolCall: ToolCall,
  round: number,
  phase: SlidePhaseKey,
  params: { skillFetcher?: SlideSkillFetcher; skillBaseUrl?: string },
  emitter: ReturnType<typeof createActivityEmitter>,
  loadedSkills: Set<string>,
): Promise<AgentToolDispatch> {
  const row = emitter.started(toolCall, round);
  const name = args<{ name?: string }>(toolCall).name;
  if (!name?.trim()) {
    const content = 'Error: load_skill requires a "name" argument.';
    emitter.failed(row, content);
    return { content };
  }
  const content = await loadSlideSkillResource(phase, name, {
    ...(params.skillFetcher ? { fetcher: params.skillFetcher } : {}),
    ...(params.skillBaseUrl ? { baseUrl: params.skillBaseUrl } : {}),
    alreadyLoaded: loadedSkills,
  });
  if (content.startsWith('Error:')) emitter.failed(row, content);
  else emitter.complete(row);
  return { content };
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
    enableGrokWebSearch: toolOptions?.enableGrokWebSearch,
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

/**
 * Dispatch an external tool call (google_search / MCP) while emitting a
 * `tool_started` running row and patching it to completed/failed on the result
 * (Amendment A.6). A content prefixed `Error:` is treated as a failed tool.
 */
function emitExternalActivity(
  params: {
    toolOptions?: SlideToolOptions;
  },
  emitter: ReturnType<typeof createActivityEmitter>,
  toolCall: ToolCall,
  round: number
): Promise<AgentToolDispatch> {
  const row = emitter.started(toolCall, round);
  return dispatchExternal(params.toolOptions, toolCall).then((dispatch) => {
    if (dispatch.content?.startsWith('Error:')) emitter.failed(row, dispatch.content);
    else emitter.complete(row);
    return dispatch;
  });
}