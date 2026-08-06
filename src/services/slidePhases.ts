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
  type AgentAbortFn,
  type AgentSessionResult,
  type AgentSessionState,
  type AgentToolDispatch,
  type AgentTransport,
} from './agentSession.ts';
import {
  applyPatchOperation,
  type SlidePatchOperation,
} from './applyPatchHarness.ts';
import { getSlideFile } from '../utils/slideVfs.ts';
import { getToolsForPhase } from './slideTools.ts';

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

/** Options for running the plan phase. */
export interface PlanPhaseParams {
  /** Phase skill text injected as the isolated session's system prompt. */
  systemPrompt: string;
  /** Isolated session messages (e.g. the user's initial deck prompt). */
  messages: APIMessage[];
  providerConfig: ProviderConfig;
  /** Base chat options; `stream` is forced false by the session runner. */
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
 */
export async function runPlanPhase(
  params: PlanPhaseParams
): Promise<PlanPhaseResult> {
  // A live, mutable copy of the VFS captured by the dispatcher closure.
  const currentFiles = params.files.slice();
  const onFilesChange = params.onFilesChange;

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
          onFilesChange?.(currentFiles);
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
      default:
        return { content: `Error: Unknown plan-phase tool: ${toolCall.name}` };
    }
  };

  const result = await runAgentSession({
    systemPrompt: params.systemPrompt,
    messages: params.messages,
    tools: params.tools ?? getToolsForPhase('plan'),
    providerConfig: params.providerConfig,
    chatOptions: params.chatOptions ?? {},
    maxRounds: params.maxRounds,
    signal: params.signal,
    transport: params.transport,
    abortRequest: params.abortRequest,
    onUpdate: params.onUpdate,
    dispatchTool,
  });

  return mapResult(result, currentFiles, submit.fired, submit.canvas);
}

/** Map the runner's terminal session state onto the plan-phase result. */
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
