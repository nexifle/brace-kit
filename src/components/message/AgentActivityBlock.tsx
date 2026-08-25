import { useEffect, useState } from 'react';
import {
  AlertCircleIcon,
  ChevronRightIcon,
  FileIcon,
  GlobeIcon,
  LightbulbIcon,
  Loader2Icon,
  SearchIcon,
  WrenchIcon,
} from 'lucide-react';
import type { ToolMessageData } from '../ToolMessage.tsx';
import type { TimelineEntry } from '../../utils/toolActivityGroup.ts';
import {
  activityDurationMs,
  formatToolActivity,
  formatWorkedFor,
  formatWorkingFor,
  type ToolActivityIcon,
} from '../../utils/toolActivityLabel.ts';
import { ToolCallDetailSheet } from './ToolCallDetailSheet.tsx';

export interface AgentActivityBlockProps {
  tools: ToolMessageData[];
  entries: TimelineEntry[];
  isActive: boolean;
  startedAt?: number;
  endedAt?: number;
}

function ActivityIcon({ icon, running }: { icon: ToolActivityIcon; running: boolean }) {
  if (running) {
    return <Loader2Icon size={14} className="text-muted-foreground animate-spin shrink-0" />;
  }
  const cls = 'text-muted-foreground shrink-0';
  switch (icon) {
    case 'search':
      return <SearchIcon size={14} className={cls} />;
    case 'globe':
      return <GlobeIcon size={14} className={cls} />;
    case 'file':
      return <FileIcon size={14} className={cls} />;
    case 'think':
      return <LightbulbIcon size={14} className={cls} />;
    case 'error':
      return <AlertCircleIcon size={14} className="text-destructive shrink-0" />;
    default:
      return <WrenchIcon size={14} className={cls} />;
  }
}

const rowButtonClass =
  'w-full text-left text-sm leading-snug rounded-sm cursor-pointer text-muted-foreground hover:text-foreground transition-[color] duration-200 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60';

function TimelineBody({
  tools,
  entries,
  onSelect,
}: {
  tools: ToolMessageData[];
  entries: TimelineEntry[];
  onSelect: (index: number) => void;
}) {
  const rows = entries.length > 0
    ? entries
    : tools.map((_, toolIndex) => ({ kind: 'tool' as const, toolIndex }));

  return (
    <ul className="flex flex-col gap-3 m-0 p-0 list-none">
      {rows.map((entry, idx) => {
        const last = idx === rows.length - 1;
        const rail = !last && (
          <span
            className="absolute left-3 top-6 -bottom-3 w-px -translate-x-1/2 bg-border/80"
            aria-hidden
          />
        );

        if (entry.kind === 'thinking') {
          return (
            <li key={`thinking-${idx}`} className="relative flex gap-2.5 min-w-0">
              {rail}
              <div className="relative z-[1] size-6 rounded-full bg-muted dark:bg-background flex items-center justify-center shrink-0">
                <ActivityIcon icon="think" running={false} />
              </div>
              <div className="min-w-0 flex-1">
                <button type="button" className={rowButtonClass} onClick={() => onSelect(idx)}>
                  <span className="font-medium">{entry.title}</span>
                  {entry.detail && (
                    <span className="ml-1.5 font-normal truncate inline-block max-w-full align-bottom">
                      {entry.detail}
                    </span>
                  )}
                </button>
              </div>
            </li>
          );
        }

        const tool = tools[entry.toolIndex];
        if (!tool) return null;
        const row = formatToolActivity(tool);
        const running = row.status === 'running';
        return (
          <li key={tool.toolCallId || `tool-${entry.toolIndex}`} className="relative flex gap-2.5 min-w-0">
            {rail}
            <div className="relative z-[1] size-6 rounded-full bg-muted dark:bg-background flex items-center justify-center shrink-0">
              <ActivityIcon icon={row.icon} running={running} />
            </div>
            <div className="min-w-0 flex-1">
              <button type="button" className={rowButtonClass} onClick={() => onSelect(idx)}>
                <span className="font-medium">{row.title}</span>
                {row.detail && (
                  <span className="ml-1.5 font-normal truncate inline-block max-w-full align-bottom">
                    {row.detail}
                  </span>
                )}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AgentActivityBlock({
  tools,
  entries,
  isActive,
  startedAt,
  endedAt,
}: AgentActivityBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isActive]);

  if (tools.length === 0) return null;

  const durationMs = isActive && startedAt != null
    ? Math.max(0, now - startedAt)
    : activityDurationMs(startedAt, endedAt);

  return (
    <div className="w-full max-w-full self-start mb-3 px-1">
      {!isActive && (
        <button
          type="button"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-0.5"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRightIcon
            size={16}
            className={`shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${expanded ? 'rotate-90' : ''}`}
          />
          <span>
            {typeof durationMs === 'number' && durationMs >= 0
              ? formatWorkedFor(durationMs)
              : 'Tool activity'}
          </span>
        </button>
      )}

      {isActive ? (
        <div>
          <TimelineBody tools={tools} entries={entries} onSelect={setSelectedIndex} />
          <div className="relative flex gap-2.5 min-w-0 mt-3">
            <div className="relative z-[1] size-6 rounded-full bg-muted dark:bg-background flex items-center justify-center shrink-0">
              <Loader2Icon size={14} className="text-muted-foreground animate-spin" />
            </div>
            <div className="min-w-0 flex-1 flex items-center">
              <span className="text-sm text-muted-foreground">{formatWorkingFor(durationMs ?? 0)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden min-h-0">
            <div className="mt-2 pl-0.5">
              <TimelineBody tools={tools} entries={entries} onSelect={setSelectedIndex} />
            </div>
          </div>
        </div>
      )}
      <ToolCallDetailSheet
        tools={tools}
        entries={entries}
        index={selectedIndex}
        onIndexChange={setSelectedIndex}
        onClose={() => setSelectedIndex(null)}
      />
    </div>
  );
}
