import { useEffect, useState } from 'react';
import { useStore } from '../store/index.ts';
import { Header } from './Header.tsx';
import { ChatView } from './ChatView.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { HistoryDrawer } from './HistoryDrawer.tsx';
import { GalleryView } from './GalleryView.tsx';
import { LockScreen } from './LockScreen.tsx';
import { useStreaming } from '../hooks/useStreaming.ts';

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

  // Setup streaming listener - must be before any conditional returns
  useStreaming();

  if (isLoading) {
    return (
      <div id="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
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
    <div id="app">
      {shouldShowLockScreen && <LockScreen />}
      {shouldShowLockScreen && <div className="lock-backdrop" />}
      {store.isCompacting && (
        <div className="compacting-overlay">
          <div className="compacting-spinner"></div>
          <div>Summarizing conversation...</div>
        </div>
      )}
      <Header />
      {view === 'chat' && <ChatView />}
      {view === 'settings' && <SettingsPanel />}
      {view === 'gallery' && <GalleryView />}
      <HistoryDrawer />
    </div>
  );
}

