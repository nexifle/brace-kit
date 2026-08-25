import { describe, expect, it } from 'bun:test';
import type { ToolMessageData } from '../../src/components/ToolMessage.tsx';
import {
  activityDurationMs,
  formatToolActivity,
  formatWorkedFor,
  formatWorkingFor,
  toolActivityStatus,
} from '../../src/utils/toolActivityLabel';

function tool(partial: Partial<ToolMessageData> & { name: string }): ToolMessageData {
  return { content: 'ok', ...partial };
}

describe('toolActivityLabel', () => {
  it('status from content', () => {
    expect(toolActivityStatus('⏳ Calling...')).toBe('running');
    expect(toolActivityStatus('Error: boom')).toBe('error');
    expect(toolActivityStatus('results')).toBe('done');
  });

  it('formats web_search with query', () => {
    const f = formatToolActivity(
      tool({ name: 'web_search', toolArguments: { query: 'honda wiring' }, content: 'hits' }),
    );
    expect(f.icon).toBe('search');
    expect(f.title).toBe('Ran 1 search');
    expect(f.detail).toBe('honda wiring');
  });

  it('uses present tense while calling', () => {
    const f = formatToolActivity(
      tool({ name: 'google_search', content: '⏳ Calling...', toolArguments: { query: 'x' } }),
    );
    expect(f.title).toBe('Searching');
    expect(f.status).toBe('running');
  });

  it('formats web_fetch as opened page', () => {
    const f = formatToolActivity(
      tool({
        name: 'web_fetch',
        toolArguments: { url: 'https://docs.python.org/3/' },
        content: 'md',
      }),
    );
    expect(f.icon).toBe('globe');
    expect(f.title).toBe('Opened page');
    expect(f.detail).toBe('docs.python.org/3/');
  });

  it('formats opened page from url arg', () => {
    const f = formatToolActivity(
      tool({
        name: 'open_page',
        toolArguments: { url: 'https://example.com/docs/a' },
        content: 'html',
      }),
    );
    expect(f.icon).toBe('globe');
    expect(f.title).toBe('Opened page');
    expect(f.detail).toBe('example.com/docs/a');
  });

  it('humanizes mcp tool names and first string arg', () => {
    const f = formatToolActivity(
      tool({ name: 'read_file', toolArguments: { path: '/tmp/a.ts' }, content: 'src' }),
    );
    expect(f.icon).toBe('file');
    expect(f.title).toBe('Read file');
    expect(f.detail).toBe('/tmp/a.ts');
  });

  it('formats duration copy', () => {
    expect(formatWorkedFor(17000)).toBe('Worked for 17 seconds');
    expect(formatWorkedFor(400)).toBe('Worked for 1 second');
    expect(formatWorkingFor(17000)).toBe('Working for 17s');
  });

  it('derives duration only when endedAt is after startedAt', () => {
    expect(activityDurationMs(10, 40)).toBe(30);
    expect(activityDurationMs(10, 10)).toBeUndefined();
    expect(activityDurationMs(10)).toBeUndefined();
  });
});
