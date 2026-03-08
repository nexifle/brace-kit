/**
 * Standalone MCP reconnect utility.
 *
 * Extracted from useMCP so both useMCP (on mount) and useTools (before
 * dispatching a chat request) can call the same logic without duplicating code.
 *
 * A module-level promise is used to deduplicate concurrent calls — if multiple
 * callers trigger a reconnect at the same time, they all wait on the same
 * in-flight promise rather than launching parallel reconnect races.
 */

import { useStore } from '../store/index.ts';

let reconnectPromise: Promise<void> | null = null;

/**
 * Ensure all enabled MCP servers are connected in the background service worker.
 *
 * 1. Ask the SW which server IDs are currently connected (MCP_GET_STATUS).
 * 2. For any enabled server not in that list, send MCP_CONNECT.
 * 3. Update the Zustand store to reflect the new connection state.
 *
 * Safe to call concurrently — duplicate calls resolve against the same promise.
 */
export async function ensureMCPConnected(): Promise<void> {
  if (reconnectPromise) return reconnectPromise;

  const state = useStore.getState();
  const enabledServers = state.mcpServers.filter((s) => s.enabled !== false);
  if (enabledServers.length === 0) return;

  // Ask the background what is actually connected right now
  let connectedIds: string[] = [];
  try {
    const status = await chrome.runtime.sendMessage({ type: 'MCP_GET_STATUS' });
    connectedIds = status?.connectedIds || [];
  } catch {
    // SW restarted and not yet responding — treat all as disconnected
  }

  const connectedSet = new Set(connectedIds);
  const serversToReconnect = enabledServers.filter((s) => !connectedSet.has(s.id));

  if (serversToReconnect.length === 0) {
    // Sync any store entries that are still marked as disconnected
    for (const server of enabledServers) {
      if (!server.connected) {
        useStore.getState().updateMCPServer(server.id, { connected: true });
      }
    }
    return;
  }

  reconnectPromise = (async () => {
    // Mark stale servers as disconnected in UI before reconnecting
    for (const server of serversToReconnect) {
      useStore.getState().updateMCPServer(server.id, { connected: false });
    }

    useStore.getState().setMCPReconnecting(true);
    try {
      await Promise.all(
        serversToReconnect.map(async (server) => {
          try {
            const result = await chrome.runtime.sendMessage({
              type: 'MCP_CONNECT',
              config: server,
            });
            useStore.getState().updateMCPServer(server.id, {
              connected: !!result?.success,
              toolCount: result?.success ? (result.tools?.length ?? 0) : 0,
            });
          } catch {
            // Server stays disconnected — user can retry manually
          }
        })
      );
    } finally {
      useStore.getState().setMCPReconnecting(false);
      useStore.getState().saveToStorage();
      reconnectPromise = null;
    }
  })();

  return reconnectPromise;
}
