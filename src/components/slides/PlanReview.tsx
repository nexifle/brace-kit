import { useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardEdit,
  FileText,
  Hammer,
  Loader2,
  Rocket,
  X,
} from 'lucide-react';
import { useSlideStore } from '../../store/slideStore.ts';
import { getSlideFile } from '../../utils/slideVfs.ts';
import { hasValidPlanFiles } from '../../services/slidePhases.ts';
import { renderMarkdown } from '../../utils/markdown.ts';
import { Btn } from '../ui/Btn.tsx';

type PlanFile = 'brief' | 'design';

const PLAN_PATH: Record<PlanFile, string> = {
  brief: '/brief.md',
  design: '/design.md',
};

const TAB_META: Record<PlanFile, { label: string; hint: string }> = {
  brief: { label: 'Brief', hint: 'Content & structure spec' },
  design: { label: 'Design', hint: 'Visual system & rules' },
};

/**
 * The plan-review panel (US-018). Shown once the plan phase produces a valid
 * brief + design: renders the markdown of the active tab, lets the user edit
 * and save it back into the VFS, and offers the primary **Build slides** action
 * — gated on `plan_ready` AND both plan files being non-empty.
 *
 * Presentational towards the store: reads the active project / phase / busy and
 * drives `updatePlanFile` (edit save) and `requestBuild` (Build CTA). It is
 * rendered in both the wide rail and narrow dock so a ready plan is reachable.
 */
export function PlanReview({ onBuild }: { onBuild?: () => void }) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const phase = useSlideStore((s) => s.phase);
  const busy = useSlideStore((s) => s.busy);
  const updatePlanFile = useSlideStore((s) => s.updatePlanFile);
  const requestBuild = useSlideStore((s) => s.requestBuild);

  const [tab, setTab] = useState<PlanFile>('brief');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const files = activeProject?.files ?? [];

  /** Current content of the active tab from the live VFS. */
  const fileContent = useMemo(
    () => getSlideFile(files, PLAN_PATH[tab])?.content ?? '',
    [files, tab]
  );

  /** True when the active tab has unsaved local edits. */
  const dirty = editing && draft !== fileContent;

  /** Build is blocked unless plan_ready AND both brief + design are non-empty. */
  const canBuild = phase === 'plan_ready' && hasValidPlanFiles(files);

  function beginEdit() {
    setDraft(fileContent);
    setEditing(true);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    });
  }

  function discardEdit() {
    setEditing(false);
    setDraft('');
  }

  function saveEdit() {
    if (!editing) return;
    updatePlanFile(PLAN_PATH[tab], draft);
    setEditing(false);
    setDraft('');
  }

  const handleBuild = () => (onBuild ? onBuild() : requestBuild());

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-primary/20 bg-card/60 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-border/70 bg-primary/[0.04] shrink-0">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary shrink-0">
          <Rocket size={13} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold text-foreground leading-tight">Plan ready to build</p>
          <p className="text-[10px] leading-tight text-muted-foreground truncate">
            Review the brief &amp; design below
          </p>
        </div>
        {busy && <Loader2 size={14} className="text-primary animate-spin shrink-0" />}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-2 pt-2 border-b border-border/60 shrink-0">
        {(Object.keys(TAB_META) as PlanFile[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setEditing(false);
            }}
            className={`relative flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${
              tab === key
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
            }`}
            aria-pressed={tab === key}
          >
            <FileText size={13} className={tab === key ? 'text-primary' : ''} />
            {TAB_META[key].label}
            {tab === key && (
              <span className="absolute inset-x-2 -bottom-[0.5px] h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            placeholder={`Edit your ${TAB_META[tab].label.toLowerCase()}…`}
            className="block h-56 w-full resize-y bg-transparent px-3 py-2.5 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-0"
          />
        ) : fileContent.trim() ? (
          <div className="h-56 overflow-y-auto px-3 py-2.5">
            <div
              className="prose prose-sm dark:prose-invert max-w-none prose-headings:mt-3 prose-headings:mb-1 prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-1 prose-pre:bg-muted/70 prose-code:before:content-none prose-code:after:content-none"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
            />
          </div>
        ) : (
          <div className="flex h-56 flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="flex items-center justify-center w-9 h-9 rounded-full bg-muted text-muted-foreground">
              <FileText size={16} />
            </span>
            <p className="text-xs text-muted-foreground">
              The {TAB_META[tab].label.toLowerCase()} is empty — start editing to add one.
            </p>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-2.5 py-2 shrink-0">
        {editing ? (
          <>
            <button
              type="button"
              onClick={discardEdit}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X size={13} />
              Discard
            </button>
            <Btn
              size="sm"
              variant="default"
              disabled={!dirty}
              onClick={saveEdit}
              className="h-8 min-w-[5.5rem]"
            >
              <Check size={13} />
              Save
            </Btn>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={beginEdit}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ClipboardEdit size={13} />
              Edit
            </button>
            <Btn
              size="sm"
              variant="default"
              disabled={!canBuild || busy}
              onClick={handleBuild}
              className="h-8 min-w-[7.5rem]"
              title={!canBuild ? 'Add a brief and design before building' : undefined}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Hammer size={13} />}
              Build slides
            </Btn>
          </>
        )}
      </div>

      {!canBuild && !editing && (
        <p className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground/70">
          Add both a brief and a design to unlock build.
        </p>
      )}
    </div>
  );
}
