// ==================== Reusable agent session runner ====================
// Runs an isolated, multi-round model+tool loop over the existing CHAT_REQUEST
// transport (options.stream forced to `false`, so the background returns the
// full turn — content + toolCalls — in one sendResponse).
//
// Generic by design: phase runners (plan/build/edit) supply the tool schemas
// and a `dispatchTool` that resolves each model tool call client-side. It is
// NOT aware of slide-specific paths — it only:
//   - injects a leading system message,
//   - walks the tool loop until the model stops calling tools or maxRounds,
//   - special-cases a `suspended` dispatch to halt with status `waiting_user`,
//   - honours an AbortSignal / STOP_STREAM abort between turns.
//
// Reuses the shared APIMessage / MCPTool / ProviderConfig / ToolCall types and
// the SlidePendingAsk / SlideAskPayload shapes — it does not fork its own
// message/phase model.

import type { APIMessage, MCPTool, ProviderConfig, ToolCall } from '../types/index.ts';
import type { SlidePendingAsk } from '../types/slides.ts';

// ==================== Public types ====================

/** The slice of a CHAT_REQUEST response the agent loop reads. */
export interface AgentChatResponse {
  error?: string;
  content?: string;
  reasoning_content?: string;
  reasoning_signature?: string;
  toolCalls?: ToolCall[];
}

/** Result of dispatching one model tool call within the loop. */
export interface AgentToolDispatch {
  /** Tool-result body fed back to the model on the next turn. Empty for `ask`. */
  content?: string;
  /** True when the tool should suspend the whole session (HITL `ask`). */
  suspended?: boolean;
  /** Structured question surfaced when `suspended` (drives the AskPrompt UI). */
  pendingAsk?: SlidePendingAsk;
}

/** Resolves a single CHAT_REQUEST round-trip. Injected for tests. */
export type AgentTransport = (request: {
  type: 'CHAT_REQUEST';
  messages: APIMessage[];
  providerConfig: ProviderConfig;
  tools: MCPTool[];
  options: Record<string, unknown>;
  requestId: string;
}) => Promise<AgentChatResponse>;

/** Aborts an in-flight CHAT_REQUEST by requestId (sends STOP_STREAM). */
export type AgentAbortFn = (requestId: string) => void;

export type AgentSessionStatus = 'running' | 'waiting_user' | 'done' | 'error' | 'cancelled';

/** A state snapshot — published via onUpdate and used as the terminal result. */
export interface AgentSessionState<S extends AgentSessionStatus = AgentSessionStatus> {
  status: S;
  /** Full working transcript (system + user + assistant + tool turns so far). */
  messages: APIMessage[];
  /** Number of model turns performed (including any part of the current turn). */
  rounds: number;
  /** Final assistant content (done). */
  content?: string;
  /** Structured question for `waiting_user`. */
  pendingAsk?: SlidePendingAsk;
  /** Failure message for `error`. */
  error?: string;
}

export type AgentSessionResult =
  | AgentSessionState<'done'>
  | AgentSessionState<'waiting_user'>
  | AgentSessionState<'error'>
  | AgentSessionState<'cancelled'>;

/** Starting messages and round to continue from after a `waiting_user` pause. */
export interface AgentSessionResume {
  messages: APIMessage[];
  /** The round number recorded on the paused `waiting_user` state. */
  round: number;
}

export interface AgentSessionParams {
  /** Injected as the leading system message (the phase skill). */
  systemPrompt: string;
  /** Initial (isolated) message history — NOT coupled to the main chat store. */
  messages: APIMessage[];
  /** Tool schemas offered to the model this round (resolved per-phase). */
  tools: MCPTool[];
  providerConfig: ProviderConfig;
  /** Base chat options; the runner forces `stream: false`. */
  chatOptions: Record<string, unknown>;
  /** Cap on model turns. Defaults to {@link DEFAULT_SLIDE_MAX_ROUNDS}. */
  maxRounds?: number;
  /** Prefix for generated CHAT_REQUEST requestIds. */
  requestIdPrefix?: string;
  /** When aborted, the loop stops between turns and aborts the in-flight call. */
  signal?: AbortSignal;
  /** Resolves each model tool call client-side. See {@link AgentToolDispatch}. */
  dispatchTool: (toolCall: ToolCall) => Promise<AgentToolDispatch>;
  /** Optional live-state hook (UI wiring). */
  onUpdate?: (state: AgentSessionState) => void;  /** CHAT_REQUEST transport (injectable for tests). Defaults to chrome.runtime. */
  transport?: AgentTransport;
  /** Abort in-flight request (injectable for tests). Defaults to STOP_STREAM. */
  abortRequest?: AgentAbortFn;
}

// ==================== Defaults / transport ====================

export const DEFAULT_SLIDE_MAX_ROUNDS = 12;

const defaultTransport: AgentTransport = (request) =>
  chrome.runtime.sendMessage(request) as Promise<AgentChatResponse>;

