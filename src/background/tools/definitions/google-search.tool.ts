/**
 * Google Search Tool Definition
 * Uses Gemini's grounding feature to search the web
 */

import type { MCPTool } from '../../../types';

export const GOOGLE_SEARCH_TOOL: MCPTool = {
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
};
