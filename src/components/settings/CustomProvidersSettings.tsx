import { useState } from 'react';
import { useProvider } from '../../hooks/useProvider.ts';
import type { ProviderFormat } from '../../types/index.ts';

export function CustomProvidersSettings() {
  const { customProviders, addCustomProvider, removeCustomProvider } = useProvider();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<ProviderFormat>('openai');

  const handleAdd = () => {
    if (!name.trim()) return;
    addCustomProvider(name.trim(), url.trim(), format);
    setName('');
    setUrl('');
    setFormat('openai');
    setShowForm(false);
  };

  const formatLabel: Record<ProviderFormat, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Gemini',
  };

  return (
    <section className="settings-section">
      <div className="section-header-row">
        <h3>Custom Providers</h3>
        <button
          className={`section-toggle-btn ${showForm ? 'active' : ''}`}
          title="Add provider"
          onClick={() => setShowForm(!showForm)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div id="custom-providers-list">
        {customProviders.length === 0 ? (
          <p className="empty-text">No custom providers added yet.</p>
        ) : (
          customProviders.map((cp) => (
            <div key={cp.id} className="custom-provider-item">
              <div className="cp-info">
                <div className="cp-name">{cp.name}</div>
                <div className="cp-details">
                  {formatLabel[cp.format]}
                  {cp.model ? ` · ${cp.model}` : ''}
                  {cp.apiUrl ? ` · ${new URL(cp.apiUrl).hostname}` : ''}
                </div>
              </div>
              <button
                className="cp-delete"
                title="Remove provider"
                onClick={() => removeCustomProvider(cp.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div id="cp-add-form" className="cp-add-form">
          <div className="field-row-grid">
            <div className="form-group compact">
              <label htmlFor="cp-name">Name</label>
              <input
                type="text"
                id="cp-name"
                placeholder="My Provider"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="form-group compact">
              <label htmlFor="cp-format">Format</label>
              <select
                id="cp-format"
                value={format}
                onChange={(e) => setFormat(e.target.value as ProviderFormat)}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
          </div>
          <div className="form-group compact">
            <label htmlFor="cp-url">Base URL</label>
            <input
              type="url"
              id="cp-url"
              placeholder="https://api.example.com/v1"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={handleAdd}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
