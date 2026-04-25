import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ProviderFormat } from '../../types/index.ts';

interface AddProviderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: {
    name: string;
    apiUrl: string;
    format: ProviderFormat;
    apiKey: string;
    model: string;
    supportsModelFetch: boolean;
  }) => void;
}

const FORMAT_PLACEHOLDERS: Record<ProviderFormat, string> = {
  openai: 'https://api.example.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://localhost:11434',
};

export function AddProviderModal({ isOpen, onClose, onSubmit }: AddProviderModalProps) {
  const [name, setName] = useState('');
  const [format, setFormat] = useState<ProviderFormat>('openai');
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setFormat('openai');
      setApiUrl('');
      setApiKey('');
      setModel('');
      setShowKey(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isOllama = format === 'ollama';
  const canSubmit = name.trim() && apiUrl.trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      apiUrl: apiUrl.trim(),
      format,
      apiKey: apiKey.trim(),
      model: model.trim(),
      supportsModelFetch: true,
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-auto"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-[360px] bg-card border border-border shadow-2xl rounded-lg overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-lg font-bold text-foreground">Add Custom Provider</h3>
          <p className="text-sm text-muted-foreground mt-1">Configure a new AI provider with all fields at once.</p>
        </div>

        {/* Fields */}
        <div className="px-5 pb-4 flex flex-col gap-3">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Name</label>
            <input
              autoFocus
              className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
              placeholder="My Provider"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* API Format */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">API Format</label>
            <select
              className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none cursor-pointer text-foreground"
              value={format}
              onChange={(e) => setFormat(e.target.value as ProviderFormat)}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Gemini</option>
              <option value="ollama">Ollama</option>
            </select>
          </div>

          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Base URL</label>
            <input
              className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
              placeholder={FORMAT_PLACEHOLDERS[format]}
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
          </div>

          {/* API Key */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              API Key{isOllama ? ' (optional)' : ''}
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                className="w-full h-8 px-2.5 pr-9 text-sm bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
                placeholder={isOllama ? 'Not required for local Ollama' : 'Paste your key here'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-1 w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                onClick={() => setShowKey(!showKey)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {showKey ? (
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  ) : (
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  )}
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          {/* Model Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Model Name <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              className="w-full h-8 px-2.5 text-sm bg-muted/40 border border-input rounded-md outline-none focus:border-primary/40 transition-all text-foreground placeholder:text-muted-foreground/40"
              placeholder="e.g. gpt-4o"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-4 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors border-r border-border active:bg-muted/80"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 px-4 py-4 text-sm font-bold text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            Add Provider
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
