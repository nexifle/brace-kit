import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, PanelLeft, Presentation } from 'lucide-react';

export interface SlideCreatorTabDialogProps {
  isOpen: boolean;
  onOpenInTab: (dontShowAgain: boolean) => void;
  onCancel: (dontShowAgain: boolean) => void;
}

export function SlideCreatorTabDialog({ isOpen, onOpenInTab, onCancel }: SlideCreatorTabDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // Reset the checkbox each open and focus the primary action.
  useEffect(() => {
    if (isOpen) {
      setDontShowAgain(false);
      const t = setTimeout(() => primaryRef.current?.focus(), 250);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-100 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/70 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onCancel(dontShowAgain)}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="slide-tab-title"
            className="relative w-full max-w-[400px] overflow-hidden rounded-none border border-border/70 bg-card shadow-[0_24px_80px_-20px_rgba(0,0,0,0.5)] outline-none"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(dontShowAgain); }}
          >
            {/* Decorative top glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
            <div className="relative p-6 flex flex-col gap-4">
              <div className="flex items-start gap-4">
                <div className="relative shrink-0">
                  <div className="w-12 h-12 rounded-none bg-linear-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/30">
                    <Presentation size={22} />
                  </div>
                  <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-success ring-2 ring-card" />
                </div>
                <div className="min-w-0">
                  <h3 id="slide-tab-title" className="text-lg font-bold tracking-tight text-foreground leading-snug">
                    Builder works best in a new tab
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                    The full canvas, preview, and editing tools are easier to use with more room. Open it as a focused workspace instead of in the side panel.
                  </p>
                </div>
              </div>

              {/* Don't show again */}
              <button
                type="button"
                role="checkbox"
                aria-checked={dontShowAgain}
                onClick={() => setDontShowAgain(!dontShowAgain)}
                className="flex items-center gap-2.5 text-2xs text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                <span className={`w-4 h-4 rounded-none border flex items-center justify-center transition-colors ${dontShowAgain ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-transparent'}`}>
                  {dontShowAgain && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                Don't show this again
              </button>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onCancel(dontShowAgain)}
                  className="flex-1 h-10 rounded-none border border-border bg-transparent text-foreground text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
                >
                  <PanelLeft size={15} />
                  Stay in Sidebar
                </button>
                <button
                  ref={primaryRef}
                  type="button"
                  onClick={() => onOpenInTab(dontShowAgain)}
                  className="flex-1 h-10 rounded-none bg-primary text-primary-foreground text-sm font-bold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/25"
                >
                  <ExternalLink size={15} />
                  Open in Tab
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}