import { test, expect, describe } from 'bun:test';
import {
  getToolDefinitions,
  isBuiltinTool,
  executeTool,
  getBuiltinToolNames,
  getToolDefinition,
  GOOGLE_SEARCH_TOOL,
  CONTINUE_MESSAGE_TOOL,
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
  });

  describe('isBuiltinTool', () => {
    test('returns true for google_search', () => {
      expect(isBuiltinTool('google_search')).toBe(true);
    });

    test('returns true for continue_message', () => {
      expect(isBuiltinTool('continue_message')).toBe(true);
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
  });

  describe('getBuiltinToolNames', () => {
    test('returns all built-in tool names', () => {
      const names = getBuiltinToolNames();
      expect(names).toContain('google_search');
      expect(names).toContain('continue_message');
      expect(names).toHaveLength(2);
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
  });
});
