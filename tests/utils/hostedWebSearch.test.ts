import { describe, expect, it } from 'bun:test';
import { parseHostedWebSearchItem } from '../../src/utils/hostedWebSearch.ts';

describe('parseHostedWebSearchItem', () => {
  it('marks in-progress searches as running', () => {
    const parsed = parseHostedWebSearchItem({
      type: 'web_search_call',
      id: 'ws_1',
      status: 'in_progress',
      action: { type: 'search', query: 'honda wiring' },
    });
    expect(parsed.running).toBe(true);
    expect(parsed.content).toContain('Calling...');
    expect(parsed.args.query).toBe('honda wiring');
  });

  it('formats completed searches with sources', () => {
    const parsed = parseHostedWebSearchItem({
      type: 'web_search_call',
      id: 'ws_1',
      status: 'completed',
      action: {
        type: 'search',
        query: 'honda wiring',
        sources: [{ url: 'https://example.com', title: 'Example' }],
      },
    });
    expect(parsed.running).toBe(false);
    expect(parsed.content).toContain('honda wiring');
    expect(parsed.content).toContain('Example - https://example.com');
  });
});
