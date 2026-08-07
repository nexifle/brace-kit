import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileCode2,
  Loader2,
  Minus,
  Wrench,
} from 'lucide-react';
import type { SlideActivityEvent } from '../../../types/slides.ts';
import type { SlideChatItem } from '../../../utils/slideChatItems.ts';
import {
  formatThoughtDuration,
  formatWorkedDuration,
} from '../../../utils/slideChatItems.ts';
import { slideTouchSymbol } from '../../../utils/slideFilesTouched.ts';
import {
  applyPatchOpDoneLabel,
  type SlidePatchOpLabel,
} from '../../../utils/slideActivityLabels.ts';
import { MarkdownBody } from '../../message/MarkdownBody.tsx';
/* ==================================================================== */
/* Shared density tokens (v0-like within theme)                          */
/* ==================================================================== */

export function ChatUserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] rounded-2xl rounded-br-md bg-primary/10 px-3.5 py-2 text-sm leading-relaxed text-foreground">
        <p className="whitespace-pre-wrap break-words">{content}</p>
      </div>
    </div>
  );
}

/**
 * v0-style Thought row:
 *  - live: header "Thinking…" / "Thought for …" + body expanded while streaming
 *  - done: collapses by default; chevron toggles scrollable body (max-height)
 * Always keeps a durable header even when body text is empty.
 */
