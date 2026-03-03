// =============================================================================
// Imports
// =============================================================================
import { useState } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import type { ProviderFormat } from '../../types/index.ts';
import { XIcon } from 'lucide-react';

// =============================================================================
// Custom Providers Settings Component
// =============================================================================
export function CustomProvidersSettings() {
  // ---------------------------------------------------------------------------
  // Hooks & State Initialization
  // ---------------------------------------------------------------------------
  const { customProviders, addCustomProvider, removeCustomProvider } = useProvider();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<ProviderFormat>('openai');
  const [contextWindow, setContextWindow] = useState<string>('');

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles adding a new custom provider
   * - Validates that name is not empty
   * - Parses context window value if provided
   * - Resets form state after successful addition
   */
  const handleAdd = () => {
    if (!name.trim()) return;
    const windowValue = contextWindow ? parseInt(contextWindow, 10) : undefined;
    addCustomProvider(name.trim(), url.trim(), format, windowValue);
    // Reset form fields
    setName('');
    setUrl('');
    setFormat('openai');
    setContextWindow('');
    setShowForm(false);
  };

  // ---------------------------------------------------------------------------
  // Constants & Mappings
  // ---------------------------------------------------------------------------

  /**
   * Maps provider format identifiers to their display labels
   */
  const formatLabel: Record<ProviderFormat, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
    ollama: 'Ollama',
  };

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      {/* ---------------------------------------------------------------------------
          Section Header
          - Title and toggle button to show/hide the add form
          --------------------------------------------------------------------------- */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Custom Providers</h3>
          <p className="text-xs text-muted-foreground leading-none">Add your own API endpoints</p>
        </div>
        <button
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${showForm
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          title="Add provider"
          onClick={() => setShowForm(!showForm)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-200 ${showForm ? 'rotate-45' : ''}`}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* ---------------------------------------------------------------------------
          Custom Providers List
          - Displays empty state message when no providers exist
          - Shows provider details: format, model, API hostname, context window
          --------------------------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        {customProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 px-2 text-center rounded-lg border border-dashed border-border/50 bg-secondary/10">
            <p className="text-xs text-muted-foreground italic">No custom providers added yet.</p>
          </div>
        ) : (
          customProviders.map((cp) => (
            <div key={cp.id} className="group flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 border border-border/40 hover:bg-secondary/40 transition-all">
              <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">{cp.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-2xs font-bold uppercase tracking-wider">
                    {formatLabel[cp.format]}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-2xs text-muted-foreground truncate opacity-70">
                  {cp.apiUrl ? <span>{new URL(cp.apiUrl).hostname}</span> : null}
                  {cp.contextWindow ? <span> · {cp.contextWindow.toLocaleString()} ctx</span> : null}
                </div>
              </div>
              <button
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                title="Remove provider"
                onClick={() => removeCustomProvider(cp.id)}
              >
                <XIcon size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {/* ---------------------------------------------------------------------------
          Add Provider Form
          - Conditionally rendered based on showForm state
          - Fields: Name, Format, Base URL, Context Window
          --------------------------------------------------------------------------- */}
      {showForm && (
        <div className="flex flex-col gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
          {/* Name and Format fields in a grid row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 px-0.5">
              <label htmlFor="cp-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Name</label>
              <input
                type="text"
                id="cp-name"
                className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
                placeholder="My Provider"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 px-0.5">
              <label htmlFor="cp-format" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Format</label>
              <select
                id="cp-format"
                className="w-full h-8 px-2 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
                value={format}
                onChange={(e) => setFormat(e.target.value as ProviderFormat)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
          </div>

          {/* Base URL input */}
          <div className="flex flex-col gap-1 px-0.5">
            <label htmlFor="cp-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Base URL</label>
            <input
              type="url"
              id="cp-url"
              className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
              placeholder="https://api.example.com/v1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Context Window input */}
          <div className="flex flex-col gap-1 px-0.5">
            <label htmlFor="cp-window" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Context Window (Tokens)</label>
            <input
              type="number"
              id="cp-window"
              className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
              placeholder="128000"
              value={contextWindow}
              onChange={(e) => setContextWindow(e.target.value)}
            />
          </div>

          {/* Submit button */}
          <button
            className="w-full h-9 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-all shadow-sm active:scale-[0.98]"
            onClick={handleAdd}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Provider
          </button>
        </div>
      )}
    </section>
  );
}
