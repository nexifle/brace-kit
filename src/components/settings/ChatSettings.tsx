// =============================================================================
// Imports
// =============================================================================
import { MessageSquareTextIcon, ZapIcon, GlobeIcon, MousePointerClickIcon, KeyRoundIcon } from 'lucide-react';
import { useStore } from '../../store/index.ts';
import { SelectionActionsSettings } from './SelectionActionsSettings.tsx';

// =============================================================================
// Shared sub-components
// =============================================================================

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border/60 overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 border-b border-border/50">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{title}</span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm text-muted-foreground leading-tight">{description}</span>
      </div>
      <label className="relative inline-flex items-center cursor-pointer shrink-0">
        <input
          type="checkbox"
          className="sr-only peer"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200
          after:content-[''] after:absolute after:top-0.5 after:left-0.5
          after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all
          peer-checked:after:translate-x-3.5" />
      </label>
    </div>
  );
}

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

      <div className="flex flex-col gap-2">

        {/* ── SYSTEM PROMPT ── */}
        <SectionCard>
          <SectionHeader icon={<MessageSquareTextIcon size={12} />} title="System Prompt" />
          <div className="p-3 flex flex-col gap-2.5">
            <textarea
              id="system-prompt"
              rows={3}
              className="w-full min-h-17.5 max-h-50 px-2.5 py-2 text-sm bg-muted/40 border border-input rounded-md
                focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all
                placeholder:text-muted-foreground/50 text-foreground field-sizing-content resize-none"
              placeholder="You are a helpful assistant..."
              value={store.providerConfig.systemPrompt}
              onChange={(e) => {
                store.setProviderConfig({ systemPrompt: e.target.value });
                store.saveToStorage();
              }}
            />
            <p className="text-sm text-muted-foreground/60 leading-tight">
              Defines the assistant's role, tone, and behavior for every conversation.
            </p>
          </div>
        </SectionCard>

        {/* ── RESPONSE ── */}
        <SectionCard>
          <SectionHeader icon={<ZapIcon size={12} />} title="Response" />
          <div className="p-3 flex flex-col gap-2.5">
            <ToggleRow
              label="Enable Streaming"
              description="Stream responses word by word as they are generated"
              checked={store.enableStreaming}
              onChange={(v) => {
                store.setEnableStreaming(v);
                store.saveToStorage();
              }}
            />
          </div>
        </SectionCard>

        {/* ── WEB SEARCH ── */}
        <SectionCard>
          <SectionHeader icon={<GlobeIcon size={12} />} title="Web Search" />
          <div className="p-3 flex flex-col gap-2.5">
            {isGemini ? (
              <ToggleRow
                label="Google Search Grounding"
                description="Enable real-time web search to reduce hallucinations"
                checked={store.enableGoogleSearch}
                onChange={(v) => {
                  store.setEnableGoogleSearch(v);
                  store.saveToStorage();
                }}
              />
            ) : (
              <>
                <ToggleRow
                  label="Google Search Tool"
                  description="Search via Gemini backend (requires a Gemini API key)"
                  checked={store.enableGoogleSearchTool}
                  onChange={(v) => {
                    store.setEnableGoogleSearchTool(v);
                    store.saveToStorage();
                  }}
                />

                {store.enableGoogleSearchTool && (
                  <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-1.5">
                      <KeyRoundIcon size={11} className="text-muted-foreground shrink-0" />
                      <label htmlFor="google-search-api-key" className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                        Gemini API Key
                      </label>
                    </div>
                    <input
                      id="google-search-api-key"
                      type="password"
                      className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md
                        focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all
                        placeholder:text-muted-foreground/40 text-foreground"
                      placeholder="AIza..."
                      value={store.googleSearchApiKey || ''}
                      onChange={(e) => {
                        store.setGoogleSearchApiKey(e.target.value);
                        store.saveToStorage();
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </SectionCard>

        {/* ── TEXT SELECTION AI ── */}
        <SectionCard>
          <SectionHeader icon={<MousePointerClickIcon size={12} />} title="Text Selection AI" />
          <div className="p-3 flex flex-col gap-2.5">
            <ToggleRow
              label="Enable Text Selection AI"
              description="Show AI toolbar when selecting text on webpages"
              checked={store.textSelectionEnabled}
              onChange={(v) => store.setTextSelectionEnabled(v)}
            />

            {store.textSelectionEnabled && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* Divider */}
                <div className="h-px bg-border/40" />

                {/* Min selection length slider */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="min-selection-length" className="text-sm font-bold uppercase tracking-wider text-muted-foreground/80">
                      Minimum Selection Length
                    </label>
                    <span className="text-sm font-medium text-foreground tabular-nums">
                      {store.textSelectionMinLength}
                    </span>
                  </div>
                  <input
                    id="min-selection-length"
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={store.textSelectionMinLength}
                    onChange={(e) => store.setTextSelectionMinLength(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <p className="text-sm text-muted-foreground">
                    Minimum characters to select before showing the AI toolbar
                  </p>
                </div>

                {/* Selection Actions */}
                <SelectionActionsSettings />
              </div>
            )}
          </div>
        </SectionCard>

      </div>
    </section>
  );
}
