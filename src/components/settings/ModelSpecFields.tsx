import type { ComponentType, SVGProps } from 'react';
import {
  BracesIcon,
  EyeIcon,
  FileTextIcon,
  GlobeIcon,
  HeadphonesIcon,
  ImageIcon,
  SparklesIcon,
  TypeIcon,
  VideoIcon,
  WrenchIcon,
  BrainIcon,
} from 'lucide-react';
import type { ModelCapabilities, ModelModality, ModelMode, ModelSpec, ReasoningControl } from '../../types/index.ts';
import { cn } from '../../utils/cn.ts';

type IconCmp = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const MODALITIES: { id: ModelModality; label: string; icon: IconCmp }[] = [
  { id: 'text', label: 'Text', icon: TypeIcon },
  { id: 'image', label: 'Image', icon: ImageIcon },
  { id: 'audio', label: 'Audio', icon: HeadphonesIcon },
  { id: 'video', label: 'Video', icon: VideoIcon },
  { id: 'pdf', label: 'PDF', icon: FileTextIcon },
];

const CAPABILITIES: { key: keyof ModelCapabilities; label: string; hint: string; icon: IconCmp }[] = [
  { key: 'tools', label: 'Tools', hint: 'Function calling', icon: WrenchIcon },
  { key: 'vision', label: 'Vision', hint: 'Read images', icon: EyeIcon },
  { key: 'reasoning', label: 'Reasoning', hint: 'Think before reply', icon: BrainIcon },
  { key: 'structuredOutput', label: 'Structured', hint: 'JSON schema', icon: BracesIcon },
  { key: 'googleSearch', label: 'Search', hint: 'Google grounding', icon: GlobeIcon },
  { key: 'imageGeneration', label: 'Image gen', hint: 'Native images', icon: SparklesIcon },
];

export function emptySpec(id = ''): ModelSpec {
  return {
    id,
    mode: 'chat',
    limit: {},
    modalities: { input: ['text'], output: ['text'] },
    capabilities: {},
  };
}

interface ModelSpecFieldsProps {
  spec: ModelSpec;
  onChange: (next: ModelSpec) => void;
  disabled?: boolean;
  showIdentity?: boolean;
}

function toggleIn(list: ModelModality[] | undefined, item: ModelModality): ModelModality[] {
  const cur = list ?? [];
  return cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
}

function withVisionImageInput(spec: ModelSpec): ModelSpec {
  if (!spec.capabilities?.vision) return spec;
  const input = spec.modalities?.input ?? [];
  if (input.includes('image')) return spec;
  return {
    ...spec,
    modalities: {
      input: [...input, 'image'],
      output: spec.modalities?.output ?? ['text'],
    },
  };
}