export function AgentReasoningRow({
  item,
}: {
  item: Extract<SlideChatItem, { type: 'reasoning' }>;
}) {
  const content = item.content?.trim() ?? '';
  const hasBody = content.length > 0;
  const live = !!item.live;

  // Open while streaming; collapse when the turn commits (v0).
  const [open, setOpen] = useState(live && hasBody);
  useEffect(() => {
    if (live && hasBody) setOpen(true);
    if (!live) setOpen(false);
  }, [live, hasBody]);

  const label = live
    ? hasBody
      ? 'Thinking'
      : 'Thinking…'
    : formatThoughtDuration(item.durationMs ?? 1000);

  return (
    <div className="text-[13px] text-muted-foreground">
      <button
        type="button"
        onClick={() => {
          if (!hasBody) return;
          setOpen((o) => !o);
        }}
        className={`inline-flex max-w-full items-center gap-1.5 rounded-md py-0.5 pl-0 text-left ${
          hasBody ? 'hover:text-foreground/85 cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={hasBody ? open : undefined}
      >
        {/* Always Brain for thinking — never swap to Activity when body exists. */}
        <Brain
          size={14}
          className={`shrink-0 ${live ? 'text-primary/90' : 'opacity-70'}`}
        />
        <span className={live ? 'text-primary/90' : 'text-muted-foreground'}>
          {label}
        </span>
        {hasBody ? (
          open ? (
            <ChevronDown size={14} className="shrink-0 opacity-60" />
          ) : (
            <ChevronRight size={14} className="shrink-0 opacity-60" />
          )
        ) : null}
        {live && hasBody ? (
          <Loader2 size={11} className="shrink-0 animate-spin text-primary/80" />
        ) : null}
      </button>

      {open && hasBody ? (
        <div className="mt-1.5 max-h-48 overflow-y-auto border-l border-border/60 pl-3 scrollbar-thin">
          <p className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted-foreground/90">
            {content}
            {live ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-3 w-0.5 translate-y-0.5 animate-pulse bg-primary align-middle"
              />
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}



export function AgentProse({
  content,
  live,
}: {
  content: string;
  live?: boolean;
}) {
  return (
    <MarkdownBody
      content={content}
      isStreaming={!!live}
      className="text-foreground/90"
      endAdornment={
        live ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 animate-pulse bg-primary align-middle"
          />
        ) : null
      }
    />
  );
}

function statusIcon(status: SlideActivityEvent['status']) {
  if (status === 'running') {
    return <Loader2 size={13} className="animate-spin text-primary" />;
  }
  if (status === 'failed') {
    return <AlertCircle size={13} className="text-destructive dark:text-red-300" />;
  }
  if (status === 'cancelled') {
    return <Minus size={13} className="text-muted-foreground" />;
  }
  return <CheckCircle2 size={13} className="text-success/80" />;
}
export function AgentActionRow({
  event,
}: {
  event: SlideActivityEvent;
}) {
  // Older feeds mirrored the file path into `detail`; path is already in the
  // label (and file cards), so suppress that redundant subline.
  const detail =
    event.detail &&
    event.detail !== event.path &&
    !(event.label && event.detail && event.label.endsWith(event.detail))
      ? event.detail
      : null;

  return (
    <div
      className={`flex items-start gap-2 text-[13px] leading-snug ${
        event.status === 'failed'
          ? 'text-destructive dark:text-red-300'
          : 'text-muted-foreground'
      }`}
    >
      <span className="mt-0.5 shrink-0">{statusIcon(event.status)}</span>
      <span className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5">
          <Wrench size={12} className="opacity-50" />
          <span className="break-words">{event.label}</span>
        </span>
        {detail ? (
          <span className="mt-0.5 block whitespace-pre-wrap break-words text-[12px] opacity-70">
            {detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

export function AgentFileCard({
  item,
  onPathClick,
}: {
  item: Extract<SlideChatItem, { type: 'file_card' }>;
  onPathClick?: (path: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const sym = item.op ? slideTouchSymbol(item.op) : '~';
  const pathForTitle = item.paths[0] ?? '';
  const title =
    item.op && pathForTitle
      ? applyPatchOpDoneLabel(item.op as SlidePatchOpLabel, pathForTitle)
      : item.label;

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] text-foreground/90 hover:bg-muted/40"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{title}</span>
        {item.status === 'running' ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-primary" />
        ) : null}
      </button>
      {open ? (
        <ul className="space-y-0.5 border-t border-border/50 px-2.5 py-1.5">
          {item.paths.map((path) => (
            <li key={path}>
              <button
                type="button"
                onClick={() => onPathClick?.(path)}
                className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left font-mono text-[12px] text-muted-foreground ${
                  onPathClick
                    ? 'hover:bg-muted/50 hover:text-foreground'
                    : 'cursor-default'
                }`}
              >
                <span
                  className={
                    sym === '+'
                      ? 'text-success'
                      : sym === '-'
                        ? 'text-destructive'
                        : 'text-primary'
                  }
                >
                  {sym}
                </span>
                <FileCode2 size={12} className="shrink-0 opacity-60" />
                <span className="min-w-0 truncate">{path}</span>
              </button>
            </li>
          ))}
          {item.detail ? (
            <li className="px-1.5 pt-0.5 text-[11px] text-muted-foreground/80 whitespace-pre-wrap">
              {item.detail}
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function formatRelativeEnded(endedAt?: number): string | null {
  if (endedAt == null) return null;
  const delta = Date.now() - endedAt;
  if (delta < 60_000) return 'just now';
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(delta / 86_400_000))}d ago`;
}

function outcomeLabel(status: 'completed' | 'failed' | 'cancelled', phaseLabel: string): string {
  if (status === 'failed') return 'Failed';
  if (status === 'cancelled') return 'Stopped';
  if (phaseLabel && phaseLabel !== 'Stopped') return phaseLabel;
  return 'Completed';
}

function fileOpsSummary(item: Extract<SlideChatItem, { type: 'turn_footer' }>): string {
  const parts: string[] = [];
  if (item.filesCreated > 0) {
    parts.push(`${item.filesCreated} created`);
  }
  if (item.filesUpdated > 0) {
    parts.push(`${item.filesUpdated} updated`);
  }
  if (item.filesDeleted > 0) {
    parts.push(`${item.filesDeleted} deleted`);
  }
  if (parts.length === 0) {
    if (item.fileCount === 0) return 'None';
    return `${item.fileCount} file${item.fileCount === 1 ? '' : 's'}`;
  }
  // "2 created · 1 updated" — always full words, never truncated mid-token.
  return parts.join(' · ');
}

/** Human labels for internal tool ids (keep short; still readable). */
const TOOL_DISPLAY: Record<string, string> = {
  apply_patch: 'Edit files',
  list_files: 'List files',
  read_file: 'Read file',
  ask: 'Ask user',
  submit_plan: 'Submit plan',
  google_search: 'Web search',
};

function formatToolNames(names: string[]): string {
  if (names.length === 0) return '—';
  return names
    .map((n) => TOOL_DISPLAY[n] ?? n.replace(/_/g, ' '))
    .join(', ');
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** v0-style expandable “Worked for …” panel with a readable stats list. */
export function AgentTurnFooter({
  item,
  onRetry,
}: {
  item: Extract<SlideChatItem, { type: 'turn_footer' }>;
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const worked = formatWorkedDuration(item.durationMs);
  const ago = formatRelativeEnded(item.endedAt);
  const outcome = outcomeLabel(item.status, item.phaseLabel);

  const rows: Array<{ label: string; value: string }> = [
    { label: 'Outcome', value: outcome },
    { label: 'Actions', value: plural(item.actionCount, 'action', 'actions') },
    { label: 'Files', value: fileOpsSummary(item) },
  ];
  if (item.roundCount > 0) {
    rows.push({
      label: 'Model rounds',
      value: plural(item.roundCount, 'round', 'rounds'),
    });
  }
  if (item.toolNames.length > 0) {
    rows.push({
      label: 'Tools used',
      value: formatToolNames(item.toolNames),
    });
  }
  if (item.modelLabel) {
    rows.push({ label: 'Model', value: item.modelLabel });
  }

  return (
    <div className="pt-1 text-[13px] text-muted-foreground">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex w-full items-center gap-1.5 rounded-md py-0.5 text-left hover:text-foreground/85"
        aria-expanded={open}
      >
        {/* Expanded: chevron. Collapsed: Activity pulse icon (v0-ish affordance). */}
        {open ? (
          <ChevronDown size={14} className="shrink-0 opacity-70" />
        ) : (
          <Activity size={14} className="shrink-0 opacity-70" />
        )}
        <span className="font-medium text-foreground/85">Worked for {worked}</span>
        {ago ? (
          <>
            <span className="text-muted-foreground/35">·</span>
            <span className="text-muted-foreground/70">{ago}</span>
          </>
        ) : null}
      </button>

      {open ? (
        <dl className="mt-2 space-y-1.5 border-l border-border/60 pl-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:gap-3">
              <dt className="shrink-0 text-[12px] text-muted-foreground/75 sm:w-[6.75rem]">
                {row.label}
              </dt>
              <dd className="min-w-0 flex-1 text-[12.5px] leading-snug text-foreground/90 break-words">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {item.canRetry && onRetry ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary hover:bg-primary/15 transition-colors"
          >
            {item.continueAction === 'continue' ? 'Continue' : 'Retry'}
          </button>
        </div>
      ) : null}
    </div>
  );
}


export function AgentPhaseEyebrow({ label }: { label: string }) {
  return (
    <p className="pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
      {label}
    </p>
  );
}

export function AgentErrorLine({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[13px] text-destructive dark:border-red-400/35 dark:bg-red-400/10 dark:text-red-300">
      <AlertCircle size={14} className="mt-0.5 shrink-0 opacity-90" aria-hidden />
      <p className="min-w-0 flex-1 whitespace-pre-wrap break-words font-medium">{content}</p>
    </div>
  );
}

export function AgentGroup({
  item,
  renderChild,
}: {
  item: Extract<SlideChatItem, { type: 'group' }>;
  renderChild: (child: SlideChatItem) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{item.title}</span>
      </button>
      {open ? (
        <div className="space-y-1.5 border-l border-border/50 pl-3">
          {item.children.map((c, i) => (
            <div key={'id' in c ? c.id : `${item.id}_${i}`}>{renderChild(c)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