const defaultAbort: AgentAbortFn = (requestId) => {
  void chrome.runtime.sendMessage({ type: 'STOP_STREAM', requestId });
};

// ==================== Runner ====================

/**
 * Run an isolated agent session to completion, suspension, error, or abort.
 *
 * If any dispatch returns `suspended: true` (the HITL `ask`), the loop halts at
 * the current turn and resolves with `status: 'waiting_user'` + `pendingAsk`.
 * Resume later via {@link resumeAgentSession} with that state's `messages` and
 * the user's answer appended as a `role: 'tool'` message.
 */
export function runAgentSession(params: AgentSessionParams): Promise<AgentSessionResult> {
  const working: APIMessage[] = [];
  if (params.systemPrompt.trim()) {
    working.push({ role: 'system', content: params.systemPrompt });
  }
  working.push(...params.messages);
  return runLoop(params, working, 1);
}

/** Continue a previously suspended (`waiting_user`) session. */
export function resumeAgentSession(
  params: AgentSessionParams,
  resume: AgentSessionResume
): Promise<AgentSessionResult> {
  return runLoop(params, resume.messages, resume.round);
}

/** Shared loop core — parametrised by the starting transcript + round. */
async function runLoop(
  params: AgentSessionParams,
  working: APIMessage[],
  startRound: number
): Promise<AgentSessionResult> {
  const transport = params.transport ?? defaultTransport;
  const abortRequest = params.abortRequest ?? defaultAbort;
  const signal = params.signal;
  const maxRounds = params.maxRounds ?? DEFAULT_SLIDE_MAX_ROUNDS;
  const prefix = params.requestIdPrefix ?? 'agent';

  let activeRequestId: string | undefined;
  const onAbort = () => {
    if (activeRequestId) abortRequest(activeRequestId);
  };
  if (signal) {
    if (signal.aborted) return cancel(params, working, startRound);
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    for (let round = startRound; round <= maxRounds; round++) {
      if (signal?.aborted) return cancel(params, working, round);

      const requestId = `${prefix}_${round}_${Date.now().toString(36)}`;
      const response = await transport({
        type: 'CHAT_REQUEST',
        messages: working,
        providerConfig: params.providerConfig,
        tools: params.tools,
        options: { ...params.chatOptions, stream: false },
        requestId,
      });

      if (signal?.aborted) return cancel(params, working, round);

      if (response?.error) {
        return finish(params, working, round, {
          status: 'error',
          error: response.error,
        });
      }

      // Assistant turn — echo content + reasoning + tool calls back into context.
      if (response.content || response.toolCalls?.length) {
        working.push({
          role: 'assistant',
          content: response.content ?? '',
          ...(response.toolCalls?.length ? { toolCalls: response.toolCalls } : {}),
          ...(response.reasoning_content
            ? { reasoningContent: response.reasoning_content }
            : {}),
        });
      }

      // No more tool calls → clean completion.
      if (!response.toolCalls?.length) {
        return finish(params, working, round, {
          status: 'done',
          content: response.content ?? '',
        });
      }

      // Tool turn(s) — resolve each call client-side.
      for (const toolCall of response.toolCalls) {
        if (signal?.aborted) return cancel(params, working, round);

        activeRequestId = requestId;
        const dispatch = await params.dispatchTool(toolCall);

        if (dispatch.suspended) {
          activeRequestId = undefined;
          return finish(params, working, round, {
            status: 'waiting_user',
            pendingAsk: dispatch.pendingAsk,
          });
        }

        working.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: dispatch.content ?? '',
        });
      }
      activeRequestId = undefined;
    }
  } finally {
    activeRequestId = undefined;
    signal?.removeEventListener('abort', onAbort);
  }

  // Max rounds reached without a clean done — surface the partial transcript.
  return finish(params, working, maxRounds, { status: 'done' });
}

/** Extra terminal fields carried on the result state. */
interface AgentSessionTerminal {
  status: 'done' | 'waiting_user' | 'error' | 'cancelled';
  content?: string;
  pendingAsk?: SlidePendingAsk;
  error?: string;
}

/** Build the terminal state, publish it, and return it. */
function finish<S extends AgentSessionStatus>(
  params: AgentSessionParams,
  working: APIMessage[],
  round: number,
  extra: AgentSessionTerminal
): AgentSessionState<S> {
  const state: AgentSessionState<S> = {
    status: extra.status as S,
    messages: working.slice(),
    rounds: round,
    ...(extra.content != null ? { content: extra.content } : {}),
    ...(extra.pendingAsk ? { pendingAsk: extra.pendingAsk } : {}),
    ...(extra.error ? { error: extra.error } : {}),
  };
  params.onUpdate?.(state);
  return state;
}

/** Cancel path — shares the terminal-state plumbing with `finish`. */
function cancel(
  params: AgentSessionParams,
  working: APIMessage[],
  round: number
): AgentSessionState<'cancelled'> {
  return finish<'cancelled'>(params, working, round, { status: 'cancelled' });
}
