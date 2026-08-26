/**
 * Client-side Tool Registry Service
 * Used by hooks to get tool definitions for API requests
 */

import type { MCPTool } from '../types/index.ts';
import { ASK_TOOL } from '../types/ask.ts';
import { WEB_FETCH_TOOL } from '../background/tools/definitions/web-fetch.tool.ts';

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
        query: { type: 'string', description: 'The search query to look up on the web' },
      },
      required: ['query'],
    },
  },
  WEB_SEARCH: {
    name: 'web_search',
    description:
      'Search the web for up-to-date information. Returns a synthesized answer with source citations. Use for current events, recent docs, or any time-dependent facts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query to perform.' },
        allowed_domains: { type: 'array', items: { type: 'string' }, description: 'Optional list of domains to restrict your search.' },
      },
      required: ['query'],
    },
  },
  WEB_FETCH: WEB_FETCH_TOOL,
  ASK: ASK_TOOL,
  CONTINUE_MESSAGE: {
    name: 'continue_message',
    description:
      'Use this tool to continue your response in a new message chunk. This is useful when you have more to say but want to break it up, or if you want to perform a chain of thought before the next response.',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Brief reason why you are continuing' } },
      required: ['reason'],
    },
  },
} as const;

export interface GetAllToolsOptions {
  mcpTools: MCPTool[];
  enableGoogleSearchTool: boolean;
  googleSearchApiKey: string | null;
  supportsFunctionCalling: boolean;
  isGemini: boolean;
  providerId?: string;
}

export function getAllTools(options: GetAllToolsOptions): MCPTool[] {
  const tools: MCPTool[] = [...options.mcpTools];

  if (!options.isGemini && options.enableGoogleSearchTool && options.googleSearchApiKey) {
    tools.unshift(BUILTIN_TOOLS.GOOGLE_SEARCH as MCPTool);
  }
  if (options.providerId === 'grok' && options.supportsFunctionCalling) {
    tools.unshift(BUILTIN_TOOLS.WEB_SEARCH as MCPTool);
  }
  if (options.supportsFunctionCalling) {
    tools.push(BUILTIN_TOOLS.ASK as MCPTool);
    tools.push(BUILTIN_TOOLS.WEB_FETCH as MCPTool);
    tools.push(BUILTIN_TOOLS.CONTINUE_MESSAGE as MCPTool);
  }

  return tools;
}

/**
 * Legacy client-only assembly helper. Prefer getAllTools for new request paths.
 */
export function getBuiltinTools(options: {
  includeGoogleSearch: boolean;
  includeContinueMessage: boolean;
  includeAsk?: boolean;
  includeWebFetch?: boolean;
}): MCPTool[] {
  const tools: MCPTool[] = [];
  if (options.includeGoogleSearch) tools.push(BUILTIN_TOOLS.GOOGLE_SEARCH as MCPTool);
  if (options.includeAsk) tools.push(BUILTIN_TOOLS.ASK as MCPTool);
  if (options.includeWebFetch ?? options.includeContinueMessage) tools.push(BUILTIN_TOOLS.WEB_FETCH as MCPTool);
  if (options.includeContinueMessage) tools.push(BUILTIN_TOOLS.CONTINUE_MESSAGE as MCPTool);
  return tools;
}

/** Background-executable built-ins only; client-side ask is deliberately excluded. */
export function isBuiltinTool(name: string): boolean {
  return name === 'google_search' || name === 'web_search' || name === 'web_fetch' || name === 'continue_message';
}
