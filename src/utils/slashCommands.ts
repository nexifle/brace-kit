/** Shared slash-command catalog for main chat and the Builder composer. */

export const SLASH_COMMANDS = [
  { cmd: '/compact', desc: 'Summarize and compress conversation' },
  { cmd: '/rename', desc: '/rename [conversation name] or /rename for auto generate' },
  { cmd: '/help', desc: 'Help and documentation' },
] as const;

export const SLASH_HELP_URL = 'https://bracekit.nexifle.com/guide';

export type SlashCommandDef = (typeof SLASH_COMMANDS)[number];

export type ParsedSlashCommand =
  | { kind: 'compact'; extra: string }
  | { kind: 'rename'; title: string }
  | { kind: 'help' };

/** Menu is open only for a leading `/` token with no space yet. */
export function isSlashMenuOpen(text: string): boolean {
  return text.startsWith('/') && !text.includes(' ');
}

export function slashMatches(text: string): SlashCommandDef[] {
  if (!isSlashMenuOpen(text)) return [];
  return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(text));
}

/** Full command string for Tab/ghost, or null when the typed text is already exact or unmatched. */
export function slashGhostCmd(text: string): string | null {
  if (!isSlashMenuOpen(text)) return null;
  const match = SLASH_COMMANDS.find((c) => c.cmd.startsWith(text) && c.cmd !== text);
  return match ? match.cmd : null;
}

const RENAME_USAGE = '[conversation name] or /rename for auto generate';

/**
 * Ghost suffix drawn after the typed text in the composer. Any prefix of
 * `/rename` (and `/rename ` after Tab) shows how to set a title vs auto-generate.
 */
export function slashUsageGhost(text: string): string | null {
  if (text === '/rename') return ` ${RENAME_USAGE}`;
  if (text === '/rename ') return RENAME_USAGE;
  return null;
}

function isRenamePrefix(text: string): boolean {
  if (text === '/rename' || text === '/rename ') return true;
  const completing = slashGhostCmd(text);
  return completing === '/rename';
}

/** Ghost overlay remainder: unfinished command name plus `/rename` usage. */
export function slashComposerGhost(text: string): string | null {
  if (isRenamePrefix(text)) {
    const cmd = slashGhostCmd(text);
    const rest = cmd ? cmd.slice(text.length) : '';
    const usage = slashUsageGhost(cmd ?? text) ?? slashUsageGhost(text) ?? ` ${RENAME_USAGE}`;
    return `${rest}${usage}`;
  }
  const cmd = slashGhostCmd(text);
  if (cmd) return cmd.slice(text.length);
  return slashUsageGhost(text);
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
  const t = text.trim();
  if (t === '/compact' || t.startsWith('/compact ')) {
    return { kind: 'compact', extra: t.slice('/compact'.length).trim() };
  }
  if (t === '/rename' || t.startsWith('/rename ')) {
    return { kind: 'rename', title: t.slice('/rename'.length).trim() };
  }
  if (t === '/help') return { kind: 'help' };
  return null;
}
