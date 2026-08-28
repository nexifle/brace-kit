// ==================== Reusable agent session runner ====================
// Runs an isolated, multi-round model+tool loop over the existing CHAT_REQUEST
// transport. The default transport STREAMS (Amendment A.4): it sends
// `options.stream: true` and feeds the background's broadcast
// CHAT_STREAM_CHUNK hunks back through the injected `onDelta` callback so
// phase runners can paint `streamingText`/`streamingReasoning` live, then
// resolves with the assembled turn ({content, toolCalls}) on CHAT_STREAM_DONE.
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
import { DEFAULT_SLIDE_AGENT_MAX_ROUNDS } from '../types/slides.ts';
import {
  DEFAULT_AGENT_CONTEXT,
  buildAgentSummarizationPlan,
  capToolResult,
  combineAgentCompactSummary,
  shouldCompact,
  workingFromSummary,
  type AgentContextOptions,
} from './agentContext.ts';


// ==================== Public types ====================

/** The slice of a CHAT_REQUEST response the agent loop reads. */
export interface AgentChatResponse {
  error?: string;
  content?: string;
  reasoning_content?: string;
  reasoning_signature?: string;
  toolCalls?: ToolCall[];
  backendItems?: Record<string, unknown>[];
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
  /**
   * True when the loop hit maxRounds without a clean tool-free finish.
   * Callers must not treat this as a successful deliverable by itself.
   */
  truncated?: boolean;
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
  /** Base chat options; the runner streams by default (`stream: true` unless `stream: false`, Amendment A.4). */
  chatOptions: Record<string, unknown>;
  /**
   * Stream the model turn (`options.stream: true` via the default transport).
   * Defaults to `true` — Amendment A.4 makes streaming the production path for
   * phase turns; `false` selects the plain full-turn transport instead.
   */
  stream?: boolean;
  /**
   * Per-chunk callback for streaming deltas (text + reasoning), invoked by the
   * default streaming transport as the background broadcasts CHAT_STREAM_CHUNK.
   * Wire this to `appendStreamingText`/`appendStreamingReasoning` in the store.
   */
  onDelta?: (delta: StreamDelta) => void;
  /** Cap on model turns. Defaults to {@link DEFAULT_SLIDE_MAX_ROUNDS}. */
  maxRounds?: number;
  /** Prefix for generated CHAT_REQUEST requestIds. */
  requestIdPrefix?: string;
  /** When aborted, the loop stops between turns and aborts the in-flight call. */
  signal?: AbortSignal;
  /** Resolves each model tool call client-side. `round` is the 1-based model turn. See {@link AgentToolDispatch}. */
  dispatchTool: (toolCall: ToolCall, round: number) => Promise<AgentToolDispatch>;
  /** Optional live-state hook (UI wiring). */
  onUpdate?: (state: AgentSessionState) => void;
  /**
   * Called before each model CHAT_REQUEST turn begins (the 1-based round).
   * Phase runners use this to emit a `model_round_started` activity row
   * (Amendment A.5/A.8) so the feed shows a thinking spinner while streaming.
   */
  onRoundStart?: (round: number) => void;
  /**
   * Called when a model turn finishes (success, error, or cancel of that round).
   * `response` is set when the transport returned a payload (may include reasoning).
   */
  onRoundComplete?: (round: number, response?: AgentChatResponse) => void;
  /**
   * Called after a successful context compact (`workingFromSummary` applied).
   * Phase runners use this to clear per-session caches that mirror dropped tool
   * results (e.g. loaded `load_skill` ids). Not called when compact fails.
   */
  onCompact?: () => void;
  /** CHAT_REQUEST transport (injectable for tests). Defaults to chrome.runtime. */

  transport?: AgentTransport;
  /** Abort in-flight request (injectable for tests). Defaults to STOP_STREAM. */
  abortRequest?: AgentAbortFn;
  /**
   * Cache-safe context bounds. Tool results are capped at ingest; a compact
   * request fires only when the working transcript exceeds `charBudget`.
   */
  agentContext?: Partial<AgentContextOptions>;
}

