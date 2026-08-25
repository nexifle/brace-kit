import { test, expect, describe } from 'bun:test';
import {
  getToolDefinitions,
  isBuiltinTool,
  executeTool,
  getBuiltinToolNames,
  getToolDefinition,
  GOOGLE_SEARCH_TOOL,
  CONTINUE_MESSAGE_TOOL,
  GROK_WEB_SEARCH_TOOL,
  WEB_FETCH_TOOL,
} from '../../src/background/tools/index.js';

describe('Tool Registry', () => {
  describe('getToolDefinitions', () => {
    test('returns empty array when no options provided', () => {
      const tools = getToolDefinitions();
      expect(tools).toEqual([]);
    });

    test('returns only google_search when includeGoogleSearch is true', () => {
      const tools = getToolDefinitions({ includeGoogleSearch: true });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('google_search');
    });

    test('returns only continue_message when includeContinueMessage is true', () => {
      const tools = getToolDefinitions({ includeContinueMessage: true });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('continue_message');
    });

    test('returns both tools when both options are true', () => {
      const tools = getToolDefinitions({
        includeGoogleSearch: true,
        includeContinueMessage: true,
      });
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('google_search');
      expect(tools[1].name).toBe('continue_message');
    });

    test('returns only web_search when includeGrokWebSearch is true', () => {
      const tools = getToolDefinitions({ includeGrokWebSearch: true });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('web_search');
    });

    test('returns all three tools when all options are true', () => {
      const tools = getToolDefinitions({
        includeGoogleSearch: true,
        includeContinueMessage: true,
        includeGrokWebSearch: true,
      });
      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('google_search');
      expect(tools[1].name).toBe('continue_message');
      expect(tools[2].name).toBe('web_search');
    });

    test('returns web_fetch when includeWebFetch is true', () => {
      const tools = getToolDefinitions({ includeWebFetch: true });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('web_fetch');
    });
  });

  describe('isBuiltinTool', () => {
    test('returns true for google_search', () => {
      expect(isBuiltinTool('google_search')).toBe(true);
    });

    test('returns true for continue_message', () => {
      expect(isBuiltinTool('continue_message')).toBe(true);
    });

    test('returns true for web_search', () => {
      expect(isBuiltinTool('web_search')).toBe(true);
    });

    test('returns true for web_fetch', () => {
      expect(isBuiltinTool('web_fetch')).toBe(true);
    });

    test('returns false for unknown tool', () => {
      expect(isBuiltinTool('some_mcp_tool')).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(isBuiltinTool('')).toBe(false);
    });
  });

  describe('executeTool', () => {
    test('throws for unknown tool', async () => {
      await expect(executeTool('unknown', {})).rejects.toThrow('Unknown tool: unknown');
    });

    test('executes continue_message successfully', async () => {
      const result = await executeTool('continue_message', { reason: 'test' }, {});
      expect(result).toHaveProperty('content');
      expect(result.content).toBeInstanceOf(Array);
      expect(result.content[0]).toHaveProperty('text');
      expect(result.content[0].text).toContain('Chain message initiated');
    });

    test('executes google_search with missing query', async () => {
      const result = await executeTool('google_search', {}, { googleSearchApiKey: 'test-key' });
      expect(result.content[0].text).toContain('query parameter is required');
    });

    test('executes google_search with missing API key', async () => {
      const result = await executeTool('google_search', { query: 'test' }, { googleSearchApiKey: null });
      expect(result.content[0].text).toContain('API key not configured');
    });

    test('executes web_fetch with missing url', async () => {
      const result = await executeTool('web_fetch', {}, {});
      expect(result.content[0].text).toContain('url parameter is required');
    });

    test('executes web_search with missing query', async () => {
      const result = await executeTool('web_search', {}, { grokAccessToken: 'token', grokModel: 'grok-4.5' });
      expect(result.content[0].text).toContain('query parameter is required');
    });
  });

  describe('getBuiltinToolNames', () => {
    test('returns all built-in tool names', () => {
      const names = getBuiltinToolNames();
      expect(names).toContain('google_search');
      expect(names).toContain('continue_message');
      expect(names).toContain('web_search');
      expect(names).toContain('web_fetch');
      expect(names).toHaveLength(4);
    });
  });

  describe('getToolDefinition', () => {
    test('returns google_search definition', () => {
      const def = getToolDefinition('google_search');
      expect(def).toBeDefined();
      expect(def?.name).toBe('google_search');
      expect(def?.description).toBeDefined();
      expect(def?.inputSchema).toBeDefined();
    });

    test('returns continue_message definition', () => {
      const def = getToolDefinition('continue_message');
      expect(def).toBeDefined();
      expect(def?.name).toBe('continue_message');
      expect(def?.description).toBeDefined();
      expect(def?.inputSchema).toBeDefined();
    });

    test('returns web_fetch definition', () => {
      const def = getToolDefinition('web_fetch');
      expect(def).toBeDefined();
      expect(def?.name).toBe('web_fetch');
    });

    test('returns web_search definition', () => {
      const def = getToolDefinition('web_search');
      expect(def).toBeDefined();
      expect(def?.name).toBe('web_search');
      expect(def?.description).toBeDefined();
      expect(def?.inputSchema).toBeDefined();
    });

    test('returns undefined for unknown tool', () => {
      const def = getToolDefinition('unknown');
      expect(def).toBeUndefined();
    });
  });

  describe('Tool Definitions Structure', () => {
    test('GOOGLE_SEARCH_TOOL has correct structure', () => {
      expect(GOOGLE_SEARCH_TOOL.name).toBe('google_search');
      expect(GOOGLE_SEARCH_TOOL.description).toBeDefined();
      expect(GOOGLE_SEARCH_TOOL.inputSchema).toEqual({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to look up on the web',
          },
        },
        required: ['query'],
      });
    });

    test('CONTINUE_MESSAGE_TOOL has correct structure', () => {
      expect(CONTINUE_MESSAGE_TOOL.name).toBe('continue_message');
      expect(CONTINUE_MESSAGE_TOOL.description).toBeDefined();
      expect(CONTINUE_MESSAGE_TOOL.inputSchema).toEqual({
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'Brief reason why you are continuing',
          },
        },
        required: ['reason'],
      });
    });

    test('WEB_FETCH_TOOL has correct structure', () => {
      expect(WEB_FETCH_TOOL.name).toBe('web_fetch');
      expect(WEB_FETCH_TOOL.description).toBeDefined();
      expect(WEB_FETCH_TOOL.inputSchema).toEqual({
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from.',
          },
        },
        required: ['url'],
      });
    });

    test('GROK_WEB_SEARCH_TOOL has correct structure', () => {
      expect(GROK_WEB_SEARCH_TOOL.name).toBe('web_search');
      expect(GROK_WEB_SEARCH_TOOL.description).toBeDefined();
      expect(GROK_WEB_SEARCH_TOOL.inputSchema).toEqual({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to perform.',
          },
          allowed_domains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of domains to restrict the search to.',
          },
        },
        required: ['query'],
      });
    });
  });
});
