import type { SlashCommandDef } from '../utils/slashCommands.ts';

export function SlashCommandPopover({
  commands,
  highlightCmd,
  onPick,
}: {
  commands: SlashCommandDef[];
  highlightCmd: string | null;
  onPick: (cmd: string) => void;
}) {
  if (commands.length === 0) return null;
  return (
    <div className="absolute bottom-full left-3 right-3 bg-popover border border-border rounded-lg shadow-xl mb-2 overflow-hidden z-50 animate-in slide-in-from-bottom-2 duration-200 backdrop-blur-md">
      {commands.map(({ cmd, desc }) => (
        <div
          key={cmd}
          className={`px-3 py-2 cursor-pointer flex flex-col gap-0 transition-colors ${
            cmd === highlightCmd
              ? 'bg-accent/20 text-accent-foreground'
              : 'hover:bg-accent/10 focus:bg-accent/20'
          }`}
          onClick={() => onPick(cmd)}
        >
          <div className="font-bold text-xs text-primary font-mono">{cmd}</div>
          <div className="text-2xs text-muted-foreground leading-tight tracking-tight">{desc}</div>
        </div>
      ))}
    </div>
  );
}
