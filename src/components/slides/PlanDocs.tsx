import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, ClipboardEdit, FileText, Files, X } from 'lucide-react';
import { DeckUploadsPanel } from './chat/SlideAttachmentViews.tsx';
import { useSlideStore } from '../../store/slideStore.ts';
import { getSlideFile } from '../../utils/slideVfs.ts';
import { renderMarkdown } from '../../utils/markdown.ts';
import { Btn } from '../ui/Btn.tsx';

type DocTab = 'brief' | 'design' | 'uploads';

const PLAN_PATH: Record<'brief' | 'design', string> = {
  brief: '/brief.md',
  design: '/design.md',
};

const TAB_META: Record<DocTab, { label: string; hint: string }> = {
  brief: { label: 'Brief', hint: 'Content & structure spec' },
  design: { label: 'Design', hint: 'Visual system & rules' },
  uploads: { label: 'Uploads', hint: 'Attached txt and images in /uploads' },
};

/**
 * Persistent reader for the plan documents (`/brief.md`, `/design.md`).
 *
 * Unlike the chat-bound `PlanReview` card — which only mounts at `plan_ready`
 * — this overlay is reachable from the shell header in every phase, so the
 * brief/design stay readable once the build begins. It reads straight from the
 * live VFS via `getSlideFile`, renders the active tab as typography prose, and
 * keeps the same edit-and-save flow (`updatePlanFile`) as `PlanReview`.
 *
 * Layout-agnostic: it portals over the whole shell, so it reads identically in
 * the wide (sidebar/rail) and narrow (dock/tab) shell layouts.
 */
export function PlanDocs({ open, onClose }: { open: boolean; onClose: () => void }) {
  const activeProject = useSlideStore((s) => s.activeProject);
  const updatePlanFile = useSlideStore((s) => s.updatePlanFile);

  const [tab, setTab] = useState<DocTab>('brief');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const files = activeProject?.files ?? [];

  const fileContent = useMemo(
    () => (tab === 'uploads' ? '' : getSlideFile(files, PLAN_PATH[tab])?.content ?? ''),
    [files, tab]
  );

  const dirty = editing && draft !== fileContent;

  const wordCount = useMemo(
    () => fileContent.trim().split(/\s+/).filter(Boolean).length,
    [fileContent]
  );

  // Drop any in-flight edit when the overlay closes (or the tab changes).
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setDraft('');
    }
  }, [open]);

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
    if (!editing || tab === 'uploads') return;
    updatePlanFile(PLAN_PATH[tab], draft);
    setEditing(false);
    setDraft('');
  }

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-stretch justify-center sm:items-center p-0 sm:p-4 pointer-events-auto"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div
        className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[88vh] sm:rounded-xl border-0 sm:border border-border bg-card shadow-2xl animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-label="Project brief and design"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border px-3 py-3 sm:px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground tracking-tight">
              Project docs
            </h3>
            <p className="truncate text-2xs text-muted-foreground">
              Brief, design, and uploaded files
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Close"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border px-3 py-2">
          {(Object.keys(TAB_META) as DocTab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
                setEditing(false);
              }}
              className={`relative flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                tab === key
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              aria-pressed={tab === key}
              title={TAB_META[key].hint}
            >
              {key === 'uploads' ? (
                <Files size={13} className={tab === key ? 'text-primary' : ''} />
              ) : (
                <FileText size={13} className={tab === key ? 'text-primary' : ''} />
              )}
              {TAB_META[key].label}
              {key !== 'uploads' && (
                <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground/80">
                  {wordCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'uploads' ? (
            <DeckUploadsPanel />
          ) : editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              placeholder={`Edit your ${TAB_META[tab].label.toLowerCase()}…`}
              className="block min-h-[50vh] w-full resize-y bg-transparent px-4 py-3 font-mono text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-0"
            />
          ) : fileContent.trim() ? (
            <div className="w-full px-4 py-6 sm:px-8 sm:py-8">
              {/* Document meta strip */}
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-mono">
                  <FileText size={12} />
                  {PLAN_PATH[tab]}
                </span>
                <span className="text-muted-foreground/60">·</span>
                <span className="tabular-nums">{wordCount} words</span>
                {activeProject && (
                  <>
                    <span className="text-muted-foreground/60">·</span>
                    <span>
                      Updated{' '}
                      {new Date(activeProject.updatedAt).toLocaleString()}
                    </span>
                  </>
                )}
              </div>
              <div
                className="prose prose-sm lg:prose-base dark:prose-invert max-w-none prose-headings:mt-5 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-pre:my-2 prose-pre:bg-muted/70 prose-code:before:content-none prose-code:after:content-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(fileContent) }}
              />
            </div>
          ) : (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <FileText size={16} />
              </span>
              <p className="text-xs text-muted-foreground">
                No {TAB_META[tab].label.toLowerCase()} yet — run the plan phase to create one.
              </p>
            </div>
          )}
        </div>

        {/* Footer action row */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2.5 shrink-0">
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
              <div className="flex items-center gap-2">
                <Btn size="sm" variant="default" disabled={!dirty} onClick={saveEdit} className="h-8 min-w-[5.5rem]">
                  <Check size={13} />
                  Save
                </Btn>
              </div>
            </>
          ) : (
            <>
              {tab !== 'uploads' && (
                <button
                  type="button"
                  onClick={beginEdit}
                  disabled={!fileContent.trim()}
                  className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ClipboardEdit size={13} />
                  Edit
                </button>
              )}
              {tab === 'uploads' && <span />}
              <Btn size="sm" variant="default" onClick={onClose} className="h-8">
                Done
              </Btn>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}