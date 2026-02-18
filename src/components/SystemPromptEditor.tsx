import { useStore } from '../store/index.ts';
import { IconButton } from './ui/IconButton.tsx';

interface SystemPromptEditorProps {
    onClose: () => void;
}

export function SystemPromptEditor({ onClose }: SystemPromptEditorProps) {
    const store = useStore();
    const activeConv = store.conversations.find(c => c.id === store.activeConversationId);
    const currentPrompt = activeConv?.systemPrompt ?? '';
    const defaultPrompt = store.providerConfig.systemPrompt;

    const handleSave = (prompt: string) => {
        if (store.activeConversationId) {
            store.updateConversationSystemPrompt(store.activeConversationId, prompt);
        }
    };

    const handleReset = () => {
        if (store.activeConversationId) {
            store.updateConversationSystemPrompt(store.activeConversationId, '');
        }
    };

    return (
        <div className="system-prompt-editor">
            <div className="editor-header">
                <div className="editor-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="9" y2="6" />
                        <line x1="3" y1="12" x2="9" y2="12" />
                        <line x1="3" y1="18" x2="9" y2="18" />
                        <circle cx="12" cy="6" r="1.5" fill="currentColor" />
                        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                        <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                    </svg>
                    System Instructions
                </div>
                <IconButton title="Close" onClick={onClose} size="sm" className="close-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </IconButton>
            </div>
            <div className="editor-body">
                <textarea
                    rows={6}
                    placeholder={defaultPrompt}
                    value={currentPrompt}
                    onChange={(e) => handleSave(e.target.value)}
                    autoFocus
                    spellCheck={false}
                />
                <div className="editor-footer">
                    <div className="editor-actions">
                        <button className="reset-btn" onClick={handleReset} disabled={!currentPrompt} title="Reset to default system prompt">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                                <polyline points="21 3 21 8 16 8" />
                            </svg>
                            Reset
                        </button>
                    </div>
                    <div className="prompt-status">
                        <div className={`status-dot ${currentPrompt ? 'active' : ''}`} />
                        {currentPrompt ? 'Custom prompt active' : 'Using global default'}
                    </div>
                </div>
            </div>
        </div>
    );
}
