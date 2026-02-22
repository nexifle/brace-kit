import { useState } from 'react';
import { useStore } from '../store/index.ts';
import { IconButton } from './ui/IconButton.tsx';
import { MoonIcon, SunIcon } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog.tsx';
import { useChat } from '../hooks/useChat.ts';

export function Header() {
  const store = useStore();
  const { stopStreaming, newChat } = useChat();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleNewChat = () => {
    if (store.isStreaming) {
      setShowConfirm(true);
    } else {
      newChat();
    }
  };

  const confirmNewChat = () => {
    stopStreaming();
    newChat();
    setShowConfirm(false);
  };

  return (
    <header className="flex items-center justify-between px-3.5 py-2.5 bg-background border-b border-border shrink-0 backdrop-blur-md sticky top-0 z-10">
      <ConfirmDialog
        isOpen={showConfirm}
        title="Stop Chat?"
        message="The current request will be automatically stopped if you try to create a new chat."
        confirmLabel="Yes, New Chat"
        onConfirm={confirmNewChat}
        onCancel={() => setShowConfirm(false)}
      />
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary p-1 shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20">

            <path
              d="M17,8 Q17,14 14,17 Q10,20 10,24 Q10,28 14,31 Q17,34 17,40"
              fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
            />

            <path
              d="M31,8 Q31,14 34,17 Q38,20 38,24 Q38,28 34,31 Q31,34 31,40"
              fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round"
            />

            <circle cx="24" cy="24" r="4" fill="currentColor" />
          </svg>
        </div>
        <span className="font-bold text-base tracking-tight text-foreground">AI Sidebar</span>
      </div>
      <div className="flex gap-1">
        <IconButton
          title={store.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          onClick={() => store.setTheme(store.theme === 'dark' ? 'light' : 'dark')}
        >
          {store.theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
        </IconButton>
        <IconButton
          title="Gallery"
          onClick={() => store.setView('gallery')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </IconButton>
        <IconButton
          title="Chat History"
          onClick={() => store.toggleHistoryDrawer()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </IconButton>
        <IconButton
          title="New Chat"
          onClick={handleNewChat}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </IconButton>

        <IconButton
          title="Settings"
          onClick={() => store.setView('settings')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </IconButton>

        {store.security.isLockEnabled && store.isAuthenticated && (
          <IconButton
            title="Lock"
            onClick={() => store.lock()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <circle cx="12" cy="16" r="1" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </IconButton>
        )}
      </div>
    </header>
  );
}
