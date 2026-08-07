import type {
  SlideActivityEvent,
  SlideMainMessage,
  SlidePhase,
  SlideSessionStatus,
} from '../types/slides.ts';
import { isStreamingAgentActive } from './slideStreaming.ts';

/* ==================================================================== */
/* Presentation model (v0-style chat parts; derived each render)         */
/* ==================================================================== */

export type SlideChatItem =
  | { type: 'user'; id: string; content: string; ts?: number }
  | {
      type: 'reasoning';
      id: string;
      durationMs?: number;
      content?: string;
      live?: boolean;
    }
  | { type: 'prose'; id: string; content: string; live?: boolean }
  | { type: 'action'; id: string; event: SlideActivityEvent }
  | {
      type: 'file_card';
      id: string;
      label: string;
      paths: string[];
      op?: 'create_file' | 'update_file' | 'delete_file';
      detail?: string;
      eventIds: string[];
      status: SlideActivityEvent['status'];
    }
  | { type: 'group'; id: string; title: string; children: SlideChatItem[] }
  | {
      type: 'turn_footer';
      id: string;
      durationMs: number;
      actionCount: number;
      fileCount: number;
      /** create / update / delete path counts in the phase window */
      filesCreated: number;
      filesUpdated: number;
      filesDeleted: number;
      /** Completed model rounds in the window */
      roundCount: number;
      /** Unique tool names invoked (tool_started) */
      toolNames: string[];
      phaseLabel: string;
      status: 'completed' | 'failed' | 'cancelled';
      /** Provider model id/label when known */
      modelLabel?: string;
      endedAt?: number;
    }
  | { type: 'error'; id: string; content: string }
  | { type: 'phase_eyebrow'; id: string; label: string }
  | { type: 'ask_card' }
  | { type: 'plan_card' };

export interface BuildSlideChatItemsInput {
  messages: SlideMainMessage[];
  activity: SlideActivityEvent[];
  streamingText?: string;
  streamingReasoning?: string;
  sessionStatus: SlideSessionStatus;
  phase: SlidePhase;
  pendingAsk: boolean;
  /** When true (default), append plan_card if phase is plan_ready and no ask. */
  showPlanCard?: boolean;
  /** Active model label for turn footers (e.g. gpt-4o). */
  modelLabel?: string;
}

const OMIT_AS_ROW: Partial<Record<SlideActivityEvent['type'], true>> = {
  connecting: true,
  assistant_delta: true,
  preview_updated: true,
  info: true,
  // model_round_* handled specially → durable "Thought for Ns" rows
  // file ops render as file_card; apply_patch tool row is redundant when
  // file_written/file_deleted follow — still show tool rows for non-file tools.
};


const TERMINAL_PHASE: Partial<Record<SlideActivityEvent['type'], true>> = {
  phase_completed: true,
  phase_failed: true,
  phase_stopped: true,
};

const PHASE_EYEBROW: Record<'plan' | 'build' | 'edit', string> = {
  plan: 'Planning',
  build: 'Building',
  edit: 'Editing',
};

function isUserFacingMessage(m: SlideMainMessage): boolean {
  return m.role === 'user' || m.role === 'ask';
}

function isProseMessage(m: SlideMainMessage): boolean {
  return m.role === 'summary' || m.role === 'assistant' || m.role === 'system';
}

function isErrorMessage(m: SlideMainMessage): boolean {
  return m.role === 'error';
}

function formatDurationMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

/**
 * Count actions/files/rounds inside a phase window [start, endInclusive].
 * Actions = tool_started + ask_started (user-meaningful steps).
 * Files = unique paths from file_written/file_deleted, with op breakdown.
 */
export interface PhaseWindowStats {
  actionCount: number;
  fileCount: number;
  filesCreated: number;
  filesUpdated: number;
  filesDeleted: number;
  roundCount: number;
  toolNames: string[];
}

