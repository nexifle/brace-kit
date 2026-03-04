/**
 * MCP Handler - Handles MCP server lifecycle and tool calls
 * @module background/handlers/mcp
 */

import { MCPManager } from '../../services/mcp';
import { isBuiltinTool, executeTool, type ToolExecutionContext } from '../tools/index';
import { decryptApiKey } from '../../utils/keyEncryption.ts';
import { MCP_DISCONNECT_PREFIX } from '../../types/index.ts';

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
 * Handle MCP get status — pings each connected server to verify liveness
 * @param sendResponse - Response callback
 */
export async function handleMCPGetStatus(sendResponse: SendResponse): Promise<void> {
  try {
    const connectedIds = await mcpManager.getConnectedServerIds();
    sendResponse({ connectedIds });
  } catch (e) {
    sendResponse({ connectedIds: [], error: (e as Error).message });
  }
}

/**
 * Handle MCP list tools
 * @param sendResponse - Response callback
 */
export function handleMCPListTools(sendResponse: SendResponse): void {
  try {
    const allTools = mcpManager.getAllTools();
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
      // Decrypt API key before use
      const decryptedKey = await decryptApiKey(googleSearchApiKey as string | undefined);
      const context: ToolExecutionContext = {
        googleSearchApiKey: decryptedKey,
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

    // Enforce per-tool disable: check against persisted disabledTools in storage
    const { mcpServers } = await chrome.storage.local.get('mcpServers');
    const ownerServer = (mcpServers as { id: string; disabledTools?: string[] }[] | undefined)
      ?.find((s) => s.id === found.serverId);
    if (ownerServer?.disabledTools?.includes(name)) {
      sendResponse({ error: `Tool "${name}" is disabled` } as ToolCallResponse);
      return;
    }

    // Verify the server is still alive before executing the tool call
    const alive = await found.client.ping();
    if (!alive) {
      sendResponse({ error: `${MCP_DISCONNECT_PREFIX}${found.serverName}` } as ToolCallResponse);
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
    for (const server of mcpServers) {
      if (server.enabled !== false) {
        try {
          await mcpManager.addServer(server);
        } catch (e) {
          console.warn('[MCPHandler] Failed to restore:', server.name, e);
        }
      }
    }
  }
}

type ChromeMessage =
  | MCPConnectMessage
  | MCPDisconnectMessage
  | { type: 'MCP_GET_STATUS' }
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
        case 'MCP_GET_STATUS':
          handleMCPGetStatus(sendResponse);
          return true;
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
