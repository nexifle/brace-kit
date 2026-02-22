import { MemorySettings } from './settings/MemorySettings.tsx';
import { MCPServersSettings } from './settings/MCPServersSettings.tsx';
import { SecuritySettings } from './settings/SecuritySettings.tsx';
import { ProviderSettings } from './settings/ProviderSettings.tsx';
import { ChatSettings } from './settings/ChatSettings.tsx';
import { IconButton } from './ui/IconButton.tsx';
import { useStore } from '../store/index.ts';

export function SettingsPanel() {
  const store = useStore();

  return (
    <div id="settings-view" className="absolute inset-0 bg-background z-50 flex flex-col animate-in slide-in-from-right duration-300 ease-out">
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <IconButton onClick={() => store.setView('chat')} className="hover:bg-accent hover:text-accent-foreground transition-colors">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </IconButton>
        <h2 className="text-base font-bold tracking-tight text-foreground">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8 custom-scrollbar">
        <ProviderSettings />
        <ChatSettings />
        <MemorySettings />
        <MCPServersSettings />
        <SecuritySettings />

        <section className="mt-8 pt-6 border-t border-border/50 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
            AI Sidebar v1.0.0
          </p>
        </section>
      </div>
    </div>
  );
}
