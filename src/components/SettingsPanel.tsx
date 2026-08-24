import { useEffect, useState } from 'react';
import { useStore } from '../store/index.ts';
import { ProviderSettings } from './settings/ProviderSettings.tsx';
import { ChatSettings } from './settings/ChatSettings.tsx';
import { CompactSettings } from './settings/CompactSettings.tsx';
import { MemorySettings } from './settings/MemorySettings.tsx';
import { MCPServersSettings } from './settings/MCPServersSettings.tsx';
import { SecuritySettings } from './settings/SecuritySettings.tsx';
import { DataSettings } from './settings/DataSettings.tsx';
import { IconButton } from './ui/IconButton.tsx';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip/index.ts';
import {
  SparklesIcon,
  MessageSquareIcon,
  BrainIcon,
  ShieldCheckIcon,
  ChevronLeftIcon,
  ServerIcon,
  HardDriveIcon,
  MinimizeIcon
} from 'lucide-react';
import { cn } from '../utils/cn.ts';

type SettingsTab = 'ai' | 'chat' | 'compact' | 'context' | 'mcp' | 'security' | 'data';

const TABS: { id: SettingsTab; label: string; icon: typeof SparklesIcon }[] = [
  { id: 'ai', label: 'AI', icon: SparklesIcon },
  { id: 'chat', label: 'Chat', icon: MessageSquareIcon },
  { id: 'compact', label: 'Compact', icon: MinimizeIcon },
  { id: 'context', label: 'Memory', icon: BrainIcon },
  { id: 'mcp', label: 'MCP', icon: ServerIcon },
  { id: 'data', label: 'Data', icon: HardDriveIcon },
  { id: 'security', label: 'Safety', icon: ShieldCheckIcon },
];

export function SettingsPanel() {
  const store = useStore();
  const mode = useStore((state) => state.mode);
  const settingsSection = useStore((state) => state.settingsSection);
  const initialTab: SettingsTab =
    settingsSection === 'ai' || TABS.some((t) => t.id === settingsSection)
      ? (settingsSection as SettingsTab)
      : 'ai';
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (
      settingsSection === 'ai' ||
      TABS.some((t) => t.id === settingsSection)
    ) {
      setActiveTab(settingsSection as SettingsTab);
    }
  }, [settingsSection]);

  const renderContent = (tab: SettingsTab) => {
    switch (tab) {
      case 'ai': return <ProviderSettings />;
      case 'chat': return <ChatSettings />;
      case 'compact': return <CompactSettings />;
      case 'context': return <MemorySettings />;
      case 'mcp': return <MCPServersSettings />;
      case 'data': return <DataSettings />;
      case 'security': return <SecuritySettings />;
    }
  };

  return (
    <div id="settings-view" className="absolute inset-0 bg-background z-50 flex flex-col animate-in slide-in-from-right duration-300 ease-out">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-10 transition-colors shrink-0">
        <IconButton
          onClick={() => store.setView('chat')}
          className="!rounded-none hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ChevronLeftIcon size={18} strokeWidth={2.5} />
        </IconButton>
        <h2 className="text-base font-bold tracking-tight text-foreground">Settings</h2>
      </div>

      {mode === 'tab' ? (
        /* Desktop composition: vertical nav + centered content column */
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="mx-auto w-full max-w-[1100px] flex flex-1 min-h-0">
            <nav className="w-[220px] shrink-0 border-r border-border/40 py-4 pr-2 overflow-y-auto scrollbar-thin">
              <div className="flex flex-col gap-0.5">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'flex items-center gap-2.5 w-full px-3 py-2 text-sm font-semibold transition-all duration-200 border-l-2',
                        isActive
                          ? 'text-primary bg-primary/10 border-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border-transparent'
                      )}
                    >
                      <Icon size={15} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </nav>

            <div className="flex-1 overflow-y-auto px-6 py-5 custom-scrollbar">
              <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                {renderContent(activeTab)}
              </div>

              <section className="mt-8 pt-6 border-t border-border/50 text-center flex flex-col gap-1.5">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
                  BraceKit v{chrome.runtime.getManifest().version}
                </p>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                  Part of Nexifle Labs
                </p>
              </section>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tab Navigation */}
          <div className="px-3 pt-3 border-b border-border/40 bg-background/50 backdrop-blur-sm sticky top-14 z-10">
            <div className="flex gap-1 w-full">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <Tooltip key={tab.id}>
                    <TooltipTrigger className={isActive ? 'inline-flex flex-1' : 'inline-flex shrink-0 w-8'}>
                      <button
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative flex items-center justify-center w-full py-2 rounded-md transition-all duration-200 overflow-hidden mb-1
                          ${isActive
                            ? 'text-primary bg-primary/10 px-2'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'}`}
                      >
                        <Icon size={14} strokeWidth={isActive ? 2.5 : 2} className="shrink-0" />
                        <span className={`text-xs font-bold uppercase tracking-tight whitespace-nowrap overflow-hidden transition-all duration-200
                          ${isActive ? 'opacity-100 max-w-20 ml-1.5' : 'opacity-0 max-w-0'}`}>
                          {tab.label}
                        </span>

                        {isActive && (
                          <div className="absolute bottom-0 left-1.5 right-1.5 h-0.5 bg-primary rounded-full animate-in fade-in zoom-in-50 duration-300" />
                        )}
                      </button>
                    </TooltipTrigger>
                    {!isActive && (
                      <TooltipContent side="bottom">{tab.label}</TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto px-4 pb-8 custom-scrollbar bg-background/20">
            <div className="animate-in fade-in slide-in-from-right-2 duration-300 py-2">
              {renderContent(activeTab)}
            </div>

            <section className="mt-8 pt-6 border-t border-border/50 text-center flex flex-col gap-1.5">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground">
                BraceKit v{chrome.runtime.getManifest().version}
              </p>
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                Part of Nexifle Labs
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