export function ModelSpecFields({ spec, onChange, disabled, showIdentity = true }: ModelSpecFieldsProps) {
  const set = (patch: Partial<ModelSpec>) => {
    onChange(withVisionImageInput({ ...spec, ...patch, id: patch.id ?? spec.id }));
  };
  const setLimit = (key: 'context' | 'input' | 'output', raw: string) => {
    const n = raw === '' ? undefined : parseInt(raw, 10);
    set({ limit: { ...spec.limit, [key]: Number.isFinite(n as number) ? n : undefined } });
  };
  const setCap = (key: keyof ModelCapabilities, value: boolean) => {
    set({ capabilities: { ...spec.capabilities, [key]: value } });
  };
  const visionLocksImage = !!spec.capabilities?.vision;

  const fieldClass =
    'w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground placeholder:text-muted-foreground/40 disabled:opacity-70 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-3">
      {showIdentity && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Model ID</label>
            <input
              className={fieldClass}
              value={spec.id}
              disabled={disabled}
              placeholder="e.g. gpt-4o"
              onChange={(e) => set({ id: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Display name</label>
            <input
              className={fieldClass}
              value={spec.name || ''}
              disabled={disabled}
              placeholder="Optional"
              onChange={(e) => set({ name: e.target.value || undefined })}
            />
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Mode</label>
        <select
          className={fieldClass}
          value={spec.mode || 'chat'}
          disabled={disabled}
          onChange={(e) => set({ mode: e.target.value as ModelMode })}
        >
          <option value="chat">Chat</option>
          <option value="image_generation">Image generation</option>
          <option value="embedding">Embedding</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Context</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            disabled={disabled}
            placeholder="—"
            value={spec.limit?.context ?? ''}
            onChange={(e) => setLimit('context', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Max input</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            disabled={disabled}
            placeholder="—"
            value={spec.limit?.input ?? ''}
            onChange={(e) => setLimit('input', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Max output</label>
          <input
            type="number"
            min={0}
            className={fieldClass}
            disabled={disabled}
            placeholder="—"
            value={spec.limit?.output ?? ''}
            onChange={(e) => setLimit('output', e.target.value)}
          />
        </div>
      </div>

      <ModalityRow
        label="Input modalities"
        value={
          visionLocksImage && !spec.modalities?.input?.includes('image')
            ? [...(spec.modalities?.input ?? []), 'image']
            : spec.modalities?.input
        }
        disabled={disabled}
        locked={visionLocksImage ? ['image'] : undefined}
        onToggle={(m) => {
          if (visionLocksImage && m === 'image') return;
          set({
            modalities: {
              input: toggleIn(spec.modalities?.input, m),
              output: spec.modalities?.output ?? ['text'],
            },
          });
        }}
      />
      <ModalityRow
        label="Output modalities"
        value={spec.modalities?.output}
        disabled={disabled}
        onToggle={(m) =>
          set({
            modalities: {
              input: spec.modalities?.input ?? ['text'],
              output: toggleIn(spec.modalities?.output, m),
            },
          })
        }
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Capabilities</span>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Capabilities">
          {CAPABILITIES.map(({ key, label, hint, icon: Icon }) => {
            const on = !!spec.capabilities?.[key];
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => setCap(key, !on)}
                className={cn(
                  'group flex items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors select-none',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  on
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-muted/30 border-border/50',
                  disabled
                    ? 'cursor-default opacity-90'
                    : on
                      ? 'hover:bg-primary/15 hover:border-primary/40'
                      : 'hover:bg-muted/50 hover:border-border',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                    on
                      ? 'bg-primary/15 border-primary/25 text-primary'
                      : 'bg-background/50 border-border/60 text-muted-foreground/70',
                  )}
                >
                  <Icon size={13} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex flex-col gap-0 leading-tight">
                  <span className={cn('text-sm font-medium', on ? 'text-foreground' : 'text-foreground/80')}>
                    {label}
                  </span>
                  <span className="text-[11px] text-muted-foreground leading-snug">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {spec.capabilities?.reasoning && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">Reasoning control</label>
          <select
            className={fieldClass}
            disabled={disabled}
            value={spec.reasoningControl || 'effort'}
            onChange={(e) => set({ reasoningControl: e.target.value as ReasoningControl })}
          >
            <option value="effort">Effort</option>
            <option value="budget">Budget</option>
            <option value="toggle">Toggle</option>
          </select>
        </div>
      )}
    </div>
  );
}

function ModalityRow({
  label,
  value,
  disabled,
  locked,
  onToggle,
}: {
  label: string;
  value?: ModelModality[];
  disabled?: boolean;
  locked?: ModelModality[];
  onToggle: (m: ModelModality) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">{label}</span>
      <div
        className="grid grid-cols-5 gap-px overflow-hidden rounded-md border border-border/60 bg-border/60"
        role="group"
        aria-label={label}
      >
        {MODALITIES.map(({ id, label: itemLabel, icon: Icon }, i) => {
          const on = value?.includes(id);
          const isLocked = locked?.includes(id);
          const cellDisabled = disabled || isLocked;
          return (
            <button
              key={id}
              type="button"
              disabled={cellDisabled}
              aria-pressed={on}
              title={isLocked ? 'Required while Vision is on' : undefined}
              onClick={() => onToggle(id)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 min-h-12 px-1 py-1.5 text-[11px] font-medium leading-none transition-colors',
                'focus-visible:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring',
                i === 0 && 'rounded-l-[5px]',
                i === MODALITIES.length - 1 && 'rounded-r-[5px]',
                on
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted/40 text-muted-foreground',
                cellDisabled
                  ? 'cursor-default'
                  : on
                    ? 'hover:bg-primary/15'
                    : 'hover:bg-muted/70 hover:text-foreground',
              )}
            >
              <Icon size={14} strokeWidth={on ? 2.25 : 2} />
              <span>{itemLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
