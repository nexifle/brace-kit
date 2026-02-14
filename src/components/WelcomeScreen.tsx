import { usePageContext } from '../hooks/usePageContext.ts';

export function WelcomeScreen() {
  const { attachPageContext, grabSelection } = usePageContext();

  return (
    <div id="welcome">
      <div className="welcome-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="url(#wgrad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="wgrad" x1="2" y1="2" x2="22" y2="22">
              <stop stopColor="#818cf8"/>
              <stop offset="1" stopColor="#a78bfa"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h2>AI Sidebar</h2>
      <p>Chat with AI about the current page or anything else.</p>
      <div className="welcome-actions">
        <button className="welcome-btn" onClick={attachPageContext}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Read Current Page
        </button>
        <button className="welcome-btn" onClick={grabSelection}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
          Grab Selection
        </button>
      </div>
    </div>
  );
}
