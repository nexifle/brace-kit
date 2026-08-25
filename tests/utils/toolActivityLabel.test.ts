import { describe, expect, it } from 'bun:test';
import type { ToolMessageData } from '../../src/components/ToolMessage.tsx';
import {
  coalesceToolActivities,
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

  it('keeps one row per tool without nested search groups', () => {
    const rows = coalesceToolActivities([
      tool({ name: 'web_search', toolCallId: '1', toolArguments: { query: 'a' } }),
      tool({ name: 'google_search', toolCallId: '2', toolArguments: { query: 'b' } }),
      tool({ name: 'read_file', toolCallId: '3', toolArguments: { path: 'x' } }),
    ]);
    expect(rows).toHaveLength(3);
    expect(rows[0].title).toBe('Ran 1 search');
    expect(rows[0].detail).toBe('a');
    expect(rows[1].title).toBe('Ran 1 search');
    expect(rows[2].title).toBe('Read file');
    expect(rows[0].tool.toolCallId).toBe('1');
  });

  it('formats duration copy', () => {
    expect(formatWorkedFor(17000)).toBe('Worked for 17 seconds');
    expect(formatWorkedFor(400)).toBe('Worked for 1 second');
    expect(formatWorkingFor(17000)).toBe('Working for 17s');
  });
});
