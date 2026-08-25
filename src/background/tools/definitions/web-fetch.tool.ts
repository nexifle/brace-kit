import type { MCPTool } from '../../../types';

export const WEB_FETCH_TOOL: MCPTool = {
  name: 'web_fetch',
  description:
    'Fetch the content of a specific URL and return it as markdown.\n\n' +
    'IMPORTANT: web_fetch WILL FAIL for authenticated or private URLs (e.g. Google Docs, Confluence, Jira, GitHub private repos). Use specialized MCP tools for those instead.\n\n' +
    'Usage notes:\n' +
    '  - HTTP URLs will be automatically upgraded to HTTPS\n' +
    '  - Long pages will be truncated\n' +
    '  - Binary content (PDF, images, video) is not returned — attach files instead or pick a text/HTML URL',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The URL to fetch content from.',
      },
    },
    required: ['url'],
  },
};
