import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, History, Redo2, Undo2 } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';

const POPOVER_GAP = 6;

/**
 * Per-deck undo/redo history chrome. Each completed build/edit round is a
 * checkpoint; the chip shows the active round and a dropdown to jump to any
 * round. Undo/redo are thin wrappers over `restoreRound(±1)` (standard undo
 * semantics: restoring then generating truncates the redo tail).
 *
 * Renders nothing until the deck has at least one committed round.
 *
 * The dropdown is rendered `position: fixed` and clamped to the viewport so it
 * never overflows the panel/sidebar: it drops below the trigger, flips above
 * when there isn't enough room below, and clamps its horizontal position so it
 * stays fully on-screen regardless of how narrow the container is.
 *
 * In `compact` (narrow/sidebar) layout the full toolbar is collapsed into a
 * single icon trigger whose popover holds undo/redo plus the round list — the
 * wide header has room for the always-visible undo/chip/redo buttons.
 */
export function RoundHistory({ compact = false }: { compact?: boolean }) {
  const rounds = useSlideStore((s) => s.rounds);
  const roundIndex = useSlideStore((s) => s.roundIndex);
  const busy = useSlideStore((s) => s.busy);
  const pendingAsk = useSlideStore((s) => s.pendingAsk);
  const activeProject = useSlideStore((s) => s.activeProject);
  const restoreRound = useSlideStore((s) => s.restoreRound);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Clamp the fixed-positioned popover to the viewport. Drops below the trigger
  // by default, flips above when it would go past the bottom, and pins the
  // horizontal placement so a narrow sidebar never clips it.
  const placePopover = () => {
    const trigger = document.getElementById('slide-round-trigger');
    const pop = popRef.current;
    if (!trigger || !pop) return;
    const t = trigger.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const top =
      t.bottom + POPOVER_GAP + p.height <= vh || t.top - POPOVER_GAP < 0
        ? t.bottom + POPOVER_GAP
        : Math.max(POPOVER_GAP, t.top - POPOVER_GAP - p.height);

    // Prefer right-aligning to the trigger; clamp to keep it fully on-screen.
    let left = t.right - p.width;
    if (left < POPOVER_GAP) left = POPOVER_GAP;
    if (left + p.width > vw - POPOVER_GAP) left = vw - POPOVER_GAP - p.width;

    setPlacement({ top, left });
  };

  // Position on open + re-clamp when it reflows (rounds change) and on
  // scroll/resize/round-trip changes while it's visible.
  useEffect(() => {
    if (!open) return;
    placePopover();
    const reposition = () => placePopover();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rounds.length, roundIndex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Node).isConnected) return;
      const pop = document.getElementById('slide-round-dropdown');
      const trigger = document.getElementById('slide-round-trigger');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (rounds.length === 0 || !activeProject) return null;

  const frozen = busy || !!pendingAsk;
  const canUndo = !frozen && roundIndex > 0;
  const canRedo = !frozen && roundIndex < rounds.length - 1;

  const buttonClass =
    'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35';

  const jump = (i: number) => {
    setOpen(false);
    void restoreRound(activeProject.id, i);
  };

  // Dropdown body shared by both layouts; compact mode prepends undo/redo.
  // Rendered through a portal with fixed, viewport-clamped positioning so the
  // header's backdrop-blur (a `fixed` containing block) can't mis-anchor it and
  // it can never overflow the panel/sidebar.
  const dropdown = open
    ? createPortal(
        <div
          id="slide-round-dropdown"
          ref={popRef}
          role="listbox"
          aria-label="Deck rounds"
          style={
            placement
              ? { position: 'fixed', top: placement.top, left: placement.left }
              : { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
          }
          className="z-[70] w-60 max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border border-border/80 bg-popover p-1 shadow-lg"
        >
          {compact && (
            <div className="mb-1 flex items-center gap-1 border-b border-border/70 px-1 pb-1.5">
              <button
                type="button"
                onClick={() => void restoreRound(activeProject.id, roundIndex - 1)}
                disabled={!canUndo}
                className={buttonClass}
                title="Undo last edit round"
                aria-label="Undo round"
              >
                <Undo2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => void restoreRound(activeProject.id, roundIndex + 1)}
                disabled={!canRedo}
                className={buttonClass}
                title="Redo next edit round"
                aria-label="Redo round"
              >
                <Redo2 size={14} />
              </button>
              <span className="ml-auto pr-1 text-2xs font-medium tabular-nums text-muted-foreground">
                Round {roundIndex + 1}/{rounds.length}
              </span>
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {rounds.map((r, i) => (
              <button
                key={r.number}
                role="option"
                aria-selected={i === roundIndex}
                type="button"
                onClick={() => jump(i)}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-2xs ${
                  i === roundIndex
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span className="shrink-0 font-mono tabular-nums">#{r.number}</span>
                <span className="min-w-0 truncate">{r.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )
    : null;

  // Compact (sidebar) layout: single icon trigger + popover with undo/redo.
  if (compact) {
    return (
      <div className="relative">
        <button
          id="slide-round-trigger"
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={frozen}
          className={`${buttonClass} ${open ? 'bg-muted text-foreground' : ''}`}
          title={`Rounds (undo / redo) — Round ${roundIndex + 1} of ${rounds.length}`}
          aria-label="Round history (undo / redo)"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <History size={15} />
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => void restoreRound(activeProject.id, roundIndex - 1)}
        disabled={!canUndo}
        className={buttonClass}
        title="Undo last edit round"
        aria-label="Undo round"
      >
        <Undo2 size={15} />
      </button>

      <div className="relative">
        <button
          id="slide-round-trigger"
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={frozen}
          className={`flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35 ${
            open ? 'bg-muted text-foreground' : ''
          }`}
          title="Jump back or forward to an earlier round"
          aria-label={`Round ${roundIndex + 1} of ${rounds.length}`}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          Round {roundIndex + 1}/{rounds.length}
          <ChevronDown
            size={12}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {dropdown}
      </div>

      <button
        type="button"
        onClick={() => void restoreRound(activeProject.id, roundIndex + 1)}
        disabled={!canRedo}
        className={buttonClass}
        title="Redo next edit round"
        aria-label="Redo round"
      >
        <Redo2 size={15} />
      </button>
    </div>
  );
}
