/**
 * MCP Handler - Handles MCP server lifecycle and tool calls
 * @module background/handlers/mcp
 */

import { MCPManager } from '../../services/mcp';
import { isBuiltinTool, executeTool, type ToolExecutionContext } from '../tools/index';

type SendResponse = (response?: unknown) => void;

interface MCPConnectMessage {
  type: 'MCP_CONNECT';
  config: {
    id: string;
    name: string;
    url: string;
    headers?: Record<string, string>;
    enabled?: boolean;
  };
}

interface MCPDisconnectMessage {
  type: 'MCP_DISCONNECT';
  serverId: string;
}

interface MCPToolCallMessage {
  type: 'MCP_CALL_TOOL';
  name: string;
  arguments: Record<string, unknown>;
}

interface MCPResponse {
  success?: boolean;
  error?: string;
  tools?: unknown[];
}

interface ToolCallResponse {
  content?: Array<{ text: string }>;
  error?: string;
}

const mcpManager = new MCPManager();

/**
 * Handle MCP server connect
 * @param message - MCP connect message
 * @param sendResponse - Response callback
 */
export async function handleMCPConnect(
  message: MCPConnectMessage,
  sendResponse: SendResponse
): Promise<void> {
  console.log('[MCPHandler] MCP_CONNECT received:', message.config);
  try {
    const result = await mcpManager.addServer(message.config);
    sendResponse(result as MCPResponse);
  } catch (e) {
    sendResponse({ success: false, error: (e as Error).message } as MCPResponse);
  }
}

/**
 * Handle MCP server disconnect
 * @param message - MCP disconnect message
 * @param sendResponse - Response callback
 */
export function handleMCPDisconnect(
  message: MCPDisconnectMessage,
  sendResponse: SendResponse
): void {
  mcpManager.removeServer(message.serverId);
  sendResponse({ success: true });
}

/**
 * Handle MCP list tools
 * @param sendResponse - Response callback
 */
export function handleMCPListTools(sendResponse: SendResponse): void {
  try {
    const allTools = mcpManager.getAllTools();
    console.log(
      '[MCPHandler] MCP_LIST_TOOLS - clients:',
      mcpManager.getClientCount(),
      'tools:',
      allTools
    );
    sendResponse({ tools: allTools } as MCPResponse);
  } catch (e) {
    sendResponse({ tools: [], error: (e as Error).message } as MCPResponse);
  }
}

/**
 * Handle MCP tool call
 * @param message - MCP tool call message
 * @param sendResponse - Response callback
 */
export async function handleMCPToolCall(
  message: MCPToolCallMessage,
  sendResponse: SendResponse
): Promise<void> {
  try {
    const { name, arguments: args } = message;

    // Check for built-in tools first
    if (isBuiltinTool(name)) {
      const { googleSearchApiKey } = await chrome.storage.local.get('googleSearchApiKey');
      const context: ToolExecutionContext = {
        googleSearchApiKey: googleSearchApiKey as string | undefined,
      };
      const result = await executeTool(name, args, context);
      sendResponse(result as ToolCallResponse);
      return;
    }

    // MCP tool
    const found = await mcpManager.callTool(name);
    if (!found) {
      sendResponse({ error: `Tool "${name}" not found` } as ToolCallResponse);
      return;
    }
    const result = await found.client.callTool(name, args);
    sendResponse(result as ToolCallResponse);
  } catch (e) {
    sendResponse({ error: (e as Error).message } as ToolCallResponse);
  }
}

/**
 * Restore MCP servers on startup
 */
export async function restoreMCPServers(): Promise<void> {
  const { mcpServers } = await chrome.storage.local.get('mcpServers');
  if (mcpServers && Array.isArray(mcpServers) && mcpServers.length > 0) {
    console.log('[MCPHandler] Restoring MCP servers:', mcpServers.length);
    for (const server of mcpServers) {
      if (server.enabled !== false) {
        try {
          await mcpManager.addServer(server);
          console.log('[MCPHandler] Restored:', server.name);
        } catch (e) {
          console.log('[MCPHandler] Failed to restore:', server.name, e);
        }
      }
    }
  }
}

type ChromeMessage =
  | MCPConnectMessage
  | MCPDisconnectMessage
  | { type: 'MCP_LIST_TOOLS' }
  | MCPToolCallMessage;

/**
 * Register MCP handlers on message listener
 * @param onMessage - Chrome message listener
 */
export function registerMCPHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (message: ChromeMessage, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
      switch (message.type) {
        case 'MCP_CONNECT':
          handleMCPConnect(message as MCPConnectMessage, sendResponse);
          return true;
        case 'MCP_DISCONNECT':
          handleMCPDisconnect(message as MCPDisconnectMessage, sendResponse);
          return false;
        case 'MCP_LIST_TOOLS':
          handleMCPListTools(sendResponse);
          return false;
        case 'MCP_CALL_TOOL':
          handleMCPToolCall(message as MCPToolCallMessage, sendResponse);
          return true;
      }
      return false;
    }
  );
}

// Export mcpManager for testing
export { mcpManager };
