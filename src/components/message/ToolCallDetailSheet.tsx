import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeftIcon, ChevronRightIcon, XIcon, WrenchIcon } from 'lucide-react';
import { Btn } from '../ui/Btn.tsx';
import type { ToolMessageData } from '../ToolMessage.tsx';
import { isToolError, isToolRunning } from '../../utils/toolActivityLabel.ts';

export interface ToolCallDetailSheetProps {
  tools: ToolMessageData[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

function formatParams(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return 'None';
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function formatResult(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return 'No result yet';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return content;
  }
}

export function ToolCallDetailSheet({ tools, index, onIndexChange, onClose }: ToolCallDetailSheetProps) {
  const open = index != null && index >= 0 && index < tools.length;
  const tool = open ? tools[index] : null;

  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [displayed, setDisplayed] = useState<ToolMessageData | null>(null);
  const [displayedIndex, setDisplayedIndex] = useState(0);

  useEffect(() => {
    if (tool && index != null) {
      setDisplayed(tool);
      setDisplayedIndex(index);
      setShouldRender(true);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setDisplayed(null);
      }, 280);
      return () => clearTimeout(timer);
    }
  }, [tool, index]);

  const canPrev = displayedIndex > 0;
  const canNext = displayedIndex < tools.length - 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (index != null && index > 0) onIndexChange(index - 1);
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (index != null && index < tools.length - 1) onIndexChange(index + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, tools.length, onClose, onIndexChange]);

  if (!shouldRender || !displayed) return null;

  const running = isToolRunning(displayed.content);
  const errored = isToolError(displayed.content);

  const sheet = (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div
        className={`absolute inset-0 bg-background/50 backdrop-blur-sm transition-all duration-300 ${
          isVisible ? 'animate-in fade-in' : 'animate-out fade-out opacity-0'
        }`}
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="tool-call-sheet-title"
        className={`relative w-[min(100%,22rem)] h-full bg-card/95 backdrop-blur-2xl border-l border-border/50 shadow-2xl flex flex-col transition-all duration-300 ${
          isVisible ? 'animate-in slide-in-from-right-full' : 'animate-out slide-out-to-right-full'
        }`}
      >
        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-start gap-2 min-w-0">
            <div className="flex items-center justify-center w-7 h-7 bg-muted/50 rounded-md text-muted-foreground shrink-0 mt-0.5">
              <WrenchIcon size={14} />
            </div>
            <div className="min-w-0">
              <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                Tool call
              </div>
              <h2
                id="tool-call-sheet-title"
                className="text-sm font-semibold text-foreground break-all leading-snug"
              >
                {displayed.name}
              </h2>
            </div>
          </div>
          <Btn variant="ghost" size="icon-sm" onClick={onClose} className="rounded-full shrink-0" title="Close">
            <XIcon size={16} />
          </Btn>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`px-1.5 py-0.5 rounded-md text-2xs font-bold uppercase tracking-widest ${
                running
                  ? 'bg-primary/10 text-primary'
                  : errored
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-success/10 text-success'
              }`}
            >
              {running ? 'Running' : errored ? 'Error' : 'Completed'}
            </span>
            {displayed.isCachedResult && (
              <span className="px-1.5 py-0.5 rounded-md bg-muted/50 text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                cached
              </span>
            )}
          </div>

          <section>
            <h3 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              Parameters
            </h3>
            <pre className="text-2xs font-mono whitespace-pre-wrap break-all rounded-md border border-border/50 bg-muted/30 p-2.5 text-foreground/90 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {formatParams(displayed.toolArguments)}
            </pre>
          </section>

          <section>
            <h3 className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              Result
            </h3>
            <pre
              className={`text-2xs font-mono whitespace-pre-wrap break-all rounded-md border border-border/50 bg-muted/30 p-2.5 max-h-[60vh] overflow-y-auto scrollbar-thin ${
                errored ? 'text-destructive/90' : 'text-foreground/90'
              }`}
            >
              {formatResult(displayed.content)}
            </pre>
          </section>
        </div>

        {tools.length > 1 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-border/50 shrink-0">
            <Btn
              variant="ghost"
              size="sm"
              disabled={!canPrev}
              onClick={() => canPrev && onIndexChange(displayedIndex - 1)}
              title="Previous tool call"
            >
              <ChevronLeftIcon size={14} />
              Prev
            </Btn>
            <span className="text-2xs font-medium text-muted-foreground tabular-nums">
              {displayedIndex + 1} / {tools.length}
            </span>
            <Btn
              variant="ghost"
              size="sm"
              disabled={!canNext}
              onClick={() => canNext && onIndexChange(displayedIndex + 1)}
              title="Next tool call"
            >
              Next
              <ChevronRightIcon size={14} />
            </Btn>
          </div>
        )}
      </aside>
    </div>
  );

  return createPortal(sheet, document.body);
}