// ==================== Defaults / transport ====================

/** Alias kept for existing call sites / docs. */
export const DEFAULT_SLIDE_MAX_ROUNDS = DEFAULT_SLIDE_AGENT_MAX_ROUNDS;

/** A streaming delta for one model turn (Amendment A.4). */
export interface StreamDelta {
  /** Assistant content appended so far this turn. */
  text?: string;
  /** Reasoning content appended so far this turn (if provider emits it). */
  reasoning?: string;
}

/** Minimal chrome.runtime surface the streaming transport needs (so it's testable). */
export interface ChromeRuntimeLike {
  sendMessage: (message: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (listener: (message: unknown) => void) => void;
    removeListener: (listener: (message: unknown) => void) => void;
  };
}

const defaultRuntime: ChromeRuntimeLike = {
  sendMessage: (message) => chrome.runtime.sendMessage(
    message as Parameters<typeof chrome.runtime.sendMessage>[0]
  ) as Promise<unknown>,
  onMessage: {
    addListener: (listener) => chrome.runtime.onMessage.addListener(listener as never),
    removeListener: (listener) => chrome.runtime.onMessage.removeListener(listener as never),
  },
};

/**
 * Streaming CHAT_REQUEST transport (Amendment A.4). Sends the request with
 * `options.stream: true` and, from the background's broadcast
 * CHAT_STREAM_CHUNK / CHAT_STREAM_DONE / CHAT_STREAM_ERROR messages (matched
 * by requestId), feeds each text/reasoning hunk through `onDelta` and resolves
 * the promise with the assembled turn on `CHAT_STREAM_DONE` (or an error).
 *
 * The `sendMessage` promise resolves `{started:true}` for a stream (no content,
 * so it does NOT settle — the transport waits for CHAT_STREAM_DONE), but also
 * resolves with a terminal payload for pre-stream errors (missing API key,
 * fetch failure, request cancelled on abort) and for non-stream requests. Both
 * a terminal sendResponse and a DONE/ERROR broadcast settle, so the transport
 * works whether or not the stream ever starts.
 */
export function createStreamingTransport(
  runtime: ChromeRuntimeLike,
  onDelta?: (delta: StreamDelta) => void
): AgentTransport {
  return (request) =>
    new Promise<AgentChatResponse>((resolve) => {
      let settled = false;
      // Providers sometimes stream reasoning only as CHAT_STREAM_CHUNK and omit
      // it on DONE — keep a local join so round footers / Thought rows still get body.
      let reasoningAccum = '';
      const removeListener = () => runtime.onMessage.removeListener(onMessage);
      const settle = (response: AgentChatResponse) => {
        if (settled) return;
        settled = true;
        removeListener();
        const reasoning =
          (response.reasoning_content && response.reasoning_content.trim()) ||
          reasoningAccum.trim() ||
          undefined;
        resolve(
          reasoning
            ? { ...response, reasoning_content: reasoning }
            : response,
        );
      };

      const onMessage = (message: unknown) => {
        const msg = message as Record<string, unknown>;
        if (msg?.requestId !== request.requestId) return;
        if (msg.type === 'CHAT_STREAM_CHUNK') {
          const chunk = (msg.content as string) ?? '';
          if (msg.chunkType === 'reasoning') {
            reasoningAccum += chunk;
            onDelta?.({ reasoning: chunk });
          } else if (msg.chunkType === 'hosted_web_search') {
            // Server-side search; not assistant text.
          } else {
            onDelta?.({ text: chunk });
          }
        } else if (msg.type === 'CHAT_STREAM_DONE') {
          const doneReasoning =
            typeof msg.reasoningContent === 'string' ? msg.reasoningContent : '';
          settle({
            content: (msg.fullContent as string) ?? '',
            ...(doneReasoning || reasoningAccum
              ? { reasoning_content: doneReasoning || reasoningAccum }
              : {}),
            ...(msg.reasoningSignature != null
              ? { reasoning_signature: msg.reasoningSignature as string }
              : {}),
            ...(Array.isArray(msg.toolCalls) && msg.toolCalls.length
              ? { toolCalls: msg.toolCalls as ToolCall[] }
              : {}),
            ...(Array.isArray(msg.backendItems) && msg.backendItems.length
              ? { backendItems: msg.backendItems as Record<string, unknown>[] }
              : {}),
          });
        } else if (msg.type === 'CHAT_STREAM_ERROR') {
          settle({ error: (msg.error as string) ?? 'Stream failed' });
        }
      };

      runtime.onMessage.addListener(onMessage);
      runtime
        .sendMessage(request)
        .then((response) => {
          const res = response as AgentChatResponse;
          // Non-stream (or pre-stream error) responses carry terminal data; the
          // streaming path resolves via CHAT_STREAM_DONE instead.
          if (res && (res.error != null || res.content !== undefined || res.toolCalls?.length)) {
            settle(res);
          }
        })
        .catch((e: unknown) => {
          settle({ error: (e as Error)?.message ?? 'Request failed' });
        });
    });
}


