/**
 * Continue Message Tool Definition
 * Allows the assistant to continue its response in a new message chunk
 */

import type { MCPTool } from '../../../types';

export const CONTINUE_MESSAGE_TOOL: MCPTool = {
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
};