export function countPhaseStats(
  activity: SlideActivityEvent[],
  start: number,
  endInclusive: number,
): PhaseWindowStats {
  let actionCount = 0;
  let roundCount = 0;
  const files = new Map<string, 'create_file' | 'update_file' | 'delete_file'>();
  const tools = new Set<string>();

  for (let i = start; i <= endInclusive; i++) {
    const ev = activity[i];
    if (!ev) continue;

    if (ev.type === 'tool_started' || ev.type === 'ask_started') {
      actionCount += 1;
    }
    if (ev.type === 'tool_started' && ev.toolName) {
      tools.add(ev.toolName);
    }
    // Completed rounds only (running open round is not "done" work).
    if (
      (ev.type === 'model_round_started' || ev.type === 'model_round_completed') &&
      ev.status === 'completed'
    ) {
      roundCount += 1;
    }
    if (
      (ev.type === 'file_written' || ev.type === 'file_deleted') &&
      ev.path
    ) {
      const op: 'create_file' | 'update_file' | 'delete_file' =
        ev.patchOp ??
        (ev.type === 'file_deleted' ? 'delete_file' : 'update_file');
      // Last write wins for op classification of a path.
      files.set(ev.path, op);
    }
  }

  let filesCreated = 0;
  let filesUpdated = 0;
  let filesDeleted = 0;
  for (const op of files.values()) {
    if (op === 'create_file') filesCreated += 1;
    else if (op === 'delete_file') filesDeleted += 1;
    else filesUpdated += 1;
  }

  return {
    actionCount,
    fileCount: files.size,
    filesCreated,
    filesUpdated,
    filesDeleted,
    roundCount,
    toolNames: [...tools],
  };
}

function fileCardFromEvent(ev: SlideActivityEvent): Extract<SlideChatItem, { type: 'file_card' }> {
  const op =
    ev.patchOp ??
    (ev.type === 'file_deleted' ? 'delete_file' : 'update_file');
  return {
    type: 'file_card',
    id: `file_${ev.id}`,
    label: ev.label,
    paths: ev.path ? [ev.path] : [],
    op,
    detail: ev.detail,
    eventIds: [ev.id],
    status: ev.status,
  };
}

/** Map one activity event to zero-or-more chat items (excluding phase terminals). */
function mapActivityEvent(ev: SlideActivityEvent): SlideChatItem[] {
  if (OMIT_AS_ROW[ev.type] || TERMINAL_PHASE[ev.type]) return [];
  if (ev.type === 'model_round_started' || ev.type === 'model_round_completed') {
    return [];
  }
  if (ev.type === 'phase_started') {
    return [
      {
        type: 'phase_eyebrow',
        id: `eyebrow_${ev.id}`,
        label: PHASE_EYEBROW[ev.phase] ?? ev.label,
      },
    ];
  }
  if (ev.type === 'file_written' || ev.type === 'file_deleted') {
    return [fileCardFromEvent(ev)];
  }
  if (
    ev.type === 'tool_started' ||
    ev.type === 'tool_finished' ||
    ev.type === 'ask_started' ||
    ev.type === 'ask_answered'
  ) {
    return [{ type: 'action', id: `action_${ev.id}`, event: ev }];
  }
  return [{ type: 'action', id: `action_${ev.id}`, event: ev }];
}

/**
 * Deduplicate tool_started + tool_finished that share the same event id
 * (in-place status patch). Keep the latest occurrence of each id.
 */
function collapsePatchedToolRows(events: SlideActivityEvent[]): SlideActivityEvent[] {
  const byId = new Map<string, SlideActivityEvent>();
  const order: string[] = [];
  for (const ev of events) {
    if (!byId.has(ev.id)) order.push(ev.id);
    byId.set(ev.id, ev);
  }
  return order.map((id) => byId.get(id)!);
}

function turnFooterFromTerminal(
  terminal: SlideActivityEvent,
  windowStart: number,
  activity: SlideActivityEvent[],
  terminalIndex: number,
  modelLabel?: string,
): SlideChatItem[] {
  const stats = countPhaseStats(activity, windowStart, terminalIndex);
  const startTs = activity[windowStart]?.ts ?? terminal.ts;
  const durationMs = formatDurationMs(terminal.ts - startTs);
  const status: 'completed' | 'failed' | 'cancelled' =
    terminal.type === 'phase_failed'
      ? 'failed'
      : terminal.type === 'phase_stopped'
        ? 'cancelled'
        : 'completed';
  const items: SlideChatItem[] = [];
  if (status === 'failed' && terminal.label) {
    items.push({
      type: 'error',
      id: `err_${terminal.id}`,
      content: terminal.detail || terminal.label,
    });
  }
  items.push({
    type: 'turn_footer',
    id: `footer_${terminal.id}`,
    durationMs,
    actionCount: stats.actionCount,
    fileCount: stats.fileCount,
    filesCreated: stats.filesCreated,
    filesUpdated: stats.filesUpdated,
    filesDeleted: stats.filesDeleted,
    roundCount: stats.roundCount,
    toolNames: stats.toolNames,
    phaseLabel: terminal.label,
    status,
    ...(modelLabel ? { modelLabel } : {}),
    endedAt: terminal.ts,
  });
  return items;
}


