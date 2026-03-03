import { useState } from 'react';
import { useStore } from '../../store/index.ts';
import { QUICK_ACTIONS } from '../../content/selection-ui/constants.ts';
import type { CustomQuickAction } from '../../types/index.ts';
import { PencilIcon, XIcon, CheckIcon, RotateCcwIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react';

// ─── Category labels for the dropdown ───────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: '', label: 'None' },
  { value: 'analysis', label: 'Analyze' },
  { value: 'transform', label: 'Transform' },
  { value: 'tone', label: 'Change Tone' },
  { value: 'fix', label: 'Fix & Improve' },
  { value: 'custom', label: 'Custom' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryLabel(cat?: string) {
  return CATEGORY_OPTIONS.find((o) => o.value === cat)?.label ?? cat ?? '—';
}

// ─── Built-in Action Row ──────────────────────────────────────────────────────

interface BuiltinRowProps {
  action: { id: string; label: string; category?: string; isPrimary?: boolean };
  override?: { label?: string; disabled?: boolean; isPrimary?: boolean; category?: string };
  onOverride: (id: string, patch: { label?: string; disabled?: boolean; isPrimary?: boolean; category?: string }) => void;
  onReset: (id: string) => void;
}

function BuiltinRow({ action, override, onOverride, onReset }: BuiltinRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftPrimary, setDraftPrimary] = useState<boolean | undefined>(undefined);
  const [draftCategory, setDraftCategory] = useState('');

  const isDisabled = override?.disabled ?? false;
  const effectiveLabel = override?.label ?? action.label;
  const effectivePrimary = override?.isPrimary ?? action.isPrimary;
  const effectiveCategory = override?.category ?? action.category ?? '';
  const hasOverride = !!(override?.label || override?.isPrimary !== undefined || override?.category || override?.disabled);

  function startEdit() {
    setDraftLabel(effectiveLabel);
    setDraftPrimary(effectivePrimary);
    setDraftCategory(effectiveCategory);
    setEditing(true);
  }

  function saveEdit() {
    onOverride(action.id, {
      // Send undefined to clear an override field (revert to action default)
      label: draftLabel.trim() !== action.label ? draftLabel.trim() || undefined : undefined,
      isPrimary: draftPrimary !== action.isPrimary ? draftPrimary : undefined,
      category: draftCategory !== (action.category ?? '') ? draftCategory || undefined : undefined,
    });
    setEditing(false);
  }

  return (
    <div className={`group flex flex-col gap-1.5 p-2.5 rounded-lg border transition-all ${isDisabled ? 'bg-secondary/10 border-border/20 opacity-50' : 'bg-secondary/20 border-border/40 hover:bg-secondary/40'}`}>
      {!editing ? (
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-foreground">{effectiveLabel}</span>
              {hasOverride && (
                <span className="text-2xs px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 font-bold uppercase tracking-wider">Modified</span>
              )}
              <span className="text-2xs px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium uppercase tracking-wider">
                {effectivePrimary !== false ? 'Toolbar' : 'More'}
              </span>
              {effectiveCategory && (
                <span className="text-2xs px-1 py-0.5 rounded bg-primary/10 text-primary font-medium">{categoryLabel(effectiveCategory)}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {hasOverride && (
              <button
                title="Reset to default"
                className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-all"
                onClick={() => onReset(action.id)}
              >
                <RotateCcwIcon size={11} />
              </button>
            )}
            <button
              title="Edit"
              className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
              onClick={startEdit}
            >
              <PencilIcon size={11} />
            </button>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={!isDisabled}
                onChange={(e) => onOverride(action.id, { disabled: !e.target.checked })}
              />
              <div className="w-7 h-4 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
            </label>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 h-7 px-2 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none text-foreground"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Label"
              autoFocus
            />
            <select
              className="h-7 px-1.5 text-xs bg-muted/40 border border-input rounded outline-none text-foreground cursor-pointer"
              value={draftPrimary === false ? 'more' : 'toolbar'}
              onChange={(e) => setDraftPrimary(e.target.value === 'toolbar')}
            >
              <option value="toolbar">Toolbar</option>
              <option value="more">More menu</option>
            </select>
            <select
              className="h-7 px-1.5 text-xs bg-muted/40 border border-input rounded outline-none text-foreground cursor-pointer"
              value={draftCategory}
              onChange={(e) => setDraftCategory(e.target.value)}
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-1.5 justify-end">
            <button
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-all"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="h-6 px-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-all flex items-center gap-1"
              onClick={saveEdit}
            >
              <CheckIcon size={10} />
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Custom Action Row ────────────────────────────────────────────────────────

interface CustomRowProps {
  action: CustomQuickAction;
  onEdit: (action: CustomQuickAction) => void;
  onRemove: (id: string) => void;
}

function CustomRow({ action, onEdit, onRemove }: CustomRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="group flex flex-col gap-0 rounded-lg border border-border/40 bg-secondary/20 hover:bg-secondary/40 transition-all overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground">{action.label}</span>
            <span className="text-2xs px-1 py-0.5 rounded bg-primary/10 text-primary font-bold uppercase tracking-wider">Custom</span>
            <span className="text-2xs px-1 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium uppercase tracking-wider">
              {action.isPrimary !== false ? 'Toolbar' : 'More'}
            </span>
            {action.category && (
              <span className="text-2xs px-1 py-0.5 rounded bg-secondary/80 text-muted-foreground font-medium">{categoryLabel(action.category)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            title="Expand prompt"
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUpIcon size={11} /> : <ChevronDownIcon size={11} />}
          </button>
          <button
            title="Edit"
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            onClick={() => onEdit(action)}
          >
            <PencilIcon size={11} />
          </button>
          <button
            title="Remove"
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            onClick={() => onRemove(action.id)}
          >
            <XIcon size={11} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-2.5 pb-2.5 animate-in fade-in duration-150">
          <div className="p-2 rounded bg-muted/30 border border-border/30">
            <p className="text-2xs text-muted-foreground font-mono whitespace-pre-wrap break-words leading-relaxed">{action.promptTemplate}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────

interface ActionFormProps {
  initial?: CustomQuickAction;
  onSave: (data: Omit<CustomQuickAction, 'id' | 'createdAt'>) => void;
  onCancel: () => void;
}

function ActionForm({ initial, onSave, onCancel }: ActionFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [promptTemplate, setPromptTemplate] = useState(initial?.promptTemplate ?? '');
  const [isPrimary, setIsPrimary] = useState<boolean>(initial?.isPrimary !== false);
  const [category, setCategory] = useState(initial?.category ?? '');

  function handleSave() {
    if (!label.trim() || !promptTemplate.trim()) return;
    onSave({
      label: label.trim(),
      promptTemplate: promptTemplate.trim(),
      isPrimary,
      category: category || undefined,
    });
  }

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-bold uppercase tracking-wider text-muted-foreground/80">Label <span className="text-destructive">*</span></label>
          <input
            type="text"
            className="h-8 px-2.5 text-xs bg-muted/40 border border-input rounded outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground placeholder:text-muted-foreground/40"
            placeholder="e.g. ELI5"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-2xs font-bold uppercase tracking-wider text-muted-foreground/80">Position</label>
          <select
            className="h-8 px-2 text-xs bg-muted/40 border border-input rounded outline-none text-foreground cursor-pointer"
            value={isPrimary ? 'toolbar' : 'more'}
            onChange={(e) => setIsPrimary(e.target.value === 'toolbar')}
          >
            <option value="toolbar">Toolbar — always visible</option>
            <option value="more">More — in dropdown menu</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-2xs font-bold uppercase tracking-wider text-muted-foreground/80">Category</label>
        <select
          className="h-8 px-2 text-xs bg-muted/40 border border-input rounded outline-none text-foreground cursor-pointer"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-2xs font-bold uppercase tracking-wider text-muted-foreground/80">
          Prompt Template <span className="text-destructive">*</span>
        </label>
        <textarea
          className="min-h-[90px] px-2.5 py-2 text-xs bg-muted/40 border border-input rounded outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground placeholder:text-muted-foreground/40 resize-none font-mono leading-relaxed"
          placeholder={"Explain the following text like I'm 5 years old:\n\n{{text}}"}
          value={promptTemplate}
          onChange={(e) => setPromptTemplate(e.target.value)}
        />
        <p className="text-2xs text-muted-foreground">
          Use <code className="px-1 py-0.5 rounded bg-muted/60 font-mono">{"{{text}}"}</code> as placeholder for the selected text.
        </p>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded transition-all"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          disabled={!label.trim() || !promptTemplate.trim()}
          className="h-8 px-3 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-sm"
          onClick={handleSave}
        >
          <CheckIcon size={11} />
          {initial ? 'Save Changes' : 'Add Action'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SelectionActionsSettings() {
  const store = useStore();
  const [showForm, setShowForm] = useState(false);
  const [editingAction, setEditingAction] = useState<CustomQuickAction | null>(null);

  function handleAddAction(data: Omit<CustomQuickAction, 'id' | 'createdAt'>) {
    store.addCustomQuickAction(data);
    setShowForm(false);
  }

  function handleUpdateAction(data: Omit<CustomQuickAction, 'id' | 'createdAt'>) {
    if (!editingAction) return;
    store.updateCustomQuickAction(editingAction.id, data);
    setEditingAction(null);
  }

  function handleEditStart(action: CustomQuickAction) {
    setShowForm(false);
    setEditingAction(action);
  }

  function handleOverride(id: string, patch: { label?: string; disabled?: boolean; isPrimary?: boolean; category?: string }) {
    store.setBuiltinActionOverride(id, patch);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Built-in Actions ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-0.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">Built-in Actions</h4>
          <span className="text-2xs text-muted-foreground/50">Toggle, rename, or move to More</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <BuiltinRow
              key={a.id}
              action={a}
              override={store.builtinActionOverrides[a.id]}
              onOverride={handleOverride}
              onReset={store.resetBuiltinActionOverride}
            />
          ))}
        </div>
      </div>

      {/* ── Custom Actions ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-0.5">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/70">Custom Actions</h4>
          {!showForm && !editingAction && (
            <button
              className="w-6 h-6 flex items-center justify-center rounded bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
              title="Add custom action"
              onClick={() => setShowForm(true)}
            >
              <PlusIcon size={12} />
            </button>
          )}
        </div>

        {store.customQuickActions.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-4 px-2 text-center rounded-lg border border-dashed border-border/50 bg-secondary/10">
            <p className="text-xs text-muted-foreground italic">No custom actions yet.</p>
            <button
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => setShowForm(true)}
            >
              Add your first custom action
            </button>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          {store.customQuickActions.map((action) =>
            editingAction?.id === action.id ? (
              <ActionForm
                key={action.id}
                initial={editingAction}
                onSave={handleUpdateAction}
                onCancel={() => setEditingAction(null)}
              />
            ) : (
              <CustomRow
                key={action.id}
                action={action}
                onEdit={handleEditStart}
                onRemove={store.removeCustomQuickAction}
              />
            )
          )}
        </div>

        {showForm && (
          <ActionForm
            onSave={handleAddAction}
            onCancel={() => setShowForm(false)}
          />
        )}
      </div>
    </div>
  );
}
