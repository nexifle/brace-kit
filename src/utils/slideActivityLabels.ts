/**
 * Pure label helpers for SlideActivityEvent rows (PRD Amendment A.5).
 * Keep strings exact so phase runners / feed UI stay consistent.
 */

export type SlideActivityPhase = 'plan' | 'build' | 'edit';

export type SlidePatchOpLabel = 'create_file' | 'update_file' | 'delete_file' | 'rename_file';

const CONNECTING_LABEL = 'Connecting to model…';

const PHASE_STARTED: Record<SlideActivityPhase, string> = {
  plan: 'Planning your deck…',
  build: 'Building slides…',
  edit: 'Applying your changes…',
};

const PHASE_COMPLETED_PLAN = 'Plan ready — review brief & design';
const PHASE_COMPLETED_EDIT = 'Updates applied';
const PHASE_STOPPED = 'Stopped';

/** Truncate to maxLen without ellipsis unless the string is longer. */
export function truncateLabel(text: string, maxLen: number): string {
  if (maxLen <= 0) return '';
  if (text.length <= maxLen) return text;
  if (maxLen === 1) return '…';
  return `${text.slice(0, maxLen - 1)}…`;
}

export function connectingActivityLabel(): string {
  return CONNECTING_LABEL;
}

/** model_round_started / model_round_completed share this concise row label (A.5). */
export function modelRoundLabel(round: number): string {
  return `Round ${round}`;
}

export function phaseStartedLabel(phase: SlideActivityPhase): string {
  return PHASE_STARTED[phase];
}

export function phaseCompletedLabel(
  phase: SlideActivityPhase,
  opts?: { slideCount?: number },
): string {
  if (phase === 'plan') return PHASE_COMPLETED_PLAN;
  if (phase === 'edit') return PHASE_COMPLETED_EDIT;
  const n = opts?.slideCount ?? 0;
  return `Deck ready — ${n} slide${n === 1 ? '' : 's'}`;
}

export function phaseStoppedLabel(): string {
  return PHASE_STOPPED;
}

export function phaseFailedLabel(message: string): string {
  // Strip a leading `Error: ` prefix so a message that already carries it doesn't
  // double-prefix (`Error: Error: ...`) — mirrors toolFailedLabel / emitter.failed.
  const clean = (message ?? '').replace(/^Error:\s*/, '').trim() || 'Unknown error';
  return `Error: ${truncateLabel(clean, 100)}`;
}

/** apply_patch running labels (present continuous). */
export function applyPatchOpLabel(op: SlidePatchOpLabel, path: string): string {
  const p = path || '/';
  switch (op) {
    case 'create_file':
      return `Creating ${p}`;
    case 'update_file':
      return `Updating ${p}`;
    case 'delete_file':
      return `Deleting ${p}`;
    case 'rename_file':
      return `Renaming ${p}`;
  }
}

/** Completed file_written / file_deleted card titles (past tense). */
export function applyPatchOpDoneLabel(op: SlidePatchOpLabel, path: string): string {
  const p = path || '/';
  switch (op) {
    case 'create_file':
      return `Created ${p}`;
    case 'update_file':
      return `Updated ${p}`;
    case 'delete_file':
      return `Deleted ${p}`;
    case 'rename_file':
      return `Renamed ${p}`;
  }
}

export function readFileLabel(path: string): string {
  return `Reading ${path || '/'}`;
}

export function loadSkillLabel(name: string): string {
  const n = name.trim();
  return n ? `Loading skill ${n}` : 'Loading skill';
}

export function listFilesLabel(): string {
  return 'Listing project files';
}

export function askStartedLabel(): string {
  return 'Asking you a question';
}

/** ask_answered label (Amendment A.5/A.6). */
export function askAnsweredLabel(): string {
  return 'Answer received';
}

export function submitPlanLabel(): string {
  return 'Submitting plan';
}

/** google_search: query truncated to 40 chars in the label. */
export function googleSearchLabel(query: string): string {
  const q = truncateLabel((query ?? '').trim() || '…', 40);
  return `Searching: ${q}`;
}

/** web_fetch: hostname (or raw url) truncated to 40 chars. */
export function webFetchLabel(url: string): string {
  const raw = (url ?? '').trim();
  let host = raw || '…';
  try {
    if (raw) host = new URL(raw).hostname || raw;
  } catch {
    host = raw;
  }
  return `Fetching: ${truncateLabel(host, 40)}`;
}

/** MCP / unknown external tools. */
export function mcpToolLabel(toolName: string): string {
  const name = (toolName ?? '').trim() || 'tool';
  return `Running ${name}`;
}

/**
 * tool_finished failed: prefix the running label with `Failed: ` + reason ≤80 chars.
 * When `runningLabel` is omitted, uses `Failed: {reason}` only.
 */
export function toolFailedLabel(reason: string, runningLabel?: string): string {
  const r = truncateLabel((reason ?? '').trim() || 'failed', 80);
  if (runningLabel && runningLabel.trim()) {
    return `Failed: ${r}`;
  }
  return `Failed: ${r}`;
}

/**
 * tool_finished cancelled: replace the running present-continuous label with a
 * cancelled past-tense one (e.g. "Asking you a question" -> "Question canceled").
 * Falls back to a generic "Canceled" for unknown labels.
 */
export function cancelledLabel(runningLabel?: string): string {
  const label = (runningLabel ?? '').trim();
  if (!label) return 'Canceled';
  if (label === askStartedLabel()) return 'Question canceled';
  // "Listing project files" -> "Canceled: Listing project files" reads poorly;
  // prefer a terse generic for anything we don't have an explicit mapping for.
  return 'Canceled';
}

/**
 * Build the normative `tool_started` label from tool name + optional args.
 * Unknown tools fall through to MCP-style `Running {name}`.
 */
export function toolStartedLabel(
  toolName: string,
  args?: {
    path?: string;
    patchOp?: SlidePatchOpLabel;
    query?: string;
    url?: string;
    skillName?: string;
  },
): string {
  switch (toolName) {
    case 'apply_patch': {
      const op = args?.patchOp ?? 'update_file';
      return applyPatchOpLabel(op, args?.path ?? '/');
    }
    case 'read_file':
      return readFileLabel(args?.path ?? '/');
    case 'load_skill':
      return loadSkillLabel(args?.skillName ?? args?.path ?? '');
    case 'list_files':
      return listFilesLabel();
    case 'ask':
      return askStartedLabel();
    case 'submit_plan':
      return submitPlanLabel();
    case 'reorder_slides':
      return 'Reordering slides';
    case 'google_search':
      return googleSearchLabel(args?.query ?? '');
    case 'web_fetch':
      return webFetchLabel(args?.url ?? args?.path ?? args?.query ?? '');
    default:
      return mcpToolLabel(toolName);
  }
}

/** file_written success card — past tense (running apply_patch stays present). */
export function fileWrittenLabel(op: 'create_file' | 'update_file' | 'rename_file', path: string): string {
  return applyPatchOpDoneLabel(op, path);
}

/** file_deleted success card */
export function fileDeletedLabel(path: string): string {
  return applyPatchOpDoneLabel('delete_file', path);
}
