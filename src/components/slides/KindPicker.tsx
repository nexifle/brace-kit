import { Layout, Presentation } from 'lucide-react';
import type { BuilderKind } from '../../types/slides.ts';
import { useSlideStore } from '../../store/slideStore.ts';

const OPTIONS: Array<{
  kind: BuilderKind;
  label: string;
  hint: string;
  icon: typeof Presentation;
}> = [
  { kind: 'slides', label: 'Slides', hint: 'Deck with a fixed canvas', icon: Presentation },
  { kind: 'site', label: 'Website', hint: 'One or more pages + shared layout', icon: Layout },
];

export function KindPicker({ compact = false }: { compact?: boolean }) {
  const pendingKind = useSlideStore((s) => s.pendingKind);
  const setPendingKind = useSlideStore((s) => s.setPendingKind);

  return (
    <div
      className={compact ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-2'}
      role="radiogroup"
      aria-label="What to build"
    >
      {OPTIONS.map((o) => {
        const selected = pendingKind === o.kind;
        return (
          <button
            key={o.kind}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setPendingKind(o.kind)}
            className={`flex flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors ${
              selected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border/80 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            <o.icon size={16} className={selected ? 'text-primary' : ''} />
            <span className="text-2xs font-semibold tracking-tight">{o.label}</span>
            {!compact && (
              <span className="text-[10px] leading-snug text-muted-foreground">{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
