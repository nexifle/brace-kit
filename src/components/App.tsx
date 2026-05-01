import { useEffect, useState } from 'react';
import { useStore } from '../store/index.ts';
import { Header } from './Header.tsx';
import { ChatView } from './ChatView.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { HistoryDrawer } from './HistoryDrawer.tsx';
import { GalleryView } from './GalleryView.tsx';
import { LockScreen } from './LockScreen.tsx';
import { useStreaming } from '../hooks';
import { LayoutModeProvider, type LayoutMode } from './LayoutModeContext.tsx';
// import { ToastProvider, Toaster } from './ui/toast/index.ts';

export function App() {
  const store = useStore();
  const view = useStore((state) => state.view);
  const [isLoading, setIsLoading] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>(() => {
    if (typeof window === 'undefined') return 'panel';
    return new URLSearchParams(window.location.search).get('view') === 'tab' ? 'tab' : 'panel';
  });

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode: LayoutMode = params.get('view') === 'tab' ? 'tab' : 'panel';
    setLayoutMode(mode);
    document.documentElement.setAttribute('data-layout', mode);
    document.body.setAttribute('data-layout', mode);
  }, []);

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

  if (shouldShowLockScreen) {
    return <LockScreen />;
  }

  const isTabLayout = layoutMode === 'tab';
  const useChatShell = isTabLayout && view === 'chat';

  return (
    <LayoutModeProvider mode={layoutMode}>
      <div
        id="app"
        data-layout={layoutMode}
        className={`relative flex h-screen overflow-hidden text-foreground ${
          layoutMode === 'tab'
            ? 'bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.14),transparent_36%),linear-gradient(180deg,rgba(148,163,184,0.06),transparent_24%),var(--background)]'
            : 'bg-background'
        }`}
      >
        {layoutMode === 'tab' && (
          <div className="pointer-events-none absolute inset-0 opacity-60">
            <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(180deg,rgba(99,102,241,0.08),transparent)]" />
            <div className="absolute left-[8%] top-24 h-40 w-40 rounded-full bg-primary/8 blur-3xl" />
            <div className="absolute right-[10%] top-36 h-56 w-56 rounded-full bg-primary/6 blur-3xl" />
          </div>
        )}
        {store.isCompacting && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center z-[1000] text-white gap-3 animate-in fade-in duration-300">
            <div className="compacting-spinner"></div>
            <div className="text-sm font-medium">Summarizing conversation...</div>
          </div>
        )}
        <div className="relative flex w-full flex-col overflow-hidden">
          {useChatShell ? (
            <div className="mx-auto h-full w-full max-w-[1440px] px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex h-full flex-col overflow-hidden rounded-[28px] border border-border/60 bg-background/92 shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur-xl">
                <Header />
                <main className="flex-1 relative overflow-hidden">
                  <ChatView />
                </main>
                <HistoryDrawer />
              </div>
            </div>
          ) : (
            <>
              <Header />
              <main className="flex-1 relative overflow-hidden">
                {view === 'chat' && <ChatView />}
                {view === 'settings' && <SettingsPanel />}
                {view === 'gallery' && <GalleryView />}
              </main>
              <HistoryDrawer />
            </>
          )}
        </div>
      </div>
    </LayoutModeProvider>
  );
}
