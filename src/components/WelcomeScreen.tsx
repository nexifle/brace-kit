import { BookOpenIcon, HeartIcon, MousePointer2Icon, SparklesIcon } from 'lucide-react';
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
              <span className="text-2xs opacity-60 font-medium">Analyze current context</span>
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
              <span className="text-2xs opacity-60 font-medium">Focus on highlighted text</span>
            </div>
          </Btn>
        </div>

        {/* Donate Button */}
        <a
          href="https://saweria.co/satriaajiputra"
          target="_blank"
          rel="noopener noreferrer"
          className="animate-in slide-in-from-bottom-4 duration-700 delay-300 group relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-linear-to-r from-rose-500/20 via-pink-500/20 to-orange-500/20 rounded-lg blur-sm group-hover:blur-md transition-all" />
          <div className="relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-linear-to-r from-rose-500/10 via-pink-500/10 to-orange-500/10 border border-rose-500/20 group-hover:border-rose-500/40 group-hover:from-rose-500/20 group-hover:via-pink-500/20 group-hover:to-orange-500/20 transition-all">
            <HeartIcon size={14} className="text-rose-400 group-hover:text-rose-300 group-hover:scale-110 transition-all" />
            <span className="text-xs font-bold uppercase tracking-widest text-rose-300 group-hover:text-rose-200">
              Support Development
            </span>
          </div>
        </a>

        <div className="pt-2 animate-in fade-in duration-1000 delay-500">
          <div className="text-2xs text-muted-foreground/40 font-bold uppercase tracking-[0.3em]">
            Powered by Advanced Intelligence
          </div>
        </div>
      </div>
    </div>
  );
}
