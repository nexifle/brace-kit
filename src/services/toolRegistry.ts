/**
 * Client-side Tool Registry Service
 * Used by hooks to get tool definitions for API requests
 */

import type { MCPTool } from '../types/index.ts';

/**
 * Built-in tool definitions for client use
 */
export const BUILTIN_TOOLS = {
  GOOGLE_SEARCH: {
    name: 'google_search',
    description:
      'Search the web using Google. Use this to find current information, news, facts, or any topic that requires up-to-date web search results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query to look up on the web',
        },
      },
      required: ['query'],
    },
  },
  CONTINUE_MESSAGE: {
    name: 'continue_message',
    description:
      'Use this tool to continue your response in a new message chunk. This is useful when you have more to say but want to break it up, or if you want to perform a chain of thought before the next response.',
    inputSchema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason why you are continuing',
        },
      },
      required: ['reason'],
    },
  },
} as const;

/**
 * Options for getting all tools
 */
export interface GetAllToolsOptions {
  mcpTools: MCPTool[];
  enableGoogleSearchTool: boolean;
  googleSearchApiKey: string | null;
  supportsFunctionCalling: boolean;
  isGemini: boolean;
}

/**
 * Get all tools for API request (MCP + built-in)
 * @param options - Configuration options
 * @returns Array of tools to include in API request
 */
export function getAllTools(options: GetAllToolsOptions): MCPTool[] {
  const tools: MCPTool[] = [...options.mcpTools];

  // Inject google_search tool for non-Gemini providers when enabled
  if (!options.isGemini && options.enableGoogleSearchTool && options.googleSearchApiKey) {
    tools.unshift(BUILTIN_TOOLS.GOOGLE_SEARCH as MCPTool);
  }

  // Inject continue_message tool for function-capable models
  if (options.supportsFunctionCalling) {
    tools.push(BUILTIN_TOOLS.CONTINUE_MESSAGE as MCPTool);
  }

  return tools;
}

/**
 * Get only built-in tools based on options
 * @param options - Filter options
 * @returns Array of built-in tools
 */
export function getBuiltinTools(options: {
  includeGoogleSearch: boolean;
  includeContinueMessage: boolean;
}): MCPTool[] {
  const tools: MCPTool[] = [];

  if (options.includeGoogleSearch) {
    tools.push(BUILTIN_TOOLS.GOOGLE_SEARCH as MCPTool);
  }
  if (options.includeContinueMessage) {
    tools.push(BUILTIN_TOOLS.CONTINUE_MESSAGE as MCPTool);
  }

  return tools;
}

/**
 * Check if a tool name is a built-in tool
 * @param name - Tool name to check
 * @returns True if the tool is a built-in tool
 */
export function isBuiltinTool(name: string): boolean {
  return name === 'google_search' || name === 'continue_message';
}
