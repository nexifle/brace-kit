import type { Message } from '../types/index.ts';

/** Parse a Responses `web_search_call` item into transcript fields. */
export function parseHostedWebSearchItem(item: Record<string, unknown>): {
  id: string;
  query: string;
  args: Record<string, unknown>;
  content: string;
  running: boolean;
} {
  const id = typeof item.id === 'string' && item.id ? item.id : `ws_${Date.now()}`;
  const status = typeof item.status === 'string' ? item.status : '';
  const running = status === 'in_progress' || status === 'searching';
  const action =
    item.action && typeof item.action === 'object'
      ? (item.action as Record<string, unknown>)
      : {};
  const query =
    (typeof action.query === 'string' && action.query) ||
    (typeof item.query === 'string' && item.query) ||
    '';
  const url = typeof action.url === 'string' ? action.url : undefined;
  const actionType = typeof action.type === 'string' ? action.type : 'search';
  const sources = Array.isArray(action.sources)
    ? action.sources
    : Array.isArray(item.sources)
      ? item.sources
      : [];

  const args: Record<string, unknown> = { query };
  if (url) args.url = url;
  if (actionType !== 'search') args.action = actionType;

  if (running) {
    return { id, query, args, content: '⏳ Calling...', running: true };
  }

  const lines: string[] = [];
  if (query) lines.push(query);
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const rec = source as Record<string, unknown>;
    const sourceUrl = typeof rec.url === 'string' ? rec.url : '';
    if (!sourceUrl) continue;
    const title = typeof rec.title === 'string' && rec.title ? rec.title : sourceUrl;
    lines.push(`${title} - ${sourceUrl}`);
  }
  if (url && lines.length === 0) lines.push(url);
  const content = lines.join('\n') || (query ? query : 'Search completed.');

  return { id, query, args, content, running: false };
}

export function hostedToolMessageFromItem(
  item: Record<string, unknown>,
  createdAt?: number,
): Message {
  const parsed = parseHostedWebSearchItem(item);
  return {
    role: 'tool',
    name: 'web_search',
    toolCallId: parsed.id,
    content: parsed.content,
    toolArguments: parsed.args,
    toolExecution: 'hosted',
    createdAt,
  };
}
