import type { ToolMessageData } from '../components/ToolMessage.tsx';

export type ToolActivityIcon = 'search' | 'globe' | 'wrench' | 'file' | 'think' | 'error';
export type ToolActivityStatus = 'running' | 'done' | 'error';

export interface FormattedToolActivity {
  icon: ToolActivityIcon;
  title: string;
  detail?: string;
  status: ToolActivityStatus;
}

export interface ActivityTimelineRow {
  key: string;
  icon: ToolActivityIcon;
  title: string;
  detail?: string;
  status: ToolActivityStatus;
  tool: ToolMessageData;
}

const SEARCH_TOOLS = new Set(['web_search', 'google_search']);
const OPEN_NAME = /^(open_|browse_|fetch_url|open_page|browser_navigate)/i;
const FILE_NAME = /^(read_|write_|list_|delete_|apply_patch|edit_)/i;

const DETAIL_KEYS = [
  'query',
  'url',
  'uri',
  'path',
  'file',
  'filename',
  'name',
  'reason',
  'command',
  'pattern',
  'q',
];

export function isToolRunning(content: string | undefined): boolean {
  return (content ?? '').includes('Calling...');
}

export function isToolError(content: string | undefined): boolean {
  return (content ?? '').trim().startsWith('Error:');
}

export function toolActivityStatus(content: string | undefined): ToolActivityStatus {
  if (isToolRunning(content)) return 'running';
  if (isToolError(content)) return 'error';
  return 'done';
}

function firstStringArg(args: Record<string, unknown> | undefined): string | undefined {
  if (!args) return undefined;
  for (const key of DETAIL_KEYS) {
    const v = args[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function humanizeToolName(name: string): string {
  const cleaned = name.replace(/^mcp__/i, '').replace(/[_-]+/g, ' ').trim();
  if (!cleaned) return 'Tool';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function hostnameFromUrl(value: string): string {
  try {
    const u = new URL(value);
    return `${u.hostname}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return value;
  }
}

export function truncateActivity(text: string, maxLen = 72): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

export function formatToolActivity(tool: ToolMessageData): FormattedToolActivity {
  const name = tool.name || 'unknown';
  const status = toolActivityStatus(tool.content);
  const detailRaw = firstStringArg(tool.toolArguments);
  const running = status === 'running';

  if (SEARCH_TOOLS.has(name)) {
    return {
      icon: 'search',
      title: running ? 'Searching' : 'Ran 1 search',
      detail: detailRaw ? truncateActivity(detailRaw) : undefined,
      status,
    };
  }

  const looksUrl = Boolean(detailRaw && /^https?:\/\//i.test(detailRaw));
  if (OPEN_NAME.test(name) || looksUrl) {
    return {
      icon: 'globe',
      title: running ? 'Opening page' : 'Opened page',
      detail: detailRaw ? truncateActivity(hostnameFromUrl(detailRaw)) : undefined,
      status,
    };
  }

  if (name === 'continue_message') {
    return {
      icon: 'think',
      title: running ? 'Continuing' : 'Continued',
      detail: detailRaw ? truncateActivity(detailRaw) : undefined,
      status,
    };
  }

  if (FILE_NAME.test(name)) {
    return {
      icon: 'file',
      title: humanizeToolName(name),
      detail: detailRaw ? truncateActivity(detailRaw) : undefined,
      status,
    };
  }

  return {
    icon: status === 'error' ? 'error' : 'wrench',
    title: humanizeToolName(name),
    detail: detailRaw ? truncateActivity(detailRaw) : undefined,
    status,
  };
}

/** One timeline row per tool call (no nested search groups). */
export function coalesceToolActivities(tools: ToolMessageData[]): ActivityTimelineRow[] {
  return tools.map((tool, i) => {
    const formatted = formatToolActivity(tool);
    return {
      key: tool.toolCallId || `tool-${i}`,
      icon: formatted.icon,
      title: formatted.title,
      detail: formatted.detail,
      status: formatted.status,
      tool,
    };
  });
}

export function formatWorkedFor(ms: number): string {
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `Worked for ${seconds} second${seconds === 1 ? '' : 's'}`;
}

export function formatWorkingFor(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `Working for ${seconds}s`;
}
