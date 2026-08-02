import { useEffect, useState } from 'react';
import { BrainIcon, XIcon } from 'lucide-react';
import { useStore } from '../store/index.ts';
import type { ReasoningLevel } from '../types/index.ts';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip/index.ts';
import {
  REASONING_LEVEL_LABELS,
  getReasoningLevelInfo,
} from '../providers/utils/reasoning.ts';

/**
 * Composer "thinking" control.
 *
 * The trigger opens a compact popover anchored above the toolbar with two
 * controls: a switch to enable/disable extended thinking, and a sliding
 * segmented control for the effort level (levels adapt per provider/model).
 */
export function ReasoningPopover() {
  const enableReasoning = useStore((s) => s.enableReasoning);
  const setEnableReasoning = useStore((s) => s.setEnableReasoning);
  const reasoningLevel = useStore((s) => s.reasoningLevel);
  const setReasoningLevel = useStore((s) => s.setReasoningLevel);
  const providerConfig = useStore((s) => s.providerConfig);
  const [open, setOpen] = useState(false);

  const info = getReasoningLevelInfo(
    providerConfig.providerId,
    providerConfig.format,
    providerConfig.model
  );

  // Close on outside mousedown or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Node).isConnected) return;
      const pop = document.getElementById('composer-reasoning-popover');
      const trigger = document.getElementById('composer-reasoning-trigger');
      if (
        pop &&
        !pop.contains(e.target as Node) &&
        trigger &&
        !trigger.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger>
          <button
            id="composer-reasoning-trigger"
            type="button"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls="composer-reasoning-popover"
            onClick={() => setOpen((o) => !o)}
            className={`flex items-center justify-center w-6 h-6 rounded-full border transition-all duration-200 shrink-0 max-[360px]:hidden ${
              enableReasoning
                ? 'bg-primary/15 text-primary border-primary/40'
                : 'text-muted-foreground border-border hover:bg-muted/40 hover:text-foreground'
            }`}
          >
            <BrainIcon size={11} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Thinking &amp; reasoning</TooltipContent>
      </Tooltip>

      {open && (
        <div
          id="composer-reasoning-popover"
          className="absolute bottom-full left-3 mb-2 z-50 w-[300px] max-w-[calc(100vw-32px)] animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <div className="bg-card/95 backdrop-blur-md border border-border rounded-md shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pl-3.5 pr-2.5 py-2 border-b border-border bg-muted/30">
              <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                Thinking &amp; Reasoning
              </span>
              <button
                type="button"
                className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all rounded-sm"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <XIcon size={12} />
              </button>
            </div>

            {/* Content */}
            <div className="p-3.5 flex flex-col gap-3">
              {/* Switch row */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-7 h-7 shrink-0 rounded-md border flex items-center justify-center transition-colors duration-200 ${
                    enableReasoning
                      ? 'bg-primary/10 text-primary border-primary/25'
                      : 'bg-muted/20 text-muted-foreground border-border'
                  }`}
                >
                  <BrainIcon size={13} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground">
                    Extended thinking
                  </div>
                  <div className="text-2xs text-muted-foreground whitespace-nowrap">
                    Reasons before answering
                  </div>
                </div>
                <Switch checked={enableReasoning} onChange={setEnableReasoning} />
              </div>

              {/* Effort level */}
              {enableReasoning && info.supportsLevels && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-200 border-t border-border/60 pt-3 flex flex-col gap-2.5">
                  <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                    Effort
                  </span>

                  <SegmentedLevels
                    levels={info.levels}
                    value={reasoningLevel}
                    onChange={setReasoningLevel}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Sliding segmented control for effort levels.
 * The active segment gets a raised indicator that glides between positions.
 */
function SegmentedLevels({
  levels,
  value,
  onChange,
}: {
  levels: readonly ReasoningLevel[];
  value: ReasoningLevel;
  onChange: (lvl: ReasoningLevel) => void;
}) {
  const n = levels.length;
  const activeIndex = Math.max(0, levels.indexOf(value));

  return (
    <div
      className="relative grid rounded-md border border-border bg-muted/20"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {/* Sliding indicator */}
      <span
        className="absolute top-0.5 bottom-0.5 rounded-[4px] bg-card border border-primary/30 shadow-sm transition-[left] duration-200 ease-out"
        style={{
          left: `calc(${activeIndex} * (100% / ${n}) + 2px)`,
          width: `calc(100% / ${n} - 4px)`,
        }}
      />
      {levels.map((lvl) => {
        const active = lvl === value;
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => onChange(lvl)}
            aria-pressed={active}
            className={`relative z-10 py-1.5 text-2xs transition-colors duration-150 ${
              active
                ? 'text-primary font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {REASONING_LEVEL_LABELS[lvl]}
          </button>
        );
      })}
    </div>
  );
}

/** Minimal toggle switch (rounded pill, matches the toolbar's pill buttons). */
function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full border shrink-0 transition-colors duration-200 ${
        checked ? 'bg-primary/80 border-primary/60' : 'bg-muted/40 border-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-foreground transition-transform duration-200 ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </button>
  );
}
