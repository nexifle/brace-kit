import { BookOpenIcon, MousePointer2Icon, SparklesIcon } from 'lucide-react';
import { usePageContext } from '../hooks';
import { Btn } from './ui/Btn.tsx';

export function WelcomeScreen() {
  const { attachPageContext, grabSelection } = usePageContext();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-700">
      <div className="w-full max-w-[280px] space-y-8">

        {/* Branding Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full group-hover:bg-primary/30 transition-colors duration-500" />
            <div className="relative w-20 h-20 rounded-lg bg-card/80 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-2xl rotate-3 group-hover:rotate-6 transition-transform duration-500">
              <SparklesIcon size={36} className="text-primary animate-pulse" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-foreground">
              BraceKit
            </h1>
            <p className="text-xs text-muted-foreground font-medium max-w-[220px] leading-relaxed mx-auto">
              Your intelligent companion for the web. Explore, analyze, and create.
            </p>
          </div>
        </div>

        {/* Action Grid */}
        <div className="grid gap-3 animate-in slide-in-from-bottom-6 duration-700 delay-200">
          <Btn
            variant="default"
            size="lg"
            className="px-4! w-full justify-start h-14 rounded-lg gap-4 group/btn"
            onClick={attachPageContext}
          >
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center group-hover/btn:scale-110 transition-transform">
              <BookOpenIcon size={16} />
            </div>
            <div className="flex flex-col items-start gap-0">
              <span className="text-xs font-bold uppercase tracking-widest">Read Page</span>
              <span className="text-[10px] opacity-60 font-medium">Analyze current context</span>
            </div>
          </Btn>

          <Btn
            variant="outline"
            size="lg"
            className="px-4! w-full justify-start h-14 rounded-lg gap-4 border-border/50 bg-card/50 backdrop-blur-md group/btn"
            onClick={grabSelection}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover/btn:scale-110 transition-transform">
              <MousePointer2Icon size={16} />
            </div>
            <div className="flex flex-col items-start gap-0">
              <span className="text-xs font-bold uppercase tracking-widest">Grab Selection</span>
              <span className="text-[10px] opacity-60 font-medium">Focus on highlighted text</span>
            </div>
          </Btn>
        </div>

        <div className="pt-4 animate-in fade-in duration-1000 delay-500 text-[10px] text-muted-foreground/40 font-bold uppercase tracking-[0.3em]">
          Powered by Advanced Intelligence
        </div>
      </div>
    </div>
  );
}
