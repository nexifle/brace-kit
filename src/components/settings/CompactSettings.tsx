import { useStore } from '../../store/index.ts';
import {
  compactAtRatio,
  DEFAULT_COMPACT_AT,
  DEFAULT_KEEP_RECENT_RATIO,
  keepRecentRatioForConfig,
  keepRecentTokensForConfig,
  reserveTokensForConfig,
} from '../../hooks/compact/compactUtils.ts';
import { getContextWindow } from '../../hooks/compact/compactUtils.ts';

export function CompactSettings() {
  const store = useStore();
  const compactConfig = {
    enabled: store.compactConfig.enabled ?? true,
    threshold: store.compactConfig.threshold ?? DEFAULT_COMPACT_AT,
    prompt: '',
    defaultContextWindow: store.compactConfig.defaultContextWindow ?? 128000,
    keepRecentRatio: store.compactConfig.keepRecentRatio ?? DEFAULT_KEEP_RECENT_RATIO,
  };

  const windowTokens = getContextWindow(
    store.providerConfig,
    store.customProviders,
    store.compactConfig,
    store.fetchedModels?.[store.providerConfig.providerId || ''] ?? null,
  ) || compactConfig.defaultContextWindow;

  const compactAt = Math.round(compactAtRatio(store.compactConfig) * 100);
  const keepRecent = Math.round(keepRecentRatioForConfig(store.compactConfig) * 100);
  const reserveTokens = reserveTokensForConfig(store.compactConfig, windowTokens);
  const keepRecentTokens = keepRecentTokensForConfig(store.compactConfig, windowTokens);

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Auto Compact</h3>
        <p className="text-sm text-muted-foreground leading-none">
          Summarize older turns into a checkpoint and keep recent messages verbatim
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors">
          <div className="flex flex-col gap-0.5 pr-2">
            <span className="text-sm font-medium text-foreground">Enable Auto Compact</span>
            <span className="text-sm text-muted-foreground leading-tight">
              {compactConfig.enabled
                ? 'Automatically compact when the threshold is reached'
                : 'Manual compact only via /compact'}
            </span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={compactConfig.enabled}
              onChange={(e) => {
                store.setCompactConfig({ enabled: e.target.checked, prompt: '' });
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
                <label htmlFor="compact-at" className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                  Compact at
                </label>
                <span className="text-sm text-muted-foreground tabular-nums">{compactAt}%</span>
              </div>
              <input
                id="compact-at"
                type="range"
                min={50}
                max={95}
                step={1}
                value={compactAt}
                onChange={(e) => {
                  store.setCompactConfig({ threshold: Number(e.target.value) / 100, prompt: '' });
                  store.saveToStorage();
                }}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-sm text-muted-foreground/70">
                Compact when estimated usage exceeds this share of the model context window.
                ≈ {reserveTokens.toLocaleString()} tokens reserved on this model ({windowTokens.toLocaleString()} window).
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="keep-recent" className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                  Keep recent
                </label>
                <span className="text-sm text-muted-foreground tabular-nums">{keepRecent}%</span>
              </div>
              <input
                id="keep-recent"
                type="range"
                min={5}
                max={40}
                step={1}
                value={keepRecent}
                onChange={(e) => {
                  store.setCompactConfig({ keepRecentRatio: Number(e.target.value) / 100, prompt: '' });
                  store.saveToStorage();
                }}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-sm text-muted-foreground/70">
                Share of the window to leave as verbatim recent messages (not summarized).
                ≈ {keepRecentTokens.toLocaleString()} tokens on this model.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
