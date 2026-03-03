import { useStore } from '../store/index.ts';
import { Btn } from './ui/Btn.tsx';
import { XIcon, RotateCcwIcon, SparklesIcon } from 'lucide-react';

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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-in fade-in duration-200">
            <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-md bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-muted/20">
                    <div className="flex items-center gap-2.5 text-foreground font-semibold">
                        <div className="flex items-center justify-center w-8 h-8 bg-primary/10 rounded-lg text-primary">
                            <SparklesIcon size={16} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm">System Instructions</span>
                            <span className="text-2xs uppercase tracking-widest text-muted-foreground font-bold opacity-60">Custom Persona</span>
                        </div>
                    </div>
                    <Btn variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                        <XIcon size={18} />
                    </Btn>
                </div>

                <div className="p-5 flex flex-col gap-4">
                    <div className="relative group">
                        <textarea
                            className="w-full bg-muted/30 border border-border/40 rounded-lg p-3.5 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:bg-muted/50 focus:border-primary/30 focus:ring-4 focus:ring-primary/5 transition-all outline-none resize-none font-sans min-h-[180px]"
                            placeholder={defaultPrompt || "Role of the AI..."}
                            value={currentPrompt}
                            onChange={(e) => handleSave(e.target.value)}
                            autoFocus
                            spellCheck={false}
                        />
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/40 border border-border/40 rounded-full">
                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${currentPrompt ? 'bg-primary shadow-[0_0_8px_var(--primary)]' : 'bg-muted-foreground/30'}`} />
                            <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground/80">
                                {currentPrompt ? 'Custom Mode' : 'Global Default'}
                            </span>
                        </div>

                        <Btn
                            variant="ghost"
                            size="sm"
                            onClick={handleReset}
                            disabled={!currentPrompt}
                            className="text-xs font-bold uppercase tracking-tight gap-1.5 opacity-70 hover:opacity-100 disabled:opacity-30"
                        >
                            <RotateCcwIcon size={12} />
                            Reset
                        </Btn>
                    </div>
                </div>
            </div>
        </div>
    );
}
