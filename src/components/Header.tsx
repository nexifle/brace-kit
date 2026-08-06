import { useState } from 'react';
import { useStore } from '../store/index.ts';
import { IconButton } from './ui/IconButton.tsx';
import { Btn } from './ui/Btn.tsx';
import { MoonIcon, SunIcon, HelpCircleIcon, ExternalLinkIcon, PanelLeftOpenIcon, PanelLeftCloseIcon, Presentation } from 'lucide-react';
import { ConfirmDialog } from './ui/ConfirmDialog.tsx';
import { Logo } from './ui/Logo.tsx';
import { useChat } from '../hooks';

const isDev = process.env.NODE_ENV === 'development';

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

  const openInTab = async () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('tab.html') });
    // Close the side panel so only the standalone tab stays open.
    try {
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.close({ windowId: win.id! });
    } catch {
      // Panel may not be closable (e.g. Chrome flag disabled) — ignore.
    }
  };

  const useInSidebar = async () => {
    try {
      const win = await chrome.windows.getCurrent();
      // getCurrent() always resolves a browser window with an id; the type
      // marks it optional so assert it. Keeps the call inside the click gesture.
      await chrome.sidePanel.open({ windowId: win.id! });
    } catch {
      // Ignore — panel may not be openable (e.g. Chrome flag disabled)
    }
    window.close();
  };

  const commonActions = (
    <div className="flex gap-1 items-center">
      <IconButton
        title="Slide Creator"
        onClick={() => store.openSlideCreator()}
        className="rounded-none!"
      >
        <Presentation size={18} />
      </IconButton>
      <IconButton
        title={store.theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        onClick={() => store.setTheme(store.theme === 'dark' ? 'light' : 'dark')}
        className="rounded-none!"
      >
        {store.theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </IconButton>
      <IconButton
        title="Gallery"
        onClick={() => store.setView('gallery')}
        className="rounded-none!"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      </IconButton>
      {store.mode === 'sidebar' && (
        <IconButton
          title="Chat History"
          onClick={() => store.toggleHistoryDrawer()}
          className="rounded-none!"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </IconButton>
      )}
      {!(store.mode === 'tab' && !store.railCollapsed) && (
        <IconButton
          title="New Chat"
          onClick={handleNewChat}
          className="rounded-none!"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </IconButton>
      )}

      {isDev && (
        <IconButton
          title="Onboarding (Dev)"
          onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') })}
          className="rounded-none!"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </IconButton>
      )}

      <IconButton
        title="Help & Feedback"
        onClick={() => window.open('https://bracekit.nexifle.com/guide', '_blank')}
        className="rounded-none!"
      >
        <HelpCircleIcon size={18} />
      </IconButton>

      <IconButton
        title="Settings"
        onClick={() => store.setView('settings')}
        className="rounded-none!"
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
          className="rounded-none!"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <circle cx="12" cy="16" r="1" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </IconButton>
      )}
    </div>
  );

  if (store.mode === 'tab') {
    return (
      <header className="flex items-center justify-between gap-4 px-4 h-12 bg-background border-b border-border shrink-0 sticky top-0 z-10">
        <ConfirmDialog
          isOpen={showConfirm}
          title="Stop Chat?"
          message="The current request will be automatically stopped if you try to create a new chat."
          confirmLabel="Yes, New Chat"
          onConfirm={confirmNewChat}
          onCancel={() => setShowConfirm(false)}
        />
        <div className="flex items-center gap-3 min-w-0">
          <IconButton
            title={store.railCollapsed ? 'Show Conversations' : 'Hide Conversations'}
            onClick={() => store.setRailCollapsed(!store.railCollapsed)}
            className="rounded-none! shrink-0"
          >
            {store.railCollapsed ? <PanelLeftOpenIcon size={18} /> : <PanelLeftCloseIcon size={18} />}
          </IconButton>
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center text-white justify-center w-7 h-7 bg-primary p-1 shadow-sm text-primary-foreground shrink-0">
              <Logo />
            </div>
            <span className="font-bold text-base tracking-tight text-foreground">BraceKit</span>
            <span className="hidden lg:inline-flex items-center text-2xs font-mono uppercase tracking-[0.25em] text-muted-foreground/70 border-l border-border pl-3 truncate">
              AI Workspace
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {commonActions}
          <div className="w-px h-5 bg-border mx-1.5" />
          <Btn
            variant="default"
            size="sm"
            className="rounded-none! gap-1.5 h-8 shrink-0"
            onClick={useInSidebar}
            title="Use BraceKit in the side panel"
          >
            <ExternalLinkIcon size={14} />
            Use in Sidebar
          </Btn>
        </div>
      </header>
    );
  }

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
        <div className="flex items-center text-white justify-center w-7 h-7 rounded-md bg-primary p-1 shadow-sm text-primary-foreground">
          <Logo />
        </div>
        <span className="font-bold text-base tracking-tight text-foreground">BraceKit</span>
      </div>
      <div className="flex gap-1">
        <IconButton
          title="Open in new tab"
          onClick={openInTab}
        >
          <ExternalLinkIcon size={18} />
        </IconButton>
        {commonActions}
      </div>
    </header>
  );
}
