// ==================== Slide Creator Types ====================
// Shared types for the agentic HTML/CSS slide-deck builder.
// These power the VFS, projection, store, and phase runners across modules.

// Type-only import to avoid a runtime cycle (index.ts re-exports from here).
import type { APIMessage } from './index.ts';
import type { AskField, AskPayload, AskQuestion } from './ask.ts';

// ==================== Canvas / Aspect Presets ====================

/**
 * Aspect-ratio canvas presets for slide decks.
 * Order matters for UI chips (16:9 first = default).
 */
export const SLIDE_CANVAS_PRESETS = {
  '16:9': { label: '16:9 Landscape', width: 1920, height: 1080 },
  '4:5': { label: '4:5 Instagram', width: 1080, height: 1350 },
  '9:16': { label: '9:16 Story', width: 1080, height: 1920 },
  '1:1': { label: '1:1 Square', width: 1080, height: 1080 },
} as const;

/** Union of supported canvas aspect keys, e.g. `'16:9'`. */
export type SlideCanvas = keyof typeof SLIDE_CANVAS_PRESETS;

/** Resolution backing a canvas preset (px). */
export interface SlideCanvasResolution {
  width: number;
  height: number;
}

/**
 * UI-only fallback when no canvas is chosen yet (empty chrome / missing deck.json).
 * NEVER seed a new project or invent a user choice with this — plan must `ask`.
 */
export const DEFAULT_SLIDE_CANVAS: SlideCanvas = '16:9';


// ==================== Phase ====================

/**
 * High-level lifecycle phase of a slide project.
 * `plan` and `build` are active agent phases; `edit` handles follow-ups.
 */
export type SlidePhase =
  | 'idle' // freshly created, nothing started
  | 'plan' // plan sub-agent running
  | 'plan_ready' // brief + design written, awaiting approval
  | 'build' // build sub-agent running
  | 'edit' // edit sub-agent handling a follow-up
  | 'ready' // deck built/idle, not mid-generation
  | 'error';

/** Detailed status of an isolated agent session (sub-phase). */
export type SlideSessionStatus =
  | 'idle'
  | 'running' // model streaming / tool loop active
  | 'waiting_user' // suspended on an `ask`
  | 'done'
  | 'error'
  | 'stopped';

/** Human-readable status copy for the UI (see PRD UX). */
export const SLIDE_PHASE_STATUS_COPY: Record<SlidePhase, string> = {
  idle: 'Idle',
  plan: 'Planning…',
  plan_ready: 'Plan ready',
  build: 'Building…',
  edit: 'Editing…',
  ready: 'Ready',
  error: 'Error',
};

// ==================== Deck / Slide ====================

/** A single file inside the project virtual filesystem. */
export interface SlideFile {
  /** Absolute project path, e.g. `/slides/01.html`. */
  path: string;
  content: string;
}

/**
 * A user-attached txt/image on a composer turn.
 * After send, `path` is the harness-owned VFS location (`/uploads/…`).
 * `data` is present on pending composer chips and when hydrating from VFS;
 * persisted transcript messages store `{ id, type, name, path }` only.
 */
export interface SlideUserAttachment {
  id: string;
  type: 'image' | 'text';
  name: string;
  path: string;
  /** Original file bytes as a data URL (VFS / lightbox). */
  data?: string;
  /**
   * Resized JPEG for model vision + chips only. Never written to the VFS.
   * Dropped when the transcript is persisted.
   */
  preview?: string;
}

/** A rendered slide in the deck (references ordered by `slideOrder`). */
export interface Slide {
  /** Stable slide id, e.g. `01`. */
  id: string;
  /** VFS path to the slide HTML, e.g. `/slides/01.html`. */
  htmlPath: string;
  /** VFS path to the slide CSS (may be empty if inlined into theme), e.g. `/slides/01.css`. */
  cssPath?: string;
}

/** A deck-generation checkpoint: the VFS after one completed build/edit round. */
export interface SlideRound {
  /** 1-based round number (stable, sequential). */
  number: number;
  /** Short UI label, e.g. "Deck built · 5 slides" or the edit prompt (≤60 chars). */
  label: string;
  /** Epoch ms when the round committed. */
  createdAt: number;
  /** Full VFS snapshot at the moment the round landed. */
  files: SlideFile[];
}

/**
 * Decoded deck structure projected from the VFS (`/deck.json` + slide files).
 * This is what the UI consumes to render/navigate/export the deck.
 */
export interface SlideDeck {
  title: string;
  description?: string;
  /** Canvas aspect applied to all slides. Null until the user chooses one. */
  canvas: SlideCanvas | null;

  /** VFS path (or raw content ref) for the shared theme stylesheet. */
  theme?: string;
  /** Ordered slide ids; drives slide navigation and export order. */
  slideOrder: string[];
}

// ==================== Ask (HITL) ====================

/** Backward-compatible aliases for the shared ask contract. */
export type SlideAskField = AskField;
export type SlideAskQuestion = AskQuestion;
export type SlideAskPayload = AskPayload;

