import { useCallback, useState } from 'react';
import { AlertCircleIcon, BookOpenIcon, HeartIcon, MousePointer2Icon, SparklesIcon, XIcon } from 'lucide-react';
import { usePageContext } from '../hooks';
import { Btn } from './ui/Btn.tsx';
import { cn } from '../utils/cn.ts';
import { useLayoutMode } from './LayoutModeContext.tsx';

export function WelcomeScreen() {
  const { attachPageContext, grabSelection } = usePageContext();
  const [error, setError] = useState<string | null>(null);
  const { isTabLayout } = useLayoutMode();

  const handleReadPage = useCallback(async () => {
    setError(null);
    try {
      await attachPageContext();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [attachPageContext]);

  const handleGrabSelection = useCallback(async () => {
    setError(null);
    try {
      await grabSelection();
    } catch (e) {
      setError((e as Error).message);
    }
  }, [grabSelection]);

  return (
    <div
      className={cn(
        'flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-700',
        isTabLayout ? 'px-6 py-10 sm:px-10' : 'p-8',
      )}
    >
      <div className={cn('w-full space-y-8', isTabLayout ? 'max-w-3xl' : 'max-w-[280px]')}>

        {/* Branding Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors duration-500" />
            <div className="relative w-20 h-20 rounded-lg bg-card/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-2xl rotate-3 group-hover:rotate-6 transition-transform duration-500">
              <SparklesIcon size={36} className="text-primary animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className={cn('font-black tracking-tight text-foreground', isTabLayout ? 'text-4xl' : 'text-2xl')}>
              BraceKit
            </h1>
            <p
              className={cn(
                'text-muted-foreground font-medium leading-relaxed mx-auto',
                isTabLayout ? 'max-w-2xl text-sm' : 'text-xs max-w-[220px]',
              )}
            >
              Your intelligent companion for the web. Explore, analyze, and create.
            </p>
          </div>
        </div>

        {/* Action Grid */}
        <div
          className={cn(
            'grid gap-3 animate-in slide-in-from-bottom-6 duration-700 delay-200',
            isTabLayout && 'md:grid-cols-2',
          )}
        >
          <Btn
            variant="default"
            size="lg"
            className={cn('px-4! w-full justify-start rounded-lg gap-4 group/btn', isTabLayout ? 'h-16' : 'h-14')}
            onClick={handleReadPage}
          >
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
              <BookOpenIcon size={16} />
            </div>
            <div className="flex flex-col items-start gap-0">
              <span className="text-xs font-bold uppercase tracking-widest">Read Page</span>
              <span className="text-2xs opacity-60 font-medium">Analyze current context</span>
            </div>
          </Btn>

          <Btn
            variant="outline"
            size="lg"
            className={cn(
              'px-4! w-full justify-start rounded-lg gap-4 border-border/50 bg-card/50 backdrop-blur-md group/btn',
              isTabLayout ? 'h-16' : 'h-14',
            )}
            onClick={handleGrabSelection}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover/btn:scale-110 transition-transform">
              <MousePointer2Icon size={16} />
            </div>
            <div className="flex flex-col items-start gap-0">
              <span className="text-xs font-bold uppercase tracking-widest">Grab Selection</span>
              <span className="text-2xs opacity-60 font-medium">Focus on highlighted text</span>
            </div>
          </Btn>
        </div>

        {/* Inline Error */}
        {error && (
          <div
            className="animate-in slide-in-from-bottom-3 fade-in duration-300 relative rounded-lg border border-rose-500/30 bg-rose-500/10 backdrop-blur-md overflow-hidden"
            role="alert"
          >
            <div className="flex items-start gap-3 px-4 py-3">
              <AlertCircleIcon size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-medium text-rose-200 leading-relaxed flex-1 min-w-0 break-words">
                {error}
              </p>
              <button
                onClick={() => setError(null)}
                className="flex-shrink-0 p-0.5 rounded-md text-rose-400/60 hover:text-rose-300 hover:bg-rose-500/20 transition-colors"
                aria-label="Dismiss error"
              >
                <XIcon size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Donate Button */}
        <a
          href="https://bracekit.nexifle.com/support"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'animate-in slide-in-from-bottom-4 duration-700 delay-300 group relative overflow-hidden',
            isTabLayout && 'mx-auto w-full max-w-md',
          )}
        >
          <div className="absolute inset-0 bg-linear-to-r from-rose-500/20 via-pink-500/20 to-orange-500/20 rounded-lg blur-sm group-hover:blur-md transition-all" />
          <div className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-linear-to-r from-rose-500/10 via-pink-500/10 to-orange-500/10 border border-rose-500/20 group-hover:border-rose-500/40 group-hover:from-rose-500/20 group-hover:via-pink-500/20 group-hover:to-orange-500/20 transition-all">
            <HeartIcon size={14} className="text-rose-400 group-hover:text-rose-300 group-hover:scale-110 transition-all" />
            <span className="text-xs font-bold uppercase tracking-widest text-rose-300 group-hover:text-rose-200">
              Support Development
            </span>
          </div>
        </a>
      </div>
    </div>
  );
}
