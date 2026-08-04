import { useState, useEffect } from 'react';
import { useStore } from '../store/index.ts';
import { HistoryIcon, XIcon } from 'lucide-react';
import { Btn } from './ui/Btn.tsx';
import { ConversationList } from './ConversationList.tsx';

export function HistoryDrawer() {
  const store = useStore();
  const [isVisible, setIsVisible] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (store.historyDrawerOpen) {
      setShouldRender(true);
      // Small delay to ensure animate-in triggers
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [store.historyDrawerOpen]);

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div
        className={`absolute inset-0 bg-background/60 backdrop-blur-sm transition-all duration-300 ${isVisible ? 'animate-in fade-in' : 'animate-out fade-out opacity-0'}`}
        onClick={() => store.setHistoryDrawerOpen(false)}
      />

      <div className={`relative w-2xs h-full bg-card/95 backdrop-blur-2xl border-l border-border/50 shadow-2xl flex flex-col transition-all duration-300 
        ${isVisible ? 'animate-in slide-in-from-right-full' : 'animate-out slide-out-to-right-full'}`}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <div className="flex items-center justify-center w-7 h-7 bg-muted/50 rounded-none text-muted-foreground">
              <HistoryIcon size={14} />
            </div>
            <span className="text-sm">History</span>
          </div>
          <Btn variant="ghost" size="icon-sm" onClick={() => store.setHistoryDrawerOpen(false)} className="rounded-full">
            <XIcon size={16} />
          </Btn>
        </div>

        <div className="p-3 flex flex-col flex-1 min-h-0 overflow-hidden">
          <ConversationList />
        </div>
      </div>
    </div>
  );
}
