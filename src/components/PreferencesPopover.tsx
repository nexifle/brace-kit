import { useStore } from '../store/index.ts';
import { XIcon, WrenchIcon, ListIcon } from 'lucide-react';

interface PreferencesPopoverProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PreferencesPopover({ isOpen, onClose }: PreferencesPopoverProps) {
  const preferences = useStore((state) => state.preferences);
  const setPreferences = useStore((state) => state.setPreferences);

  if (!isOpen) return null;

  const displayModes = [
    {
      value: 'detailed' as const,
      label: 'Detailed',
      description: 'Full tool messages with collapsible sections',
      icon: ListIcon,
    },
    {
      value: 'compact' as const,
      label: 'Compact',
      description: 'Badge-style tool messages, click to expand',
      icon: WrenchIcon,
    },
  ];

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="bg-card/95 backdrop-blur-md border border-border rounded-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Display Preferences</span>
          <button
            className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all rounded-sm"
            onClick={onClose}
            title="Close"
          >
            <XIcon size={12} />
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Tool Message Display</div>
          <div className="flex flex-col gap-1.5">
            {displayModes.map((mode) => {
              const isActive = preferences.toolMessageDisplay === mode.value;
              const Icon = mode.icon;
              return (
                <button
                  key={mode.value}
                  className={`flex items-start gap-2.5 px-2.5 py-2 rounded-md border transition-all text-left ${
                    isActive
                      ? 'bg-primary/10 border-primary/30 text-primary'
                      : 'bg-muted/20 border-transparent hover:bg-muted/40 hover:text-foreground text-muted-foreground'
                  }`}
                  onClick={() => {
                    setPreferences({ toolMessageDisplay: mode.value });
                    onClose();
                  }}
                >
                  <div className={`p-1.5 rounded-md shrink-0 ${isActive ? 'bg-primary/20' : 'bg-muted/40'}`}>
                    <Icon size={12} />
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className={`text-[11px] font-bold ${isActive ? 'text-primary' : ''}`}>{mode.label}</div>
                    <div className="text-[10px] text-muted-foreground/80 leading-tight">{mode.description}</div>
                  </div>
                  {isActive && (
                    <div className="ml-auto shrink-0 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
