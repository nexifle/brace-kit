/**
 * Tool Registry - Single Source of Truth for all built-in tools
 * Provides tool definitions and handlers for the background service worker
 */

import type { MCPTool } from '../../types';
import { GOOGLE_SEARCH_TOOL } from './definitions/google-search.tool';
import { CONTINUE_MESSAGE_TOOL } from './definitions/continue-message.tool';
import { GROK_WEB_SEARCH_TOOL } from './definitions/grok-web-search.tool';
import { handleGoogleSearch } from './handlers/google-search.handler';
import { handleContinueMessage } from './handlers/continue-message.handler';
import { handleGrokWebSearch } from './handlers/grok-web-search.handler';

export interface ToolExecutionContext {
  googleSearchApiKey?: string;
  /** Resolved Grok OAuth bearer (only set for the `grok` provider). */
  grokAccessToken?: string;
  /** Grok model to use for the search call (e.g. "grok-4.5"). */
  grokModel?: string;
  /** Grok API base URL (e.g. "https://cli-chat-proxy.grok.com/v1"). */
  grokApiUrl?: string;
}

export interface ToolResult {
  content: Array<{ text: string }>;
}

export type ToolHandler = (
  args: Record<string, unknown> | undefined,
  context: ToolExecutionContext
) => Promise<ToolResult>;

// Tool definitions map
const TOOL_DEFINITIONS: Record<string, MCPTool> = {
  google_search: GOOGLE_SEARCH_TOOL,
  continue_message: CONTINUE_MESSAGE_TOOL,
  web_search: GROK_WEB_SEARCH_TOOL,
};

// Tool handlers map
const TOOL_HANDLERS: Record<string, ToolHandler> = {
  google_search: handleGoogleSearch as ToolHandler,
  continue_message: handleContinueMessage as ToolHandler,
  web_search: handleGrokWebSearch as ToolHandler,
};

export interface ToolDefinitionOptions {
  includeGoogleSearch?: boolean;
  includeContinueMessage?: boolean;
  includeGrokWebSearch?: boolean;
}

/**
 * Get tool definitions for API requests
 * @param options - Filter options
 * @returns Array of tool definitions
 */
export function getToolDefinitions(options: ToolDefinitionOptions = {}): MCPTool[] {
  const tools: MCPTool[] = [];

  if (options.includeGoogleSearch) {
    tools.push(GOOGLE_SEARCH_TOOL);
  }
  if (options.includeContinueMessage) {
    tools.push(CONTINUE_MESSAGE_TOOL);
  }
  if (options.includeGrokWebSearch) {
    tools.push(GROK_WEB_SEARCH_TOOL);
  }

  return tools;
}

/**
 * Check if a tool name is a built-in tool
 * @param name - Tool name to check
 * @returns True if the tool is a built-in tool
 */
export function isBuiltinTool(name: string): boolean {
  return name in TOOL_HANDLERS;
}

/**
 * Execute a built-in tool
 * @param name - Tool name to execute
 * @param args - Tool arguments
 * @param context - Execution context (e.g., API keys)
 * @returns Tool execution result
 * @throws Error if tool is not found
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown> | undefined,
  context: ToolExecutionContext
): Promise<ToolResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(args, context);
}

/**
 * Get all built-in tool names
 * @returns Array of built-in tool names
 */
export function getBuiltinToolNames(): string[] {
  return Object.keys(TOOL_DEFINITIONS);
}

/**
 * Get a specific tool definition by name
 * @param name - Tool name
 * @returns Tool definition or undefined if not found
 */
export function getToolDefinition(name: string): MCPTool | undefined {
  return TOOL_DEFINITIONS[name];
}

// Re-export tool definitions for direct access
export { GOOGLE_SEARCH_TOOL, CONTINUE_MESSAGE_TOOL, GROK_WEB_SEARCH_TOOL };