/** Plain full-turn transport used only when a caller opts out of streaming. */
const plainChatTransport: AgentTransport = (request) =>
  defaultRuntime.sendMessage(request).then((response) => response as AgentChatResponse);

/** Choose the production transport: streaming by default (Amendment A.4). */
function buildDefaultTransport(params: AgentSessionParams): AgentTransport {
  if (params.stream === false) return plainChatTransport;
  return createStreamingTransport(defaultRuntime, params.onDelta);
}

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

/** Force-compact a working transcript (slash `/compact` and the in-loop budget path). */
export async function compactAgentWorking(
  working: APIMessage[],
  opts: {
    transport: AgentTransport;
    providerConfig: ProviderConfig;
    chatOptions: Record<string, unknown>;
    customInstructions?: string;
    requestIdPrefix?: string;
    keepRecentTokens?: number;
    signal?: AbortSignal;
    onRequestId?: (id: string | undefined) => void;
  },
): Promise<{ ok: true; messages: APIMessage[] } | { ok: false }> {
  if (opts.signal?.aborted) return { ok: false };
  const plan = buildAgentSummarizationPlan(
    working,
    opts.keepRecentTokens,
    opts.customInstructions,
  );
  if (!plan) return { ok: false };
  const prefix = opts.requestIdPrefix ?? 'agent';
  const compactId = `${prefix}_compact_${Date.now().toString(36)}`;
  opts.onRequestId?.(compactId);
  const compactResponse = await opts.transport({
    type: 'CHAT_REQUEST',
    messages: plan.history,
    providerConfig: opts.providerConfig,
    tools: [],
    options: { ...opts.chatOptions, stream: false },
    requestId: compactId,
  });
  let summaryText = compactResponse.content?.trim();
  const historyOk =
    !compactResponse.error && !compactResponse.toolCalls?.length && Boolean(summaryText);
  if (historyOk && plan.prefix) {
    const prefixId = `${compactId}_prefix`;
    opts.onRequestId?.(prefixId);
    const prefixResponse = await opts.transport({
      type: 'CHAT_REQUEST',
      messages: plan.prefix,
      providerConfig: opts.providerConfig,
      tools: [],
      options: { ...opts.chatOptions, stream: false },
      requestId: prefixId,
    });
    const prefixText = prefixResponse.content?.trim();
    if (prefixResponse.error || prefixResponse.toolCalls?.length || !prefixText) {
      summaryText = undefined;
    } else {
      summaryText = combineAgentCompactSummary(summaryText!, prefixText);
    }
  }
  opts.onRequestId?.(undefined);
  if (!historyOk || !summaryText) return { ok: false };
  return { ok: true, messages: workingFromSummary(working, summaryText) };
}

