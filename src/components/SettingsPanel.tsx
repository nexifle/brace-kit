import { useState } from 'react';
import { useStore } from '../store/index.ts';
import { ProviderSettings } from './settings/ProviderSettings.tsx';
import { ChatSettings } from './settings/ChatSettings.tsx';
import { MemorySettings } from './settings/MemorySettings.tsx';
import { MCPServersSettings } from './settings/MCPServersSettings.tsx';
import { SecuritySettings } from './settings/SecuritySettings.tsx';
import { DataSettings } from './settings/DataSettings.tsx';
import { IconButton } from './ui/IconButton.tsx';
import {
  SparklesIcon,
  MessageSquareIcon,
  BrainIcon,
  ShieldCheckIcon,
  ChevronLeftIcon,
  ServerIcon,
  HardDriveIcon
} from 'lucide-react';

type SettingsTab = 'ai' | 'chat' | 'context' | 'mcp' | 'security' | 'data';
export function SettingsPanel() {
  const store = useStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');

  const tabs = [
    { id: 'ai' as const, label: 'AI', icon: SparklesIcon },
    { id: 'chat' as const, label: 'Chat', icon: MessageSquareIcon },
    { id: 'context' as const, label: 'Memory', icon: BrainIcon },
    { id: 'mcp' as const, label: 'MCP', icon: ServerIcon },
    { id: 'data' as const, label: 'Data', icon: HardDriveIcon },
    { id: 'security' as const, label: 'Safety', icon: ShieldCheckIcon },
  ];

  return (
    <div id="settings-view" className="absolute inset-0 bg-background z-50 flex flex-col animate-in slide-in-from-right duration-300 ease-out">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 transition-colors">
        <IconButton
          onClick={() => store.setView('chat')}
          className="hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronLeftIcon size={18} strokeWidth={2.5} />
        </IconButton>
        <h2 className="text-base font-bold tracking-tight text-foreground">Settings</h2>
      </div>

      {/* Tab Navigation */}
      <div className="flex px-3 pt-3 gap-1 border-b border-border/40 bg-background/50 backdrop-blur-sm sticky top-14 z-10">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all relative group mb-1
                ${isActive
                  ? 'text-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[9px] font-bold uppercase tracking-tight transition-all
                ${isActive ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'}`}>
                {tab.label}
              </span>

              {/* Active Indicator (Small dot instead of bar for compact look) */}
              {isActive && (
                <div className="absolute -bottom-1 left-1.5 right-1.5 h-0.5 bg-primary rounded-full animate-in fade-in zoom-in-50 duration-300" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 custom-scrollbar bg-background/20">
        <div className="animate-in fade-in slide-in-from-right-2 duration-300 py-2">
          {activeTab === 'ai' && <ProviderSettings />}

          {activeTab === 'chat' && <ChatSettings />}

          {activeTab === 'context' && <MemorySettings />}

          {activeTab === 'mcp' && <MCPServersSettings />}

          {activeTab === 'data' && <DataSettings />}

          {activeTab === 'security' && <SecuritySettings />}
        </div>

        <section className="mt-8 pt-6 border-t border-border/50 text-center opacity-40">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
            AI Sidebar v1.0.0
          </p>
        </section>
      </div>
    </div>
  );
}
