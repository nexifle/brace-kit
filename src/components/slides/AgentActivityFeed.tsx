import { useEffect, useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Minus,
  ChevronDown,
} from 'lucide-react';
import type {
  SlideActivityEvent,
  SlideActivityStatus,
} from '../../types/slides.ts';

/* ==================================================================== */
/* Status → tone mapping (PRD Amendment A.7)                            */
/*    running   → spinner + primary + pulse                            */
/*    completed → check + muted (reuses main-chat success green)       */
/*    failed    → destructive icon + error text                         */
/*    cancelled → dash / muted "Cancelled"                              */
/* ==================================================================== */

const STATUS_TONE: Record<
  SlideActivityStatus,
  { icon: typeof Loader2; bubble: string; spin?: boolean }
> = {
  running: { icon: Loader2, bubble: 'bg-primary/10 text-primary', spin: true },
  // Completed: success-green (not A.7's "muted") — deliberate reuse of main-chat
  // ToolMessage's green "Completed" chip per A.7's "Reuse ToolMessage" directive.
  completed: { icon: CheckCircle2, bubble: 'bg-success/10 text-success' },
  failed: { icon: AlertCircle, bubble: 'bg-destructive/10 text-destructive' },
  cancelled: { icon: Minus, bubble: 'bg-muted/70 text-muted-foreground' },
};

/** Compact time stamp for a row (e.g. "14:03"). */
function rowTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* A7 file-op symbol: create `+`, update `~`, delete `-` (Amendment A.9). */
const OP_SYMBOL: Record<string, string> = {
  create_file: '+',
  update_file: '~',
  delete_file: '-',
};

/* ==================================================================== */
/* Single row                                                           */
/* ==================================================================== */

function ActivityRow({
  event,
  last,
}: {
  event: SlideActivityEvent;
  last: boolean;
}) {
  const tone = STATUS_TONE[event.status];
  const StatusIcon = tone.icon;
  const running = event.status === 'running';
  const expandable = !!event.detail || !!event.path;
  const [open, setOpen] = useState(running && expandable);

  // A live running row is never collapsed away: keep it open if it has detail.
  useEffect(() => {
    if (running && expandable) setOpen(true);
  }, [running, expandable]);

  return (
    <li className="relative pl-8">
      {/* Timeline connector (skipped on the last row so it doesn't hang). */}
      {!last && (
        <span
          aria-hidden
          className="absolute left-[11px] top-6 bottom-0 w-px bg-border/60"
        />
      )}

      {/* Status node — running rows also pulse (Amendment A.7: spinner + primary + pulse). */}
      <span
        className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full ${tone.bubble} ${
          running ? 'animate-pulse motion-reduce:animate-none' : ''
        }`}
      >
        <StatusIcon
          size={13}
          className={tone.spin ? 'animate-spin motion-reduce:animate-none' : undefined}
        />
      </span>

      <div className="min-w-0 flex-1 pb-3">
        <div className="flex items-center justify-between gap-2">
          {expandable && !running ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-label={open ? 'Collapse detail' : 'Expand detail'}
              className={`group flex min-w-0 flex-1 items-center gap-1.5 text-left ${
                event.status === 'failed'
                  ? 'text-destructive'
                  : 'text-foreground'
              }`}
            >
              <span
                className="min-w-0 truncate text-xs font-medium transition-colors group-hover:text-foreground"
                title={event.label}
              >
                {event.label}
              </span>
              <ChevronDown
                size={12}
                className={`shrink-0 text-muted-foreground/50 transition-transform duration-200 ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </button>
          ) : (
            <span
              className={`min-w-0 truncate text-xs font-medium ${
                event.status === 'failed' ? 'text-destructive' : 'text-foreground'
              }`}
              title={event.label}
            >
              {event.label}
            </span>
          )}

          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
            {rowTime(event.ts)}
          </span>
        </div>

        {/* Subline: round + tool context */}
        {(event.round !== undefined || event.toolName) && (
          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
            {event.round !== undefined && (
              <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] font-semibold tabular-nums text-muted-foreground">
                R{event.round}
              </span>
            )}
            {event.toolName && (
              <span className="truncate font-mono text-[10px] text-muted-foreground/70">
                {event.toolName}
              </span>
            )}
          </div>
        )}

        {/* Expandable detail panel */}
        {expandable && open && (
          <div className="mt-1.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-2 animate-in fade-in slide-in-from-top-1 duration-200">
            {event.path && (
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-mono text-[10px] font-bold ${
                    event.patchOp === 'delete_file' ? 'text-destructive' : 'text-primary'
                  }`}
                >
                  {event.patchOp ? OP_SYMBOL[event.patchOp] : '·'}
                </span>
                <code className="min-w-0 truncate font-mono text-[11px] text-foreground/80">
                  {event.path}
                </code>
              </div>
            )}
            {event.detail && (
              <pre
                className={`mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${
                  event.status === 'failed'
                    ? 'text-destructive/90'
                    : 'text-muted-foreground'
                }`}
              >
                {event.detail}
              </pre>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ==================================================================== */
/* AgentActivityFeed                                                    */
/* ==================================================================== */

/**
 * Live / last-run agent activity timeline for the chat rail (US-038,
 * PRD Amendment A.7). Rendered in chronological (append-only) order as a
 * vertical timeline, with clear running/completed/failed/cancelled tones and
 * expandable detail rows. Running rows are never collapsed away.
 */
export function AgentActivityFeed({ events }: { events: SlideActivityEvent[] }) {
  if (events.length === 0) return null;

  return (
    <section aria-label="Agent activity" className="pt-1">
      <div className="flex items-center gap-2 pb-2">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Agent activity
        </span>
        <span className="h-px flex-1 bg-border/60" aria-hidden />
      </div>
      <ul className="space-y-0">
        {events.map((event, i) => (
          <ActivityRow key={event.id} event={event} last={i === events.length - 1} />
        ))}
      </ul>
    </section>
  );
}