/** Shared loop core — parametrised by the starting transcript + round. */
async function runLoop(
  params: AgentSessionParams,
  working: APIMessage[],
  startRound: number
): Promise<AgentSessionResult> {
  const transport = params.transport ?? buildDefaultTransport(params);
  const abortRequest = params.abortRequest ?? defaultAbort;
  const signal = params.signal;
  const maxRounds = params.maxRounds ?? DEFAULT_SLIDE_MAX_ROUNDS;
  const prefix = params.requestIdPrefix ?? 'agent';
  const ctx: AgentContextOptions = {
    ...DEFAULT_AGENT_CONTEXT,
    ...params.agentContext,
  };
  let compactFailures = 0;

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

      if (shouldCompact(working, ctx.charBudget) && compactFailures < 3) {
        const compacted = await compactAgentWorking(working, {
          transport,
          providerConfig: params.providerConfig,
          chatOptions: params.chatOptions,
          requestIdPrefix: `${prefix}_compact_${round}`,
          signal,
          onRequestId: (id) => {
            activeRequestId = id;
          },
        });
        if (compacted.ok) {
          working.length = 0;
          working.push(...compacted.messages);
          params.onCompact?.();
        } else {
          compactFailures += 1;
        }
        activeRequestId = undefined;
        if (signal?.aborted) return cancel(params, working, round);
      }

      params.onRoundStart?.(round);

      const requestId = `${prefix}_${round}_${Date.now().toString(36)}`;
      // Keep the requestId active across the (possibly streaming) model turn AND
      // the tool dispatches so an abort can STOP_STREAM the in-flight stream.
      activeRequestId = requestId;
      const response = await transport({
        type: 'CHAT_REQUEST',
        messages: working,
        providerConfig: params.providerConfig,
        tools: params.tools,
        options: { ...params.chatOptions, stream: params.stream !== false },
        requestId,
      });

      if (signal?.aborted) {
        params.onRoundComplete?.(round, response);
        return cancel(params, working, round);
      }

      if (response?.error) {
        params.onRoundComplete?.(round, response);
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
          ...(response.backendItems?.length
            ? { backendItems: response.backendItems }
            : {}),
        });
      }

      // No more tool calls → clean completion.
      if (!response.toolCalls?.length) {
        params.onRoundComplete?.(round, response);
        return finish(params, working, round, {
          status: 'done',
          content: response.content ?? '',
        });
      }

      // Tool turn(s) — resolve each call client-side.
      for (const toolCall of response.toolCalls) {
        if (signal?.aborted) {
          params.onRoundComplete?.(round, response);
          return cancel(params, working, round);
        }

        activeRequestId = requestId;
        const dispatch = await params.dispatchTool(toolCall, round);

        if (dispatch.suspended) {
          activeRequestId = undefined;
          params.onRoundComplete?.(round, response);
          return finish(params, working, round, {
            status: 'waiting_user',
            pendingAsk: dispatch.pendingAsk,
          });
        }

        working.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: capToolResult(dispatch.content ?? '', ctx.toolResultCap),
        });
      }
      activeRequestId = undefined;
      params.onRoundComplete?.(round, response);
    }
  } finally {
    activeRequestId = undefined;
    signal?.removeEventListener('abort', onAbort);
  }

  // Max rounds reached without a clean done — partial work only.
  return finish(params, working, maxRounds, {
    status: 'done',
    truncated: true,
    content: `Hit the model-round limit (${maxRounds} rounds) before the agent finished. Partial workspace was kept.`,
  });
}

/** Extra terminal fields carried on the result state. */
interface AgentSessionTerminal {
  status: 'done' | 'waiting_user' | 'error' | 'cancelled';
  content?: string;
  pendingAsk?: SlidePendingAsk;
  error?: string;
  truncated?: boolean;
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
    ...(extra.truncated ? { truncated: true } : {}),
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
