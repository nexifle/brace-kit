import { createPortal } from 'react-dom';
import { AlertTriangleIcon } from 'lucide-react';

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'default' | 'destructive' | 'danger';
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Stop & Continue',
    cancelLabel = 'Cancel',
    variant = 'default',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    const isDestructive = variant === 'destructive' || variant === 'danger';

    return createPortal(
        <div
            className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-auto"
            onKeyDown={(e) => {
                if (e.key === 'Escape') onCancel();
            }}
        >
            <div
                className="absolute inset-0 bg-background/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={onCancel}
            />
            <div className="relative w-full max-w-[320px] bg-card border border-border shadow-2xl rounded-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 text-center sm:text-left">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 mb-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${isDestructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                            <AlertTriangleIcon size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-foreground mb-1">{title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {message}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex border-t border-border">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-4 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors border-r border-border active:bg-muted/80"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`flex-1 px-4 py-4 text-sm font-bold transition-colors ${isDestructive ? 'text-destructive hover:bg-destructive/5 active:bg-destructive/10' : 'text-primary hover:bg-primary/5 active:bg-primary/10'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
