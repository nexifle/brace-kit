import type { MCPTool } from './index.ts';

export type AskField =
  | 'canvas'
  | 'slide_count'
  | 'audience'
  | 'topic'
  | 'style'
  | 'brand'
  | 'other';

export interface AskQuestion {
  id: string;
  text: string;
  options?: string[];
  multiple?: boolean;
  freeText?: boolean;
  field?: AskField;
}

export interface AskPayload {
  questions: AskQuestion[];
}

export interface PendingAsk {
  id: string;
  toolCallId: string;
  payload: AskPayload;
  createdAt: number;
}

export const ASK_TOOL: MCPTool = {
  name: 'ask',
  description:
    'Ask the user one or more questions and wait for their answers. Use when clarification is needed. Each question may offer options (provide "options"); set "multiple": true to let the user pick several options, and "freeText": true to also let the user type their own answer. User responses are the tool result. Suspends the conversation until answered.',
  inputSchema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'One or more questions to ask at once.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            question: { type: 'string', description: 'The question text.' },
            options: { type: 'array', items: { type: 'string' } },
            multiple: { type: 'boolean' },
            freeText: { type: 'boolean' },
            field: {
              type: 'string',
              enum: ['canvas', 'slide_count', 'audience', 'topic', 'style', 'brand', 'other'],
            },
          },
          required: ['question'],
        },
      },
      question: { type: 'string', description: 'Legacy single-question form.' },
      options: { type: 'array', items: { type: 'string' } },
      multiple: { type: 'boolean' },
      freeText: { type: 'boolean' },
      field: {
        type: 'string',
        enum: ['canvas', 'slide_count', 'audience', 'topic', 'style', 'brand', 'other'],
      },
    },
  },
};
