/**
 * Continue Message Tool Handler
 * Returns a response indicating the chain message has been initiated
 */

export interface ToolResult {
  content: Array<{ text: string }>;
}

/**
 * Handle continue_message tool execution
 * @returns Tool result
 */
export async function handleContinueMessage(): Promise<ToolResult> {
  return {
    content: [{ text: 'Chain message initiated. You may continue your response now.' }],
  };
}
