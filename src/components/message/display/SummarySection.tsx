import { ChevronRightIcon, Minimize2Icon } from 'lucide-react';
import { renderMarkdown } from '../../../utils/markdown';
import { cn } from '../../../utils/cn';
import type { SummarySectionProps } from '../MessageBubble.types';

function formatCompactTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 ? Math.round(m) : m.toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

interface CheckpointBlock {
  title: string;
  level: 2 | 3;
  body: string;
}

function parseCheckpoint(raw: string): CheckpointBlock[] {
  const text = raw.replace(/^\[CONTEXT CHECKPOINT\]\s*/i, '').trim();
  const lines = text.split('\n');
  const blocks: CheckpointBlock[] = [];
  let current: CheckpointBlock | null = null;

  const flush = () => {
    if (current) blocks.push({ ...current, body: current.body.trim() });
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    if (h2) {
      flush();
      current = { title: h2[1].trim(), level: 2, body: '' };
      continue;
    }
    if (h3) {
      flush();
      current = { title: h3[1].trim(), level: 3, body: '' };
      continue;
    }
    if (!current) {
      current = { title: '', level: 2, body: line };
      continue;
    }
    current.body += `${current.body ? '\n' : ''}${line}`;
  }
  flush();
  return blocks.filter((b) => b.title || b.body);
}

function isPlaceholder(body: string): boolean {
  const t = body.replace(/[*\-x[\]\s]/g, '').toLowerCase();
  return (
    t === '' ||
    t === '(none)' ||
    t === 'none' ||
    /nogoalspecified|conversationisempty|awaituserinput/.test(t.replace(/[^a-z]/g, ''))
  );
}

export function SummarySection({ summary, isExpanded, onToggle, compactTokens }: SummarySectionProps) {
  const blocks = parseCheckpoint(summary);
  const saved =
    compactTokens && compactTokens.before > compactTokens.after && compactTokens.before > 0
      ? Math.round((1 - compactTokens.after / compactTokens.before) * 100)
      : null;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-x-2 gap-y-1.5 text-left rounded-md px-0.5 py-0.5 -mx-0.5 hover:bg-muted/40 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        aria-expanded={isExpanded}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted/80 text-muted-foreground shrink-0">
            <Minimize2Icon size={12} strokeWidth={2.25} />
          </span>
          <span className="truncate text-2xs font-bold uppercase tracking-widest text-muted-foreground">
            Conversation compacted
          </span>
          <ChevronRightIcon
            size={14}
            className={cn(
              'text-muted-foreground/70 shrink-0 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
          />
        </span>
        {compactTokens && compactTokens.after > 0 && (
          <span className="ml-auto flex shrink-0 items-center gap-1.5 font-mono text-2xs tabular-nums">
            {compactTokens.before > compactTokens.after && (
              <>
                <span
                  className="text-muted-foreground/55 line-through decoration-muted-foreground/35"
                  title="Tokens before compact"
                >
                  ~{formatCompactTokens(compactTokens.before)}
                </span>
                <span className="text-border" aria-hidden>
                  →
                </span>
              </>
            )}
            <span className="font-semibold text-primary" title="Tokens after compact">
              ~{formatCompactTokens(compactTokens.after)}
            </span>
            {saved != null && saved > 0 && (
              <span
                className="rounded-full bg-emerald-500/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-emerald-700 dark:text-emerald-400"
                title="Context reduced"
              >
                −{saved}%
              </span>
            )}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 pl-[34px] flex flex-col gap-3.5 max-h-[320px] overflow-y-auto scrollbar-thin pr-1">
          {blocks.length === 0 ? (
            <div
              className="text-sm leading-relaxed text-muted-foreground"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(summary, false) }}
            />
          ) : (
            blocks.map((block, i) => {
              const empty = isPlaceholder(block.body);
              return (
                <section key={`${block.level}-${block.title}-${i}`} className="min-w-0">
                  {block.title && (
                    <h3
                      className={cn(
                        'm-0 text-2xs font-bold uppercase tracking-widest text-muted-foreground/70',
                        block.level === 3 && 'pl-0',
                      )}
                    >
                      {block.title}
                    </h3>
                  )}
                  {empty ? (
                    <p className="m-0 mt-1 text-sm text-muted-foreground/50">None</p>
                  ) : (
                    <div
                      className="checkpoint-prose mt-1 text-sm leading-relaxed text-foreground/90 [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:hidden [&_h2]:hidden [&_h3]:hidden [&_hr]:hidden"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(block.body, false) }}
                    />
                  )}
                </section>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
