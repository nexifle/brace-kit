import { WrenchIcon, ChevronDownIcon, Loader2Icon, AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';
import { useState } from 'react';

interface ToolMessageProps {
  name: string;
  content: string;
  toolCallId?: string;
  toolArguments?: Record<string, unknown>;
  isCachedResult?: boolean;
}

export function ToolMessage({ name, content, toolArguments, isCachedResult }: ToolMessageProps) {
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  // Check if it's currently in progress - more robust than exact string matching
  const isCalling = content.trim().includes('Calling...');
  const isError = content.trim().startsWith('Error:');

  // Format arguments for display
  const argsDisplay = toolArguments
    ? Object.entries(toolArguments)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
    : '';

  return (
    <div className="w-full flex flex-col gap-1 mb-5 max-w-full self-start animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="relative group px-4 py-3 bg-card/40 backdrop-blur-md border border-border/50 rounded-lg shadow-sm hover:shadow-md transition-all duration-300">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              <WrenchIcon size={12} />
            </div>
            <div className="flex flex-col gap-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-foreground/80 leading-none">
                Tool Execution
              </span>
              <span className="text-xs font-bold text-foreground">
                {name}
              </span>
            </div>
            {isCachedResult && (
              <span className="px-1.5 py-0.5 rounded-md bg-muted/50 border border-border/50 text-[9px] font-bold uppercase tracking-widest text-muted-foreground ml-1">
                cached
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isCalling ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
                <Loader2Icon size={10} className="text-primary animate-spin" />
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">Running</span>
              </div>
            ) : isError ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 border border-destructive/20">
                <AlertCircleIcon size={10} className="text-destructive" />
                <span className="text-[9px] font-black uppercase tracking-widest text-destructive">Error</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 border border-success/20">
                <CheckCircle2Icon size={10} className="text-success" />
                <span className="text-[9px] font-black uppercase tracking-widest text-success">Completed</span>
              </div>
            )}
          </div>
        </div>

        {/* Arguments - Collapsible */}
        {argsDisplay && (
          <div className="mb-2">
            <button
              onClick={() => setIsArgsExpanded(!isArgsExpanded)}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-muted/40 border border-border/30 hover:bg-muted/60 transition-all group/args
                ${isArgsExpanded ? 'rounded-b-none border-b-0' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">Args</span>
                <span className={`text-[10px] font-mono text-foreground/70 truncate transition-opacity duration-300 ${isArgsExpanded ? 'opacity-0' : 'opacity-100'}`}>
                  {argsDisplay.length > 40 ? argsDisplay.slice(0, 40) + '...' : argsDisplay}
                </span>
              </div>
              <ChevronDownIcon
                size={12}
                className={`text-muted-foreground/40 transition-transform duration-300 ${isArgsExpanded ? 'rotate-180' : ''}`}
              />
            </button>
            {isArgsExpanded && (
              <div className="px-2.5 py-2 bg-muted/20 border border-border/30 border-t-0 rounded-b-lg animate-in slide-in-from-top-1 duration-200">
                <div className="text-[10px] font-mono text-foreground/90 break-all leading-relaxed font-medium">
                  {argsDisplay}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Expandable Result */}
        {!isCalling && (
          <div className="mt-1">
            <button
              onClick={() => setIsResultExpanded(!isResultExpanded)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-muted/20 border border-border/30 hover:bg-muted/40 transition-all group/toggle
                ${isResultExpanded ? 'rounded-b-none border-b-0' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Result</span>
                <span className={`text-[10px] font-mono text-foreground/70 truncate transition-opacity duration-300 ${isResultExpanded ? 'opacity-0' : 'opacity-100'}`}>
                  {content.length > 50 ? content.slice(0, 50) + '...' : content}
                </span>
              </div>
              <ChevronDownIcon
                size={14}
                className={`text-muted-foreground transition-transform duration-300 ${isResultExpanded ? 'rotate-180' : ''}`}
              />
            </button>

            {isResultExpanded && (
              <div className="px-2.5 py-2.5 bg-muted/30 border border-border/30 border-t-0 rounded-b-lg animate-in slide-in-from-top-1 duration-200">
                <pre className={`text-[11px] font-mono whitespace-pre-wrap wrap-break-word max-h-60 overflow-y-auto scrollbar-thin
                  ${isError ? 'text-destructive/90' : 'text-muted-foreground'}`}>
                  {content}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
