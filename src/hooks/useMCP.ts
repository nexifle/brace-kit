import { useCallback } from 'react';
import { useStore } from '../store/index.ts';
import type { MCPServer } from '../types/index.ts';

export function useMCP() {
  const store = useStore();

  const addMCPServer = useCallback(async (
    name: string,
    url: string,
    headersText: string
  ): Promise<{ success: boolean; error?: string; toolCount?: number }> => {
    // Parse headers from textarea (one per line, Key: Value)
    const headers: Record<string, string> = {};
    const headerLines = headersText.trim().split('\n');
    for (const line of headerLines) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) headers[key] = val;
      }
    }

    const config: MCPServer = {
      id: `mcp_${Date.now()}`,
      name,
      url,
      headers,
      enabled: true,
      connected: false,
      toolCount: 0,
    };

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MCP_CONNECT',
        config,
      });

      if (result.success) {
        config.connected = true;
        config.toolCount = result.tools?.length || 0;
        store.addMCPServer(config);
        store.saveToStorage();
        return { success: true, toolCount: config.toolCount };
      } else {
        return { success: false, error: result.error || 'Unknown error' };
      }
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }, [store]);

  const removeMCPServer = useCallback((id: string) => {
    chrome.runtime.sendMessage({ type: 'MCP_DISCONNECT', serverId: id });
    store.removeMCPServer(id);
    store.saveToStorage();
  }, [store]);

  const toggleMCPServer = useCallback((id: string, enabled: boolean) => {
    store.toggleMCPServer(id, enabled);
    store.saveToStorage();
  }, [store]);

  const listTools = useCallback(async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
      return result?.tools || [];
    } catch {
      return [];
    }
  }, []);

  const callTool = useCallback(async (name: string, args: Record<string, unknown>) => {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MCP_CALL_TOOL',
        name,
        arguments: args,
      });
      return result;
    } catch (e) {
      throw e;
    }
  }, []);

  return {
    mcpServers: store.mcpServers,
    addMCPServer,
    removeMCPServer,
    toggleMCPServer,
    listTools,
    callTool,
  };
}
