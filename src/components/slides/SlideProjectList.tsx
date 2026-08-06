import { useEffect, useState } from 'react';
import {
  Search,
  X,
  History,
  Plus,
  Trash2,
  Layers,
  Presentation,
  FileText,
  CircleSlash2,
  Clock,
} from 'lucide-react';
import { cn } from '../../utils/cn.ts';
import { useSlideStore } from '../../store/slideStore.ts';
import { SLIDE_CANVAS_PRESETS, SLIDE_PHASE_STATUS_COPY } from '../../types/index.ts';
import type { SlidePhase } from '../../types/index.ts';
import type { StoredSlideProject } from '../../utils/slideDB.ts';

/**
 * "Previous decks" history surface (US-026): lists past slide projects by
 * recency, lets the user reopen one (restoring its transcript, VFS, deck, and
 * any suspended ask), create a fresh deck, or delete a project.
 *
 * Read-only use of the timeline: it never writes to IndexedDB itself — reopening
 * routes through the store's `restoreLastActiveProject(id)` and on the "New
 * deck" CTA the shell closes the list so the composer can create a fresh project.
 */

/* Period labels for the timeline grouping. */
const PERIOD_LABELS: { min: number; label: string }[] = [
  { min: 60_000, label: 'Just now' },
  { min: 3_600_000, label: 'Today' },
  { min: 86_400_000, label: 'Yesterday' },
  { min: 7 * 86_400_000, label: 'Past 7 days' },
  { min: 30 * 86_400_000, label: 'Past 30 days' },
];

function periodKey(updatedAt: number): string {
  const age = Date.now() - updatedAt;
  for (const p of PERIOD_LABELS) if (age < p.min) return p.label;
  return 'Older';
}

/** Short relative timestamp e.g. "2h ago". */
function timeAgo(updatedAt: number): string {
  const s = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return new Date(updatedAt).toLocaleDateString();
}

function PhaseBadge({ phase }: { phase: SlidePhase }) {
  const label = SLIDE_PHASE_STATUS_COPY[phase] ?? 'Project';
  const pending = phase === 'plan' || phase === 'build' || phase === 'edit';
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
      {pending && <span className="h-1 w-1 rounded-full bg-primary animate-pulse" />}
      <span className="truncate">{label}</span>
    </span>
  );
}

function MetaIcon({ phase }: { phase: SlidePhase }) {
  if (phase === 'plan' || phase === 'plan_ready') {
    return <FileText size={13} />;
  }
  if (phase === 'build' || phase === 'edit' || phase === 'ready') {
    return <Layers size={13} />;
  }
  return <CircleSlash2 size={13} />;
}

/* ------------------------------------------------------------------------ */

