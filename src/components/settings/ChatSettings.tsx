// =============================================================================
// Imports
// =============================================================================
import { useStore } from '../../store/index.ts';
import { SelectionActionsSettings } from './SelectionActionsSettings.tsx';

// =============================================================================
// Chat Settings Component
// =============================================================================
export function ChatSettings() {
  // ---------------------------------------------------------------------------
  // Store & State Initialization
  // ---------------------------------------------------------------------------
  const store = useStore();
  const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">Chat</h3>
        <p className="text-xs text-muted-foreground leading-none">Configure assistant behavior and tools</p>
      </div>

      <div className="flex flex-col gap-3">
        {/* ---------------------------------------------------------------------------
            System Prompt Configuration
            - Allows users to define the AI's behavior and personality
            --------------------------------------------------------------------------- */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="system-prompt" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 px-0.5">
            System Prompt
          </label>
          <textarea
            id="system-prompt"
            rows={3}
            className="w-full min-h-[70px] max-h-[200px] px-2.5 py-2 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/50 text-foreground max-inline-max field-sizing-content resize-none"
            placeholder="You are a helpful assistant..."
            value={store.providerConfig.systemPrompt}
            onChange={(e) => {
              store.setProviderConfig({ systemPrompt: e.target.value });
              store.saveToStorage();
            }}
          />
        </div>

        {/* ---------------------------------------------------------------------------
            Gemini-Specific Options: Google Search Grounding
            --------------------------------------------------------------------------- */}
        {isGemini && (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors">
            <div className="flex flex-col gap-0.5 pr-2">
              <span className="text-sm font-medium text-foreground">Google Search Grounding</span>
              <span className="text-xs text-muted-foreground leading-tight">Enable real-time web search to reduce hallucinations</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={store.enableGoogleSearch}
                onChange={(e) => {
                  store.setEnableGoogleSearch(e.target.checked);
                  store.saveToStorage();
                }}
              />
              <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
            </label>
          </div>
        )}

        {/* ---------------------------------------------------------------------------
            Text Selection UI Options
            --------------------------------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors">
            <div className="flex flex-col gap-0.5 pr-2">
              <span className="text-sm font-medium text-foreground">Text Selection AI</span>
              <span className="text-xs text-muted-foreground leading-tight">Show AI toolbar when selecting text on webpages</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={store.textSelectionEnabled}
                onChange={(e) => {
                  store.setTextSelectionEnabled(e.target.checked);
                }}
              />
              <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
            </label>
          </div>

          {store.textSelectionEnabled && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex flex-col gap-1.5 px-0.5">
                <label htmlFor="min-selection-length" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                  Minimum Selection Length
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="min-selection-length"
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={store.textSelectionMinLength}
                    onChange={(e) => {
                      store.setTextSelectionMinLength(parseInt(e.target.value, 10));
                    }}
                    className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <span className="text-sm font-medium text-foreground w-12 text-right">
                    {store.textSelectionMinLength}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Minimum characters to select before showing AI toolbar
                </p>
              </div>
              <SelectionActionsSettings />
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------------------
            Streaming Options
            --------------------------------------------------------------------------- */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors">
          <div className="flex flex-col gap-0.5 pr-2">
            <span className="text-sm font-medium text-foreground">Enable Streaming</span>
            <span className="text-xs text-muted-foreground leading-tight">Stream responses word by word</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={store.enableStreaming}
              onChange={(e) => {
                store.setEnableStreaming(e.target.checked);
                store.saveToStorage();
              }}
            />
            <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
          </label>
        </div>

        {/* ---------------------------------------------------------------------------
            Non-Gemini Options: Google Search Tool
            --------------------------------------------------------------------------- */}
        {!isGemini && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/40 border border-border/50 hover:bg-secondary/60 transition-colors">
              <div className="flex flex-col gap-0.5 pr-2">
                <span className="text-sm font-medium text-foreground">Google Search Tool</span>
                <span className="text-xs text-muted-foreground leading-tight">Search via Gemini backend (requires Gemini API key)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={store.enableGoogleSearchTool}
                  onChange={(e) => {
                    store.setEnableGoogleSearchTool(e.target.checked);
                    store.saveToStorage();
                  }}
                />
                <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
              </label>
            </div>

            {/* Gemini API Key Input */}
            {store.enableGoogleSearchTool && (
              <div className="flex flex-col gap-1.5 px-0.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <label htmlFor="google-search-api-key" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                  Gemini API Key (for search)
                </label>
                <input
                  id="google-search-api-key"
                  type="password"
                  className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                  placeholder="AIza..."
                  value={store.googleSearchApiKey || ''}
                  onChange={(e) => {
                    store.setGoogleSearchApiKey(e.target.value);
                    store.saveToStorage();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
