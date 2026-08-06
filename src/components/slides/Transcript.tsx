import { Bot, AlertTriangle, CheckCircle2, User } from 'lucide-react';
import type { SlideMainMessage } from '../../types/slides.ts';

const ROLE_META: Record<
  SlideMainMessage['role'],
  { icon: typeof User; className: string; label: string }
> = {
  user: { icon: User, className: 'bg-primary/10 text-primary', label: 'You' },
  assistant: { icon: Bot, className: 'bg-muted text-muted-foreground', label: 'Agent' },
  system: { icon: Bot, className: 'bg-muted text-muted-foreground', label: 'System' },
  summary: { icon: CheckCircle2, className: 'bg-primary/10 text-primary', label: 'Phase' },
  ask: { icon: User, className: 'bg-primary/10 text-primary', label: 'Answer' },
  error: { icon: AlertTriangle, className: 'bg-destructive/10 text-destructive', label: 'Error' },
};

/**
 * The short main transcript for the active slide project (PRD US-012). Shows
 * only user messages, brief narrations, phase summaries, and errors — the
 * sub-session tool chatter stays out of this rail.
 */
export function Transcript({ messages }: { messages: SlideMainMessage[] }) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const meta = ROLE_META[m.role];
        const Icon = meta.icon;
        return (
          <div key={m.id} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.className}`}
              title={meta.label}
              aria-label={meta.label}
            >
              <Icon size={12} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
                {m.content}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
