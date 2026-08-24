/**
 * Grok Web Search Tool Definition
 *
 * Client-side function tool that performs a separate non-streaming Responses-API
 * call with the hosted `web_search` tool enabled. The xAI backend performs the
 * search server-side and returns a synthesized answer + URL citations.
 *
 * Ports the model-facing shape from grok-build's `WebSearchInput` exactly.
 */

import type { MCPTool } from '../../../types';

export const GROK_WEB_SEARCH_TOOL: MCPTool = {
  name: 'web_search',
  description:
    'Search the web for up-to-date information. Returns a synthesized answer with source citations. Use for current events, recent docs, or any time-dependent facts.',
  inputSchema: {
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
  },
};
