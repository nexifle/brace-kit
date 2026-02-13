// MCP (Model Context Protocol) client for Chrome extension
// Supports SSE transport for connecting to MCP servers

export class MCPClient {
  constructor(serverUrl) {
    this.serverUrl = serverUrl;
    this.tools = [];
    this.connected = false;
    this.sessionId = null;
  }

  async connect() {
    try {
      // Initialize session via POST
      const initRes = await fetch(`${this.serverUrl}/initialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'ai-sidebar', version: '1.0.0' },
          },
        }),
      });

      if (initRes.ok) {
        const data = await initRes.json();
        this.sessionId = data.result?.sessionId || null;
        this.connected = true;
        await this.listTools();
        return { success: true, tools: this.tools };
      }

      // Fallback: try SSE-based connection
      return await this.connectSSE();
    } catch (e) {
      // Try SSE transport as fallback
      try {
        return await this.connectSSE();
      } catch (e2) {
        return { success: false, error: e2.message };
      }
    }
  }

  async connectSSE() {
    return new Promise((resolve, reject) => {
      const url = `${this.serverUrl}/sse`;
      const eventSource = new EventSource(url);

      eventSource.addEventListener('endpoint', (event) => {
        this.postEndpoint = event.data;
        if (this.postEndpoint.startsWith('/')) {
          const base = new URL(this.serverUrl);
          this.postEndpoint = `${base.origin}${this.postEndpoint}`;
        }
        this.eventSource = eventSource;
        this.connected = true;
        this.listTools().then(() => {
          resolve({ success: true, tools: this.tools });
        });
      });

      eventSource.onerror = () => {
        eventSource.close();
        reject(new Error('Failed to connect via SSE'));
      };

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!this.connected) {
          eventSource.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  async sendRequest(method, params = {}) {
    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    // Use SSE post endpoint if available
    const url = this.postEndpoint || `${this.serverUrl}/${method.replace('/', '.')}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.sessionId ? { 'X-Session-Id': this.sessionId } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }
    return data.result;
  }

  async listTools() {
    try {
      const result = await this.sendRequest('tools/list');
      this.tools = result.tools || [];
      return this.tools;
    } catch (e) {
      console.warn('Failed to list MCP tools:', e);
      this.tools = [];
      return [];
    }
  }

  async callTool(name, args = {}) {
    try {
      const result = await this.sendRequest('tools/call', { name, arguments: args });
      return result;
    } catch (e) {
      return { content: [{ type: 'text', text: `Error calling tool: ${e.message}` }] };
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    this.connected = false;
    this.tools = [];
    this.sessionId = null;
  }
}

// Manage multiple MCP servers
export class MCPManager {
  constructor() {
    this.clients = new Map();
  }

  async addServer(config) {
    const client = new MCPClient(config.url);
    const result = await client.connect();
    if (result.success) {
      this.clients.set(config.id, { client, config, tools: result.tools });
    }
    return result;
  }

  removeServer(id) {
    const entry = this.clients.get(id);
    if (entry) {
      entry.client.disconnect();
      this.clients.delete(id);
    }
  }

  getAllTools() {
    const tools = [];
    for (const [serverId, entry] of this.clients) {
      for (const tool of entry.tools) {
        tools.push({
          ...tool,
          _serverId: serverId,
          _serverName: entry.config.name,
        });
      }
    }
    return tools;
  }

  async callTool(name) {
    // Find which server has this tool
    for (const [, entry] of this.clients) {
      const tool = entry.tools.find((t) => t.name === name);
      if (tool) {
        return { client: entry.client, tool };
      }
    }
    return null;
  }

  disconnectAll() {
    for (const [, entry] of this.clients) {
      entry.client.disconnect();
    }
    this.clients.clear();
  }
}
