// =============================================================================
// Imports
// =============================================================================
import { useStore } from '../../store/index.ts';
import { DEFAULT_SUMMARY_PROMPT } from '../../hooks/compact/compactUtils.ts';
import { HelpCircleIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/index.ts';

// =============================================================================
// Compact Settings Component
// =============================================================================
export function CompactSettings() {
  const store = useStore();
  // Provide defaults for backward compatibility with existing stored configs
  const compactConfig = {
    enabled: store.compactConfig.enabled ?? true,
    threshold: store.compactConfig.threshold ?? 0.9,
    prompt: store.compactConfig.prompt ?? '',
    reserveTokens: store.compactConfig.reserveTokens ?? 16384,
    keepRecentTokens: store.compactConfig.keepRecentTokens ?? 20000,
  };

  // Use custom prompt if set, otherwise show default
  const displayPrompt = compactConfig.prompt.trim() || DEFAULT_SUMMARY_PROMPT;
  const isUsingCustomPrompt = compactConfig.prompt.trim().length > 0;

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      {/* Header */}
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Auto Compact</h3>
        <p className="text-sm text-muted-foreground leading-none">Configure conversation compaction settings</p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors">
          <div className="flex flex-col gap-0.5 pr-2">
            <span className="text-sm font-medium text-foreground">Enable Auto Compact</span>
            <span className="text-sm text-muted-foreground leading-tight">
              {compactConfig.enabled
                ? 'Automatically compact when threshold reached'
                : 'Manual compact only via /compact command'}
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={compactConfig.enabled}
              onChange={(e) => {
                store.setCompactConfig({ enabled: e.target.checked });
                store.saveToStorage();
              }}
            />
            <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
          </label>
        </div>

        {compactConfig.enabled && (
          <div className="flex flex-col gap-3 px-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="reserve-tokens" className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                  Reserve tokens
                </label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {compactConfig.reserveTokens.toLocaleString()}
                </span>
              </div>
              <input
                id="reserve-tokens"
                type="number"
                min={1024}
                max={128000}
                step={1024}
                value={compactConfig.reserveTokens}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n) || n <= 0) return;
                  store.setCompactConfig({ reserveTokens: n });
                  store.saveToStorage();
                }}
                className="w-full h-8 px-2 rounded-md bg-muted/40 border border-border text-sm"
              />
              <p className="text-sm text-muted-foreground/70">
                Compact when estimated context exceeds the model window minus this reserve
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="keep-recent-tokens" className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                  Keep recent tokens
                </label>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {compactConfig.keepRecentTokens.toLocaleString()}
                </span>
              </div>
              <input
                id="keep-recent-tokens"
                type="number"
                min={1024}
                max={200000}
                step={1024}
                value={compactConfig.keepRecentTokens}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isFinite(n) || n <= 0) return;
                  store.setCompactConfig({ keepRecentTokens: n });
                  store.saveToStorage();
                }}
                className="w-full h-8 px-2 rounded-md bg-muted/40 border border-border text-sm"
              />
              <p className="text-sm text-muted-foreground/70">
                Leave a tail of roughly this many tokens unsummarized
              </p>
            </div>
          </div>
        )}

        {/* Compact Prompt - Only show when enabled */}
        {compactConfig.enabled && (
          <div className="flex flex-col gap-1.5 px-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between">
              <label htmlFor="compact-prompt" className="flex items-center space-x-2 text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                <span>Compact Prompt</span>
                <Tooltip>
                  <TooltipTrigger>
                    <span className="cursor-help"><HelpCircleIcon size={16} /></span>
                  </TooltipTrigger>
                  <TooltipContent>Inspired from RooCode</TooltipContent>
                </Tooltip>
              </label>
              {isUsingCustomPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    store.setCompactConfig({ prompt: '' });
                    store.saveToStorage();
                  }}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                  title="Reset to default"
                >
                  Reset
                </button>
              )}
            </div>
            <textarea
              id="compact-prompt"
              rows={8}
              className="w-full min-h-[180px] max-h-[400px] px-2.5 py-2 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground max-inline-max field-sizing-content resize-none font-mono"
              value={displayPrompt}
              onChange={(e) => {
                store.setCompactConfig({ prompt: e.target.value });
                store.saveToStorage();
              }}
            />
            <p className="text-sm text-muted-foreground/70">
              {isUsingCustomPrompt ? 'Using custom prompt' : 'Using default prompt (edit to customize)'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
