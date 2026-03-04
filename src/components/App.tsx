import { useEffect, useState } from 'react';
import { useStore } from '../store/index.ts';
import { Header } from './Header.tsx';
import { ChatView } from './ChatView.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { HistoryDrawer } from './HistoryDrawer.tsx';
import { GalleryView } from './GalleryView.tsx';
import { LockScreen } from './LockScreen.tsx';
import { useStreaming } from '../hooks';
// import { ToastProvider, Toaster } from './ui/toast/index.ts';

export function App() {
  const store = useStore();
  const view = useStore((state) => state.view);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    store.loadFromStorage().then(() => {
      setIsLoading(false);
    });
  }, []);

  // Sync theme with document element
  useEffect(() => {
    if (store.theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }, [store.theme]);

  // Setup streaming listener - must be before any conditional returns
  useStreaming();

  if (isLoading) {
    return (
      <div id="app" className="flex items-center justify-center h-screen">
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    );
  }

  // Check if lock screen should be shown
  // Only show if lock is enabled, not authenticated, AND password has been set
  const shouldShowLockScreen =
    store.security.isLockEnabled &&
    !store.isAuthenticated &&
    store.security.passwordHash !== null;

  return (
    <div id="app" className="relative flex flex-col h-screen overflow-hidden bg-background text-foreground">
      {shouldShowLockScreen && <LockScreen />}
      {store.isCompacting && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-[1000] text-white gap-3 animate-in fade-in duration-300">
          <div className="compacting-spinner"></div>
          <div className="text-sm font-medium">Summarizing conversation...</div>
        </div>
      )}
      <Header />
      <main className="flex-1 relative overflow-hidden">
        {view === 'chat' && <ChatView />}
        {view === 'settings' && <SettingsPanel />}
        {view === 'gallery' && <GalleryView />}
      </main>
      <HistoryDrawer />

    </div>
  );
}

