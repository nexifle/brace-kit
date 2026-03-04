/**
 * Search Bookmarks Tool Definition
 * Allows AI to search through the user's Chrome bookmarks
 */

import type { MCPTool } from '../../../types';

export const SEARCH_BOOKMARKS_TOOL: MCPTool = {
  name: 'search_bookmarks',
  description:
    "Search through the user's Chrome bookmarks to find previously saved websites. Use this when the user asks about websites they've visited or bookmarked, wants to find a URL they've saved, or asks about content from their bookmarks.",
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Keywords or topic to search for in the bookmarks (title and URL)',
      },
    },
    required: ['query'],
  },
};