/** A suspended question the plan session is waiting on the user to answer. */
export interface SlidePendingAsk {
  /** Stable pending-ask id (also used as IndexedDB key while persisted). */
  id: string;
  /** Id of the tool call that triggered the suspend, to resume with its result. */
  toolCallId: string;
  sessionRef: SlidePhase;
  payload: SlideAskPayload;
  createdAt: number;
}

// ==================== Project ====================

/** A durable slide-deck workspace unit persisted in IndexedDB. */
export interface SlideProject {
  id: string;
  /** Provisional user title (from the initial prompt) until plan completes. */
  title: string;
  createdAt: number;
  updatedAt: number;
  phase: SlidePhase;
  /** Lovable-style mode: 'plan' stops for approval on plan_ready; 'agent' auto-continues to build. */
  mode: 'plan' | 'agent';
  /** Canvas aspect. Null until the user answers a canvas ask / submit_plan. */
  canvas: SlideCanvas | null;
  /** Main transcript entries (kept short — see PRD US-012). */
  messages: SlideMainMessage[];
  /** In-memory virtual filesystem (persisted as a map in slideDB). */
  files: SlideFile[];
  /** Suspended question, if the plan session is waiting on the user. */
  pendingAsk?: SlidePendingAsk;
  /** Set when generation was stopped by the user for clean UI state. */
  stopped?: boolean;
  /** Set once the harness has auto-titled the project (replacing the provisional prompt-derived title). */
  autoTitled?: boolean;
  /**
   * The isolated plan-session conversation (user + assistant + tool turns, no
   * leading system message) from the last completed plan round. Persisted so a
   * follow-up re-plan continues the SAME context instead of starting fresh —
   * the prior round's transcript becomes a cacheable prefix for the next round
   * (US-..). Undefined until the first plan round completes.
   */
  planTranscript?: APIMessage[];
  /**
   * The isolated edit-session conversation from the last completed follow-up round,
   * persisted so a subsequent follow-up CONTINUES the same context (the prior round's
   * edits are visible to the model) instead of starting blank. Mirrors planTranscript.
   */
  editTranscript?: APIMessage[];
  /**
   * The isolated build-session conversation (no leading system message) from the
   * last build round, persisted so a follow-up after a stopped/failed build
   * RESUMES the same build context instead of starting a blank edit. Mirrors
   * planTranscript/editTranscript. Undefined until the first build round starts.
   */
  buildTranscript?: APIMessage[];
}


/** A single entry in a project's short main transcript. */
export interface SlideMainMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'ask' | 'summary' | 'error';
  content: string;
  createdAt: number;
  /**
   * For `role: 'ask'` messages: the question(s) that were asked, so the rail can
   * render a polished question + answer card (Claude-Code-style tool result).
   * `content` holds the user's answer.
   */
  ask?: { questions: SlideAskQuestion[] };
  /** User-attached files for this turn (paths under `/uploads/`). */
  attachments?: SlideUserAttachment[];
}

// ==================== Agentic UI runtime (Amendment A.3 / A.5) ====================

/** Stable activity event kinds for the chat-rail feed. */
export type SlideActivityEventType =
  | 'phase_started'
  | 'phase_completed'
  | 'phase_failed'
  | 'phase_stopped'
  | 'model_round_started'
  | 'model_round_completed'
  | 'assistant_delta'
  | 'tool_started'
  | 'tool_finished'
  | 'file_written'
  | 'file_deleted'
  | 'ask_started'
  | 'ask_answered'
  | 'preview_updated'
  | 'connecting'
  | 'info';

export type SlideActivityStatus = 'running' | 'completed' | 'failed' | 'cancelled';

/** One row in the activity feed (append-only per phase run; in-place status via id). */
export interface SlideActivityEvent {
  id: string;
  type: SlideActivityEventType;
  status: SlideActivityStatus;
  /** Epoch ms */
  ts: number;
  phase: 'plan' | 'build' | 'edit';
  /** Model round index when relevant (1-based) */
  round?: number;
  toolName?: string;
  toolCallId?: string;
  /** Human one-liner — max ~120 chars recommended for list row */
  label: string;
  /** Optional detail (args summary, error, reasoning body) — collapsed by default in UI */
  detail?: string;
  /**
   * Optional assistant prose from a completed model round (chronological feed).
   * Distinct from `detail` (reasoning). Rendered as markdown prose in the rail.
   */
  content?: string;
  path?: string;
  patchOp?: 'create_file' | 'update_file' | 'delete_file' | 'rename_file';
  filesTouched?: number;
}

/**
 * Authoritative UI runtime fields (Amendment A.3).
 * `busy` MUST equal `sessionStatus === 'running'` — single source of truth.
 */
export interface SlideUiRuntime {
  phase: SlidePhase;
  sessionStatus: SlideSessionStatus;
  busy: boolean;
  pendingAsk: SlidePendingAsk | null;
  activity: SlideActivityEvent[];
  streamingText: string;
  streamingReasoning: string;
  /** 1-based current model round (0 when idle / not in a phase). */
  agentRound: number;
  agentMaxRounds: number;
  lastToolName: string | null;
  lastError: string | null;
}

/** Default max model rounds for phase chrome (matches agentSession default). */
export const DEFAULT_SLIDE_AGENT_MAX_ROUNDS = 24;
