import { useEffect, useState } from 'react';
import { useStore } from '../store/index.ts';
import { Header } from './Header.tsx';
import { ChatView } from './ChatView.tsx';
import { SettingsPanel } from './SettingsPanel.tsx';
import { HistoryDrawer } from './HistoryDrawer.tsx';
import { useStreaming } from '../hooks/useStreaming.ts';

export function App() {
  const store = useStore();
  const view = useStore((state) => state.view);
  const customProviders = useStore((state) => state.customProviders);
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

  return (
    <div id="app">
      <Header />
      {view === 'chat' ? <ChatView /> : <SettingsPanel />}
      <HistoryDrawer />
    </div>
  );
}

