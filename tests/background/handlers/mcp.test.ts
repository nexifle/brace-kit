import { test, expect, describe, mock } from 'bun:test';

// Mock chrome API
const mockChrome = {
  runtime: {
    onMessage: {
      addListener: mock(() => {}),
    },
  },
  storage: {
    local: {
      get: mock(async () => ({ mcpServers: [] })),
    },
  },
};

// @ts-ignore
globalThis.chrome = mockChrome;

describe('MCP Handler', () => {
  describe('handleMCPDisconnect', () => {
    test('should call sendResponse with success', async () => {
      const { handleMCPDisconnect } = await import('../../../src/background/handlers/mcp.handler.js');
      const mockSendResponse = mock(() => {});

      handleMCPDisconnect({ serverId: 'test-server' }, mockSendResponse);
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('handleMCPListTools', () => {
    test('should call sendResponse with tools array', async () => {
      const { handleMCPListTools } = await import('../../../src/background/handlers/mcp.handler.js');
      const mockSendResponse = mock(() => {});

      handleMCPListTools(mockSendResponse);
      expect(mockSendResponse).toHaveBeenCalled();

      const call = mockSendResponse.mock.calls[0];
      expect(call[0]).toHaveProperty('tools');
    });
  });

  describe('restoreMCPServers', () => {
    test('should restore MCP servers from storage', async () => {
      const { restoreMCPServers } = await import('../../../src/background/handlers/mcp.handler.js');

      // Should not throw
      await expect(restoreMCPServers()).resolves.toBeUndefined();
    });
  });

  describe('registerMCPHandlers', () => {
    test('should register handlers on message listener', async () => {
      const { registerMCPHandlers } = await import('../../../src/background/handlers/mcp.handler.js');
      const mockListener = { addListener: mock(() => {}) };

      registerMCPHandlers(mockListener as unknown as typeof chrome.runtime.onMessage);
      expect(mockListener.addListener).toHaveBeenCalled();
    });
  });

  describe('mcpManager export', () => {
    test('should export mcpManager for testing', async () => {
      const { mcpManager } = await import('../../../src/background/handlers/mcp.handler.js');

      expect(mcpManager).toBeDefined();
      expect(mcpManager.clients).toBeDefined();
    });
  });
});
