import { test, expect, describe } from 'bun:test';
import {
  getAllTools,
  getBuiltinTools,
  isBuiltinTool,
  BUILTIN_TOOLS,
} from '../../src/services/toolRegistry.ts';
import type { MCPTool } from '../../src/types/index.ts';

describe('Tool Registry Service', () => {
  describe('BUILTIN_TOOLS constant', () => {
    test('has GOOGLE_SEARCH tool with correct structure', () => {
      expect(BUILTIN_TOOLS.GOOGLE_SEARCH.name).toBe('google_search');
      expect(BUILTIN_TOOLS.GOOGLE_SEARCH.description).toBeDefined();
      expect(BUILTIN_TOOLS.GOOGLE_SEARCH.inputSchema).toBeDefined();
    });

    test('has CONTINUE_MESSAGE tool with correct structure', () => {
      expect(BUILTIN_TOOLS.CONTINUE_MESSAGE.name).toBe('continue_message');
      expect(BUILTIN_TOOLS.CONTINUE_MESSAGE.description).toBeDefined();
      expect(BUILTIN_TOOLS.CONTINUE_MESSAGE.inputSchema).toBeDefined();
    });
  });

  describe('getAllTools', () => {
    const mockMcpTools: MCPTool[] = [
      { name: 'mcp_tool_1', description: 'Test MCP Tool 1', _serverId: 'server1' },
      { name: 'mcp_tool_2', description: 'Test MCP Tool 2', _serverId: 'server2' },
    ];

    test('returns only MCP tools when no built-in tools are enabled', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: false,
        googleSearchApiKey: 'test-key',
        supportsFunctionCalling: false,
        isGemini: true,
      });

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('mcp_tool_1');
      expect(tools[1].name).toBe('mcp_tool_2');
    });

    test('includes google_search for non-Gemini when enabled and has API key', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: true,
        googleSearchApiKey: 'test-key',
        supportsFunctionCalling: false,
        isGemini: false,
      });

      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('google_search');
    });

    test('does not include google_search for Gemini even when enabled', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: true,
        googleSearchApiKey: 'test-key',
        supportsFunctionCalling: false,
        isGemini: true,
      });

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === 'google_search')).toBeUndefined();
    });

    test('does not include google_search when API key is missing', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: true,
        googleSearchApiKey: null,
        supportsFunctionCalling: false,
        isGemini: false,
      });

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === 'google_search')).toBeUndefined();
    });

    test('includes continue_message when supportsFunctionCalling is true', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: false,
        googleSearchApiKey: 'test-key',
        supportsFunctionCalling: true,
        isGemini: true,
      });

      expect(tools).toHaveLength(3);
      expect(tools[tools.length - 1].name).toBe('continue_message');
    });

    test('does not include continue_message when supportsFunctionCalling is false', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: false,
        googleSearchApiKey: 'test-key',
        supportsFunctionCalling: false,
        isGemini: true,
      });

      expect(tools).toHaveLength(2);
      expect(tools.find((t) => t.name === 'continue_message')).toBeUndefined();
    });

    test('includes both built-in tools when all conditions are met', () => {
      const tools = getAllTools({
        mcpTools: mockMcpTools,
        enableGoogleSearchTool: true,
        googleSearchApiKey: 'test-key',
        supportsFunctionCalling: true,
        isGemini: false,
      });

      expect(tools).toHaveLength(4);
      expect(tools[0].name).toBe('google_search');
      expect(tools[tools.length - 1].name).toBe('continue_message');
    });

    test('returns empty array when no tools', () => {
      const tools = getAllTools({
        mcpTools: [],
        enableGoogleSearchTool: false,
        googleSearchApiKey: null,
        supportsFunctionCalling: false,
        isGemini: true,
      });

      expect(tools).toEqual([]);
    });
  });

  describe('getBuiltinTools', () => {
    test('returns empty array when no options', () => {
      const tools = getBuiltinTools({
        includeGoogleSearch: false,
        includeContinueMessage: false,
      });
      expect(tools).toEqual([]);
    });

    test('returns google_search only', () => {
      const tools = getBuiltinTools({
        includeGoogleSearch: true,
        includeContinueMessage: false,
      });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('google_search');
    });

    test('returns continue_message only', () => {
      const tools = getBuiltinTools({
        includeGoogleSearch: false,
        includeContinueMessage: true,
      });
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('continue_message');
    });

    test('returns both tools', () => {
      const tools = getBuiltinTools({
        includeGoogleSearch: true,
        includeContinueMessage: true,
      });
      expect(tools).toHaveLength(2);
    });
  });

  describe('isBuiltinTool', () => {
    test('returns true for google_search', () => {
      expect(isBuiltinTool('google_search')).toBe(true);
    });

    test('returns true for continue_message', () => {
      expect(isBuiltinTool('continue_message')).toBe(true);
    });

    test('returns false for other tools', () => {
      expect(isBuiltinTool('some_other_tool')).toBe(false);
    });

    test('returns false for empty string', () => {
      expect(isBuiltinTool('')).toBe(false);
    });
  });
});
