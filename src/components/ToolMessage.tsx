import { WrenchIcon, ChevronDownIcon, Loader2Icon, AlertCircleIcon, CheckCircle2Icon, ChevronUpIcon } from 'lucide-react';
import { useState } from 'react';

// ==================== Types ====================

export interface ToolMessageData {
  name: string;
  content: string;
  toolCallId?: string;
  toolArguments?: Record<string, unknown>;
  isCachedResult?: boolean;
}

interface ToolMessageProps {
  name: string;
  content: string;
  toolCallId?: string;
  toolArguments?: Record<string, unknown>;
  isCachedResult?: boolean;
  mode?: 'detailed' | 'compact';
}

interface ToolMessageGroupProps {
  tools: ToolMessageData[];
  mode: 'detailed' | 'compact';
}

// ==================== Detailed Mode Component ====================

function ToolMessageDetailed({ name, content, toolArguments, isCachedResult }: Omit<ToolMessageProps, 'mode'>) {
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  const isCalling = content.trim().includes('Calling...');
  const isError = content.trim().startsWith('Error:');

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
              <span className="text-2xs font-black uppercase tracking-widest text-foreground/80 leading-none">
                Tool Execution
              </span>
              <span className="text-xs font-bold text-foreground">
                {name}
              </span>
            </div>
            {isCachedResult && (
              <span className="px-1.5 py-0.5 rounded-md bg-muted/50 border border-border/50 text-2xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
                cached
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isCalling ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 border border-primary/20">
                <Loader2Icon size={10} className="text-primary animate-spin" />
                <span className="text-2xs font-black uppercase tracking-widest text-primary">Running</span>
              </div>
            ) : isError ? (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 border border-destructive/20">
                <AlertCircleIcon size={10} className="text-destructive" />
                <span className="text-2xs font-black uppercase tracking-widest text-destructive">Error</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 border border-success/20">
                <CheckCircle2Icon size={10} className="text-success" />
                <span className="text-2xs font-black uppercase tracking-widest text-success">Completed</span>
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
                <span className="text-2xs font-black uppercase tracking-widest text-primary/70">Args</span>
                <span className={`text-2xs font-mono text-foreground/70 truncate transition-opacity duration-300 ${isArgsExpanded ? 'opacity-0' : 'opacity-100'}`}>
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
                <div className="text-2xs font-mono text-foreground/90 break-all leading-relaxed font-medium">
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
                <span className="text-2xs font-black uppercase tracking-widest text-muted-foreground">Result</span>
                <span className={`text-2xs font-mono text-foreground/70 truncate transition-opacity duration-300 ${isResultExpanded ? 'opacity-0' : 'opacity-100'}`}>
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
                <pre className={`text-2xs font-mono whitespace-pre-wrap wrap-break-word max-h-60 overflow-y-auto scrollbar-thin
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

// ==================== Compact Mode Components ====================

interface ToolBadgeProps {
  tool: ToolMessageData;
  isExpanded: boolean;
  onToggle: () => void;
}

function ToolBadge({ tool, isExpanded, onToggle }: ToolBadgeProps) {
  const isCalling = tool.content.trim().includes('Calling...');
  const isError = tool.content.trim().startsWith('Error:');
  const [isArgsExpanded, setIsArgsExpanded] = useState(false);
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  const argsDisplay = tool.toolArguments
    ? Object.entries(tool.toolArguments)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(', ')
    : '';

  const getStatusIcon = () => {
    if (isCalling) {
      return <Loader2Icon size={10} className="text-primary animate-spin" />;
    }
    if (isError) {
      return <AlertCircleIcon size={10} className="text-destructive" />;
    }
    return <CheckCircle2Icon size={10} className="text-success" />;
  };

  const getStatusClass = () => {
    if (isCalling) return 'bg-primary/10 border-primary/20 text-primary';
    if (isError) return 'bg-destructive/10 border-destructive/20 text-destructive';
    return 'bg-success/10 border-success/20 text-success';
  };

  return (
    <div className="flex flex-col">
      {/* Badge Button */}
      <button
        onClick={onToggle}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-2xs font-bold border transition-all hover:shadow-sm ${isExpanded ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted/40 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/60'
          }`}
      >
        <WrenchIcon size={10} />
        <span className="truncate max-w-[100px]">{tool.name}</span>
        <div className={`flex items-center justify-center w-3.5 h-3.5 rounded-full ${getStatusClass()}`}>
          {getStatusIcon()}
        </div>
        {tool.isCachedResult && (
          <span className="text-[8px] uppercase tracking-wider opacity-60">cached</span>
        )}
        {isExpanded ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}
      </button>

      {/* Expanded Detail Panel */}
      {isExpanded && !isCalling && (
        <div className="mt-2 ml-1 pl-2 border-l-2 border-primary/30 animate-in slide-in-from-top-1 duration-200">
          {/* Arguments */}
          {argsDisplay && (
            <div className="mb-2">
              <button
                onClick={() => setIsArgsExpanded(!isArgsExpanded)}
                className={`w-full flex items-center justify-between px-2 py-1 rounded-md bg-muted/30 border border-border/30 text-2xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/50 transition-all ${isArgsExpanded ? 'rounded-b-none border-b-0' : ''
                  }`}
              >
                <span>Args</span>
                <ChevronDownIcon size={10} className={`transition-transform ${isArgsExpanded ? 'rotate-180' : ''}`} />
              </button>
              {isArgsExpanded && (
                <div className="px-2 py-1.5 bg-muted/20 border border-border/30 border-t-0 rounded-b-md text-2xs font-mono text-foreground/80 break-all">
                  {argsDisplay}
                </div>
              )}
            </div>
          )}

          {/* Result */}
          <div className="mb-1">
            <button
              onClick={() => setIsResultExpanded(!isResultExpanded)}
              className={`w-full flex items-center justify-between px-2 py-1 rounded-md bg-muted/20 border border-border/30 text-2xs font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/50 transition-all ${isResultExpanded ? 'rounded-b-none border-b-0' : ''
                }`}
            >
              <span>Result</span>
              <ChevronDownIcon size={10} className={`transition-transform ${isResultExpanded ? 'rotate-180' : ''}`} />
            </button>
            {isResultExpanded && (
              <pre className={`text-2xs font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto scrollbar-thin p-2 rounded-b-md bg-muted/20 border border-border/30 border-t-0 ${isError ? 'text-destructive/90' : 'text-muted-foreground'
                }`}>
                {tool.content}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolMessageCompact({ tools }: { tools: ToolMessageData[] }) {
  const [expandedBadges, setExpandedBadges] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const MAX_VISIBLE = 3;
  const visibleTools = showAll ? tools : tools.slice(0, MAX_VISIBLE);
  const hiddenCount = tools.length - MAX_VISIBLE;

  const toggleBadge = (toolCallId: string) => {
    setExpandedBadges(prev => {
      const next = new Set(prev);
      if (next.has(toolCallId)) {
        next.delete(toolCallId);
      } else {
        next.add(toolCallId);
      }
      return next;
    });
  };

  if (tools.length === 0) return null;

  return (
    <div className="w-full flex flex-col gap-2 mb-4 max-w-full self-start animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="">
        {/* Badges Row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTools.map((tool, idx) => (
            <ToolBadge
              key={tool.toolCallId || `tool-${idx}`}
              tool={tool}
              isExpanded={expandedBadges.has(tool.toolCallId || `tool-${idx}`)}
              onToggle={() => toggleBadge(tool.toolCallId || `tool-${idx}`)}
            />
          ))}

          {/* Show More Badge */}
          {!showAll && hiddenCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-2xs font-bold bg-muted/40 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              +{hiddenCount} more
            </button>
          )}

          {/* Show Less Badge */}
          {showAll && tools.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAll(false)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-2xs font-bold bg-muted/40 border border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
            >
              show less
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== Main Export Components ====================

export function ToolMessage({ name, content, toolArguments, isCachedResult, mode = 'detailed' }: ToolMessageProps) {
  if (mode === 'compact') {
    // For single tool in compact mode, wrap in array
    return (
      <ToolMessageCompact
        tools={[{ name, content, toolArguments, isCachedResult, toolCallId: name }]}
      />
    );
  }

  return (
    <ToolMessageDetailed
      name={name}
      content={content}
      toolArguments={toolArguments}
      isCachedResult={isCachedResult}
    />
  );
}

export function ToolMessageGroup({ tools, mode }: ToolMessageGroupProps) {
  if (mode === 'compact') {
    return <ToolMessageCompact tools={tools} />;
  }

  // Detailed mode: render each tool individually
  return (
    <>
      {tools.map((tool, idx) => (
        <ToolMessageDetailed
          key={tool.toolCallId || `tool-${idx}`}
          name={tool.name}
          content={tool.content}
          toolArguments={tool.toolArguments}
          isCachedResult={tool.isCachedResult}
        />
      ))}
    </>
  );
}