/**
 * Build the v0-faithful chronological chat parts list from messages + activity
 * + live streaming. Full step retention: every file/tool event becomes a row.
 */
export function buildSlideChatItems(input: BuildSlideChatItemsInput): SlideChatItem[] {
  const {
    messages,
    activity,
    streamingText = '',
    streamingReasoning = '',
    sessionStatus,
    phase,
    pendingAsk,
    showPlanCard = true,
    modelLabel,
  } = input;


  const items: SlideChatItem[] = [];
  const usedMessageIds = new Set<string>();

  // Activity is the spine for agent steps; messages supply user bubbles + prose.
  // Interleave by timestamp within a simple two-pointer merge after expanding
  // activity into items, while always emitting user messages in order.

  type Timed =
    | { kind: 'msg'; ts: number; msg: SlideMainMessage }
    | { kind: 'act'; ts: number; index: number; ev: SlideActivityEvent };

  const timed: Timed[] = [];
  for (const msg of messages) {
    timed.push({ kind: 'msg', ts: msg.createdAt, msg });
  }
  for (let i = 0; i < activity.length; i++) {
    timed.push({ kind: 'act', ts: activity[i].ts, index: i, ev: activity[i] });
  }
  // Stable sort: preserve relative order when timestamps equal (activity after
  // messages at same ms is fine; we use original array order via index).
  timed.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    if (a.kind !== b.kind) return a.kind === 'msg' ? -1 : 1;
    if (a.kind === 'act' && b.kind === 'act') return a.index - b.index;
    return 0;
  });

  // Phase windows for footers / stats
  let phaseWindowStart = 0;


  // Collect raw activity in order, collapsing patched ids as we go for tools.
  const actBuffer: SlideActivityEvent[] = [];

  const flushActivityMapped = (evs: SlideActivityEvent[]) => {
    const collapsed = collapsePatchedToolRows(evs);
    // Skip apply_patch tool rows when a file_written/file_deleted with same
    // toolCallId or path follows — keep ALL file cards; drop redundant
    // apply_patch tool_started only when file events exist for that call.
    const fileCallIds = new Set(
      collapsed
        .filter((e) => e.type === 'file_written' || e.type === 'file_deleted')
        .map((e) => e.toolCallId)
        .filter(Boolean) as string[],
    );

    for (let i = 0; i < collapsed.length; i++) {
      const ev = collapsed[i];

      // Durable "Thought for Ns" from completed model rounds (emitter patches
      // model_round_started → status completed in place; detail may hold reasoning).
      if (ev.type === 'model_round_started' || ev.type === 'model_round_completed') {
        if (ev.status === 'running') continue; // live tail paints open rounds
        // Duration = time until next distinct event in the same flush chunk.
        // If this is the last event of the chunk, prefer any later activity
        // outside the chunk (tools after the round often land in later drains).
        // Fall back to ≥1s so "Thought for 0s" never shows.
        let endTs = 0;
        for (let j = i + 1; j < collapsed.length; j++) {
          if (collapsed[j].id !== ev.id) {
            endTs = collapsed[j].ts;
            break;
          }
        }
        if (!endTs) {
          // Look ahead in the full activity feed after this event's timestamp.
          for (const later of activity) {
            if (later.ts > ev.ts && later.id !== ev.id) {
              endTs = later.ts;
              break;
            }
          }
        }
        const durationMs = Math.max(1000, (endTs || ev.ts + 1000) - ev.ts);
        items.push({
          type: 'reasoning',
          id: `thought_${ev.id}_${ev.ts}`,
          durationMs,
          ...(ev.detail?.trim() ? { content: ev.detail } : {}),
        });
        continue;
      }


      if (
        (ev.type === 'tool_started' || ev.type === 'tool_finished') &&
        ev.toolName === 'apply_patch' &&
        ev.toolCallId &&
        fileCallIds.has(ev.toolCallId)
      ) {
        continue;
      }
      if (
        (ev.type === 'tool_started' || ev.type === 'tool_finished') &&
        ev.toolName === 'apply_patch' &&
        !ev.toolCallId &&
        fileCallIds.size > 0
      ) {
        continue;
      }
      items.push(...mapActivityEvent(ev));
    }
  };



  const drainActBuffer = () => {
    if (actBuffer.length === 0) return;
    flushActivityMapped(actBuffer.splice(0, actBuffer.length));
  };

  // Footers must land AFTER the phase's summary/assistant prose (often timestamped
  // after phase_completed). Hold them until the next user turn / phase / end.
  const pendingFooters: SlideChatItem[] = [];
  const flushPendingFooters = () => {
    if (pendingFooters.length === 0) return;
    items.push(...pendingFooters.splice(0, pendingFooters.length));
  };

  for (const t of timed) {
    if (t.kind === 'msg') {
      const m = t.msg;
      if (usedMessageIds.has(m.id)) continue;
      if (isUserFacingMessage(m)) {
        drainActBuffer();
        flushPendingFooters();
        usedMessageIds.add(m.id);
        items.push({
          type: 'user',
          id: `user_${m.id}`,
          content: m.content,
          ts: m.createdAt,
        });
      } else if (isErrorMessage(m)) {
        // Errors still before the footer (part of the response body).
        drainActBuffer();
        usedMessageIds.add(m.id);
        items.push({ type: 'error', id: `msgerr_${m.id}`, content: m.content });
      } else if (isProseMessage(m)) {
        // Summary/assistant prose is the "response" — keep footers after it.
        drainActBuffer();
        usedMessageIds.add(m.id);
        items.push({ type: 'prose', id: `prose_${m.id}`, content: m.content });
      }
      continue;
    }

    // activity event
    const ev = t.ev;
    const idx = t.index;

    if (ev.type === 'phase_started') {
      drainActBuffer();
      flushPendingFooters();
      phaseWindowStart = idx;
      actBuffer.push(ev);
      continue;
    }

    if (TERMINAL_PHASE[ev.type]) {
      actBuffer.push(ev);
      const before = actBuffer.filter((e) => !TERMINAL_PHASE[e.type]);
      flushActivityMapped(before);
      actBuffer.length = 0;
      pendingFooters.push(
        ...turnFooterFromTerminal(ev, phaseWindowStart, activity, idx, modelLabel),
      );
      continue;
    }

    actBuffer.push(ev);
  }

  drainActBuffer();

  // Any remaining summary-less phase: still emit footers before the live tail.
  // Prose already in `items` sits above these deferred footers.
  flushPendingFooters();

  // Live tail: only while a model round is still open (streamActive). After
  // round commit, durable Thought rows carry the body from activity.detail.
  const streamActive = isStreamingAgentActive(sessionStatus, activity);

  if (streamActive && streamingReasoning.trim()) {
    items.push({
      type: 'reasoning',
      id: 'live_reasoning',
      content: streamingReasoning,
      live: true,
    });
  } else if (streamActive && !streamingText.trim() && !streamingReasoning.trim()) {
    items.push({
      type: 'reasoning',
      id: 'live_thinking',
      live: true,
    });
  }

  if (streamActive && streamingText.trim()) {
    items.push({
      type: 'prose',
      id: 'live_prose',
      content: streamingText,
      live: true,
    });
  }

  // HITL stream-end cards (history stays above, including footers)
  if (pendingAsk) {
    items.push({ type: 'ask_card' });
  } else if (showPlanCard && phase === 'plan_ready') {
    items.push({ type: 'plan_card' });
  }

  return items;
}

/** Format "Worked for 2m 21s" / "Thought for 3s". */
export function formatWorkedDuration(durationMs: number): string {
  const totalSec = Math.max(0, Math.round(durationMs / 1000));
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export function formatThoughtDuration(durationMs: number): string {
  const sec = Math.max(1, Math.round(durationMs / 1000));
  return `Thought for ${sec}s`;
}
