import { useEffect, useState } from 'react';
import { ChevronDown, Redo2, Undo2 } from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';

/**
 * Per-deck undo/redo history chrome. Each completed build/edit round is a
 * checkpoint; the chip shows the active round and a dropdown to jump to any
 * round. Undo/redo are thin wrappers over `restoreRound(±1)` (standard undo
 * semantics: restoring then generating truncates the redo tail).
 *
 * Renders nothing until the deck has at least one committed round.
 */
export function RoundHistory() {
  const rounds = useSlideStore((s) => s.rounds);
  const roundIndex = useSlideStore((s) => s.roundIndex);
  const busy = useSlideStore((s) => s.busy);
  const pendingAsk = useSlideStore((s) => s.pendingAsk);
  const activeProject = useSlideStore((s) => s.activeProject);
  const restoreRound = useSlideStore((s) => s.restoreRound);
  const [open, setOpen] = useState(false);

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
  }, [open]);

  if (rounds.length === 0 || !activeProject) return null;

  const frozen = busy || !!pendingAsk;
  const canUndo = !frozen && roundIndex > 0;
  const canRedo = !frozen && roundIndex < rounds.length - 1;

  const buttonClass =
    'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35';

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
          className="flex h-7 items-center gap-1 rounded-md px-2 text-2xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
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

        {open && (
          <div
            id="slide-round-dropdown"
            role="listbox"
            aria-label="Deck rounds"
            className="absolute right-0 top-full z-30 mt-1 min-w-[14rem] max-w-[18rem] overflow-hidden rounded-md border border-border/80 bg-popover p-1 shadow-lg"
          >
            {rounds.map((r, i) => (
              <button
                key={r.number}
                role="option"
                aria-selected={i === roundIndex}
                type="button"
                onClick={() => {
                  setOpen(false);
                  void restoreRound(activeProject.id, i);
                }}
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
        )}
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
