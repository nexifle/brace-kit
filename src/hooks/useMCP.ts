import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store/index.ts';
import type { MCPServer } from '../types/index.ts';
import { ensureMCPConnected } from '../utils/mcpReconnect.ts';

// Module-level singleton: prevents duplicate sync when multiple components mount useMCP
let syncPromise: Promise<void> | null = null;

// Service workers are killed after ~30s of inactivity in Chrome MV3
const SW_IDLE_THRESHOLD_MS = 30_000;

export function useMCP() {
  const store = useStore();
  const hasSyncedRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);

  /**
   * Sync MCP connection status with the background service worker.
   * Runs once when the sidebar opens to detect stale `connected: true` state
   * caused by service worker restarts, then reconnects those servers.
   */
  const syncAndReconnect = useCallback(async () => {
    await ensureMCPConnected();
  }, []);

  // Run once per sidebar session using a module-level promise to deduplicate
  // across multiple components that may mount useMCP (e.g. InputArea + MCPServersSettings)
  useEffect(() => {
    if (hasSyncedRef.current) return;
    hasSyncedRef.current = true;

    if (!syncPromise) {
      syncPromise = syncAndReconnect().then(
        // Allow re-sync after 60s in case the user keeps the sidebar open
        () => { setTimeout(() => { syncPromise = null; }, 60_000); },
        // Reset immediately on failure so the next mount (or Retry) can try again
        () => { syncPromise = null; }
      );
    }
  }, [syncAndReconnect]);

  // Reconnect MCP servers when the user returns after a long absence.
  // Chrome MV3 service workers are killed after ~30s of inactivity, so any
  // previously connected MCP servers are lost when the SW restarts.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        return;
      }

      // Document became visible — check if SW could have been killed
      const hiddenMs = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;

      if (hiddenMs < SW_IDLE_THRESHOLD_MS) return;

      // Reset guards so the sync runs again
      syncPromise = null;
      hasSyncedRef.current = false;

      syncPromise = syncAndReconnect().then(
        () => { setTimeout(() => { syncPromise = null; }, 60_000); },
        () => { syncPromise = null; }
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncAndReconnect]);

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

  const updateMCPServer = useCallback(async (
    id: string,
    updates: Partial<MCPServer>
  ): Promise<{ success: boolean; error?: string; toolCount?: number }> => {
    const existing = store.mcpServers.find(s => s.id === id);
    if (!existing) return { success: false, error: 'Server not found' };

    const updated = { ...existing, ...updates };
    store.updateMCPServer(id, updates);

    // If critical connection info changed, reconnect
    if (updates.url !== undefined || updates.headers !== undefined) {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'MCP_CONNECT',
          config: updated,
        });

        if (result.success) {
          store.updateMCPServer(id, {
            connected: true,
            toolCount: result.tools?.length || 0,
          });
          store.saveToStorage();
          return { success: true, toolCount: result.tools?.length || 0 };
        } else {
          store.updateMCPServer(id, { connected: false, toolCount: 0 });
          store.saveToStorage();
          return { success: false, error: result.error || 'Connection failed after update' };
        }
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    store.saveToStorage();
    return { success: true };
  }, [store]);

  const toggleMCPServer = useCallback((id: string, enabled: boolean) => {
    store.toggleMCPServer(id, enabled);
    store.saveToStorage();
  }, [store]);

  const toggleMCPTool = useCallback((serverId: string, toolName: string, enabled: boolean) => {
    store.toggleMCPTool(serverId, toolName, enabled);
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
    toggleMCPTool,
    updateMCPServer,
    listTools,
    callTool,
    syncAndReconnect,
  };
}
