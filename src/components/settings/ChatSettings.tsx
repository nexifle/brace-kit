import { useStore } from '../../store/index.ts';

export function ChatSettings() {
  const store = useStore();
  const isGemini = store.providerConfig.providerId === 'gemini' || store.providerConfig.format === 'gemini';

  return (
    <section className="settings-section">
      <h3>Chat</h3>
      <div className="form-group">
        <label htmlFor="system-prompt">System Prompt</label>
        <textarea
          id="system-prompt"
          rows={3}
          placeholder="You are a helpful assistant..."
          value={store.providerConfig.systemPrompt}
          onChange={(e) => {
            store.setProviderConfig({ systemPrompt: e.target.value });
            store.saveToStorage();
          }}
        />
      </div>
      {isGemini && (
        <div id="gemini-options" className="gemini-options">
          <div className="toggle-row">
            <div className="toggle-info">
              <span className="toggle-title">Google Search Grounding</span>
              <span className="toggle-hint">Enable real-time web search (reduces hallucinations)</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={store.enableGoogleSearch}
                onChange={(e) => {
                  store.setEnableGoogleSearch(e.target.checked);
                  store.saveToStorage();
                }}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
