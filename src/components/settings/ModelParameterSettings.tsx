import { useStore } from '../../store/index.ts';
import { SUPPORTED_PARAMETERS } from '../../types/index.ts';
import type { ModelParameters } from '../../types/index.ts';

// ==================== Helpers ====================

function SliderRow({
  label,
  max,
  step,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  max: number;
  step: number;
  value: number | undefined;
  placeholder: string;
  onChange: (value: number | undefined) => void;
}) {
  const displayValue = value !== undefined ? value.toFixed(2).replace(/\.?0+$/, '') : placeholder;
  // Use -1 as sentinel for "unset". Set min=-1 so browser does not clamp the sentinel
  // value to 0, which would make unset indistinguishable from 0.0.
  const UNSET_SENTINEL = -1;

  return (
    <div className="flex flex-col gap-1.5 px-0.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
          {label}
        </label>
        <span className={`text-xs tabular-nums ${value !== undefined ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
          {displayValue}
        </span>
      </div>
      <input
        type="range"
        min={UNSET_SENTINEL}
        max={max * 100}
        step={step * 100}
        value={value !== undefined ? value * 100 : UNSET_SENTINEL}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          onChange(v < 0 ? undefined : v / 100);
        }}
        className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

function NumberRow({
  label,
  placeholder,
  value,
  min,
  description,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: number | undefined;
  min?: number;
  description?: string;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-0.5">
      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </label>
      <input
        type="number"
        min={min}
        className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground placeholder:text-muted-foreground/40"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
      />
      {description && (
        <p className="text-[10px] text-muted-foreground/70">{description}</p>
      )}
    </div>
  );
}

// ==================== Main Component ====================

export function ModelParameterSettings() {
  const store = useStore();
  const format = store.providerConfig.format;
  const params = store.providerConfig.modelParameters ?? {};
  const enableReasoning = store.enableReasoning;
  const supported = SUPPORTED_PARAMETERS[format];

  const isSupported = (key: keyof ModelParameters) => supported.includes(key);

  // Update state immediately, save only when interaction ends (pointer up) to
  // avoid excessive chrome.storage writes during continuous slider drags.
  const update = (key: keyof ModelParameters, value: number | undefined) => {
    store.setModelParameters({ [key]: value });
  };

  const save = () => store.saveToStorage();

  const hasAnyValue = Object.values(params).some((v) => v !== undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-0.5">
        <div className="h-px bg-border/40 flex-1" />
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground/40">Model Parameters</span>
        <div className="h-px bg-border/40 flex-1" />
      </div>

      {/* Temperature */}
      {isSupported('temperature') && (
        <div onPointerUp={save}>
          <SliderRow
            label="Temperature"
            max={2}
            step={0.01}
            value={params.temperature}
            placeholder="default"
            onChange={(v) => update('temperature', v)}
          />
        </div>
      )}

      {/* Top P */}
      {isSupported('topP') && (
        <div onPointerUp={save}>
          <SliderRow
            label="Top P"
            max={1}
            step={0.01}
            value={params.topP}
            placeholder="default"
            onChange={(v) => update('topP', v)}
          />
        </div>
      )}

      {/* Max Tokens */}
      {isSupported('maxTokens') && (
        <NumberRow
          label="Max Tokens"
          placeholder="Provider default"
          value={params.maxTokens}
          min={1}
          onChange={(v) => { update('maxTokens', v); save(); }}
        />
      )}

      {/* Top K — Anthropic & Gemini only */}
      {isSupported('topK') && (
        <NumberRow
          label="Top K"
          placeholder="Provider default"
          value={params.topK}
          min={1}
          onChange={(v) => { update('topK', v); save(); }}
        />
      )}

      {/* Thinking Budget — only when reasoning is enabled */}
      {isSupported('thinkingBudget') && enableReasoning && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          <NumberRow
            label="Thinking Budget (tokens)"
            placeholder={format === 'anthropic' ? '4096' : '24576'}
            value={params.thinkingBudget}
            min={1024}
            description="Max tokens for internal reasoning. Only active when reasoning is enabled."
            onChange={(v) => { update('thinkingBudget', v); save(); }}
          />
        </div>
      )}

      {/* Reset button */}
      {hasAnyValue && (
        <button
          className="self-start text-[10px] text-primary hover:text-primary/80 transition-colors px-0.5"
          onClick={() => {
            store.clearModelParameters();
            store.saveToStorage();
          }}
        >
          Reset to defaults
        </button>
      )}
    </div>
  );
}
