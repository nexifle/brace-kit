import { HelpCircleIcon } from 'lucide-react';
import { useStore } from '../../store/index.ts';
import { SUPPORTED_PARAMETERS } from '../../types/index.ts';
import type { ModelParameters } from '../../types/index.ts';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/index.ts';

// ==================== Helpers ====================

function SliderRow({
  label,
  max,
  step,
  value,
  placeholder,
  description,
  onChange,
}: {
  label: string;
  max: number;
  step: number;
  value: number | undefined;
  placeholder: string;
  description?: string;
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
          {description && (
            <Tooltip>
              <TooltipTrigger>
                <button>
                  <HelpCircleIcon
                    size={16}
                    className="inline-block ml-1 text-muted-foreground/60 cursor-pointer"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs text-muted-foreground/80">{description}</p>
              </TooltipContent>
            </Tooltip>
          )}
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
        {label} {description && (
          <Tooltip>
            <TooltipTrigger>
              <button>
                <HelpCircleIcon
                  size={16}
                  className="inline-block ml-1 text-muted-foreground/60 cursor-pointer"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs text-muted-foreground/80">{description}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </label>
      <input
        type="number"
        min={min}
        className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground placeholder:text-muted-foreground/40"
        placeholder={placeholder}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : undefined)}
      />
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

  // Update function for string values (like keepAlive)
  const updateString = (key: keyof ModelParameters, value: string | undefined) => {
    store.setModelParameters({ [key]: value });
  };

  const save = () => store.saveToStorage();

  const hasAnyValue = Object.values(params).some((v) => v !== undefined);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-0.5 py-4">
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
            description="Controls how creative the response is. Low = more consistent, high = more varied."
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
            description="Controls how broad the word choices are. Lower = more focused."
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
          description="Sets the maximum length of the response. Longer responses consume more tokens and may cost more."
          onChange={(v) => { update('maxTokens', v); save(); }}
        />
      )}

      {/* Top K — Anthropic, Gemini, Ollama */}
      {isSupported('topK') && (
        <NumberRow
          label="Top K"
          placeholder="Provider default"
          value={params.topK}
          min={1}
          description="Top-k picks k most likely words; larger k wider choices."
          onChange={(v) => { update('topK', v); save(); }}
        />
      )}

      {/* Min P — Ollama only */}
      {isSupported('minP') && (
        <div onPointerUp={save}>
          <SliderRow
            label="Min P"
            max={1}
            step={0.01}
            value={params.minP}
            placeholder="default"
            description="Minimum probability threshold for token selection. Filters out unlikely tokens."
            onChange={(v) => update('minP', v)}
          />
        </div>
      )}

      {/* Num Ctx (Context Window) — Ollama only */}
      {isSupported('numCtx') && (
        <NumberRow
          label="Context Window (tokens)"
          placeholder="4096"
          value={params.numCtx}
          min={512}
          description="Sets the context window size. Larger values use more memory."
          onChange={(v) => { update('numCtx', v); save(); }}
        />
      )}

      {/* Keep Alive — Ollama only */}
      {isSupported('keepAlive') && (
        <div className="flex flex-col gap-1.5 px-0.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
            Keep Alive
            <Tooltip>
              <TooltipTrigger>
                <button>
                  <HelpCircleIcon
                    size={16}
                    className="inline-block ml-1 text-muted-foreground/60 cursor-pointer"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs text-muted-foreground/80">How long to keep the model loaded in memory. Examples: "5m", "24h", "0" to unload immediately.</p>
              </TooltipContent>
            </Tooltip>
          </label>
          <input
            type="text"
            className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none text-foreground placeholder:text-muted-foreground/40"
            placeholder="5m"
            value={params.keepAlive ?? ''}
            onChange={(e) => { updateString('keepAlive', e.target.value || undefined); save(); }}
          />
        </div>
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