export function SlideProjectList({
  open,
  onClose,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  /** Fired when the user wants a brand-new deck (list closes; composer takes over). */
  onNew: () => void;
}) {
  const activeProjectId = useSlideStore((s) => s.activeProjectId);
  const restoreLastActiveProject = useSlideStore((s) => s.restoreLastActiveProject);
  const deleteProject = useSlideStore((s) => s.deleteProject);
  const [projects, setProjects] = useState<StoredSlideProject[] | null>(null);
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => {
    setProjects(null);
    void useSlideStore.getState().listProjects().then((list) => setProjects(list));
  };
  useEffect(() => {
    if (open) load();
    if (!open) {
      setQuery('');
      setConfirmDelete(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = (projects ?? []).filter((p) => (q ? p.title.toLowerCase().includes(q) : true));

  const reopen = (id: string) => {
    void restoreLastActiveProject(id);
    onClose();
  };

  const confirm = confirmDelete
    ? projects?.find((p) => p.id === confirmDelete) ?? null
    : null;

  const remove = (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setConfirmDelete(null);
    void deleteProject(id).then(() => {
      setProjects((prev) => prev?.filter((p) => p.id !== id) ?? []);
    });
  };

  const grouped = filtered.reduce<{ label: string; items: StoredSlideProject[] }[]>(
    (acc, p) => {
      const label = periodKey(p.updatedAt);
      const last = acc[acc.length - 1];
      if (last && last.label === label) last.items.push(p);
      else acc.push({ label, items: [p] });
      return acc;
    },
    []
  );

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 h-11 border-b border-border/70 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
            <History size={13} />
          </span>
          <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-muted-foreground truncate">
            Previous decks
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close"
          aria-label="Close"
        >
          <X size={15} />
        </button>
      </div>

      {projects === null ? (
        <div className="flex flex-col items-center justify-center gap-2 flex-1 py-10 text-center">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : projects.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center text-center gap-3 px-6 py-12 animate-in fade-in duration-300">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-muted text-muted-foreground">
            <History size={22} />
          </div>
          <p className="text-sm font-semibold text-foreground">No decks yet</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[240px]">
            Decks you create in Slide Creator will show up here so you can reopen and keep editing them.
          </p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="px-2.5 pt-2.5 shrink-0">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search decks…"
                aria-label="Search decks"
                className="w-full h-8 pl-9 pr-8 text-sm bg-muted/40 border border-transparent focus:border-primary/40 focus:bg-background rounded-md outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-sm text-muted-foreground/60 hover:text-foreground hover:bg-accent transition-colors"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Timeline list */}
          <div className="flex-1 min-h-0 overflow-y-auto px-1.5 py-2 space-y-3">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-10 text-center">
                <CircleSlash2 size={20} className="text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No decks match “{query}”</p>
              </div>
            ) : (
              grouped.map((group) => (
                <div key={group.label}>
                  <div className="flex items-center gap-2 px-2 pt-1 pb-1">
                    <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">
                      {group.label}
                    </span>
                    <span className="flex-1 h-px bg-border/50" />
                  </div>
                  <div className="space-y-1">
                    {group.items.map((p) => {
                      const active = p.id === activeProjectId;
                      const preset =
                        SLIDE_CANVAS_PRESETS[p.canvas] ?? SLIDE_CANVAS_PRESETS['16:9'];
                      return (
                        <div
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => reopen(p.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              reopen(p.id);
                            }
                          }}
                          title="Open this deck"
                          className={cn(
                            'group relative cursor-pointer rounded-lg border transition-colors',
                            active
                              ? 'border-primary/30 bg-primary/5'
                              : 'border-transparent hover:border-border hover:bg-muted/40'
                          )}
                        >
                          {/* Delete affordance on hover */}
                          {!active && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                remove(p.id);
                              }}
                              className={cn(
                                'absolute right-1.5 top-1/2 -translate-y-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-all',
                                confirmDelete === p.id
                                  ? 'opacity-100 bg-destructive/10 text-destructive'
                                  : 'opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-destructive'
                              )}
                              title={confirmDelete === p.id ? 'Click again to confirm' : 'Delete deck'}
                              aria-label={
                                confirmDelete === p.id
                                  ? `Confirm delete ${p.title}`
                                  : `Delete ${p.title}`
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          )}

                          <div className="flex items-center gap-2.5 px-2.5 py-2 pr-8">
                            <span
                              className={cn(
                                'flex items-center justify-center w-8 h-8 shrink-0 rounded-lg border',
                                active
                                  ? 'bg-primary/10 text-primary border-primary/20'
                                  : 'bg-muted/50 text-muted-foreground border-border/70'
                              )}
                            >
                              <Presentation size={15} />
                            </span>

                            <div className="min-w-0 flex-1">
                              <p
                                className={cn(
                                  'truncate text-[13px] leading-snug',
                                  active ? 'text-primary font-semibold' : 'text-foreground font-medium'
                                )}
                              >
                                {p.title || 'Untitled deck'}
                              </p>
                              <div className="flex items-center gap-1.5 pt-0.5 text-2xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Clock size={11} />
                                  {timeAgo(p.updatedAt)}
                                </span>
                                <span className="text-muted-foreground/30">·</span>
                                <span className="flex items-center gap-1 text-muted-foreground/80">
                                  <MetaIcon phase={p.phase} />
                                  {preset.label}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              <PhaseBadge phase={p.phase} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Confirm-delete banner */}
      {confirm && (
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-border/70 bg-muted/30 animate-in fade-in slide-in-from-bottom-1 duration-200 shrink-0">
          <Trash2 size={14} className="text-destructive shrink-0" />
          <p className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
            Delete “{confirm.title || 'Untitled deck'}”? This removes its transcript, files, and
            preview — it cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="px-2 h-7 rounded-md text-2xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void deleteProject(confirmDelete!).then(() => {
              setConfirmDelete(null);
              setProjects((prev) => prev?.filter((p) => p.id !== confirmDelete!) ?? []);
            })}
            className="px-2 h-7 rounded-md text-2xs font-semibold bg-destructive text-destructive-foreground hover:brightness-110 transition-all"
          >
            Delete
          </button>
        </div>
      )}

      {/* Footer action */}

      <div className="flex items-center justify-between px-2.5 py-2.5 border-t border-border/70 shrink-0">
        <span className="flex items-center gap-1.5 text-2xs text-muted-foreground/60">
          <Clock size={12} />
          {projects?.length ? `${projects.length} deck${projects.length === 1 ? '' : 's'}` : ''}
        </span>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-semibold bg-primary text-primary-foreground shadow-sm hover:brightness-110 active:scale-95 transition-all"
        >
          <Plus size={14} />
          New deck
        </button>
      </div>
    </div>
  );
}
