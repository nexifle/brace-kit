import { useStore } from '../store/index.ts';
import { ProviderSettings } from './settings/ProviderSettings.tsx';
import { ChatSettings } from './settings/ChatSettings.tsx';
import { MemorySettings } from './settings/MemorySettings.tsx';
import { CustomProvidersSettings } from './settings/CustomProvidersSettings.tsx';
import { MCPServersSettings } from './settings/MCPServersSettings.tsx';
import { IconButton } from './ui/IconButton.tsx';

export function SettingsPanel() {
  const store = useStore();

  return (
    <div id="settings-view">
      <div className="settings-header">
        <IconButton onClick={() => store.setView('chat')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </IconButton>
        <h2>Settings</h2>
      </div>
      <div className="settings-content">
        <ProviderSettings />
        <ChatSettings />
        <MemorySettings />
        <CustomProvidersSettings />
        <MCPServersSettings />

        <section className="settings-section">
          <p className="about-text">AI Sidebar v1.0.0</p>
        </section>
      </div>
    </div>
  );
}
