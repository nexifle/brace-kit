// MCP (Model Context Protocol) client for Chrome extension
// Supports Streamable HTTP and SSE transports

export class MCPClient {
  constructor(serverUrl, headers = {}) {
    this.serverUrl = serverUrl.replace(/\/+$/, ''); // trim trailing slashes
    this.customHeaders = headers;
    this.tools = [];
    this.connected = false;
    this.sessionId = null; // Mcp-Session-Id
    this.transport = null; // 'streamable' | 'sse'
    this.postEndpoint = null;
  }

  async connect() {
    // Strategy 1: Streamable HTTP — POST initialize to the base URL
    try {
      const result = await this.connectStreamable();
      if (result.success) return result;
    } catch (e) {
      console.log('Streamable HTTP failed:', e.message);
    }

    // Strategy 2: SSE transport
    try {
      const result = await this.connectSSE();
      if (result.success) return result;
    } catch (e) {
      console.log('SSE transport failed:', e.message);
    }

    return { success: false, error: 'Could not connect to MCP server' };
  }

  async connectStreamable() {
    const res = await fetch(this.serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...this.customHeaders,
      },
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

    if (!res.ok) {
      throw new Error(`Streamable HTTP failed: ${res.status}`);
    }

    // Extract session ID from response header
    const mcpSessionId = res.headers.get('Mcp-Session-Id') || res.headers.get('mcp-session-id');
    if (mcpSessionId) {
      this.sessionId = mcpSessionId;
    }

    // Parse response — could be JSON or SSE
    const data = await this.parseResponse(res);
    if (!data || !data.result) {
      throw new Error('Invalid initialize response');
    }

    this.transport = 'streamable';
    this.postEndpoint = this.serverUrl;
    this.connected = true;

    // Send initialized notification
    try {
      await fetch(this.serverUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }),
      });
    } catch (_) { /* optional notification */ }

    await this.listTools();
    return { success: true, tools: this.tools };
  }

  async connectSSE() {
    const url = `${this.serverUrl}/sse`;

    const res = await fetch(url, {
      headers: {
        'Accept': 'text/event-stream',
        ...this.customHeaders,
      },
    });

    if (!res.ok) {
      throw new Error(`SSE connection failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    // Read until we get the endpoint event
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('SSE connection timeout'));
      }, 10000);

      const processBuffer = () => {
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let eventType = '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:') && eventType === 'endpoint') {
            clearTimeout(timeout);
            resolve(line.slice(5).trim());
          } else if (line === '') {
            eventType = '';
          }
        }
      };

      const read = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            reject(new Error('SSE stream ended'));
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          processBuffer();
          read();
        }).catch(reject);
      };

      read();
    });

    this.postEndpoint = endpoint;
    if (this.postEndpoint.startsWith('/')) {
      const base = new URL(this.serverUrl);
      this.postEndpoint = `${base.origin}${this.postEndpoint}`;
    }

    this.transport = 'sse';
    this.sseReader = reader;
    this.connected = true;
    await this.listTools();
    return { success: true, tools: this.tools };
  }

  // Parse response that may be JSON or SSE stream
  async parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // Parse SSE stream to extract JSON-RPC response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let result = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              result = JSON.parse(line.slice(5).trim());
            } catch (_) { /* not JSON yet */ }
          }
        }

        if (result) break;
      }

      return result;
    }

    // Default: parse as JSON
    return await res.json();
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.customHeaders,
    };
  }

  async sendRequest(method, params = {}) {
    const body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    };

    const url = this.postEndpoint || this.serverUrl;

    const res = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP request failed: ${res.status} ${res.statusText}`);
    }

    // Extract session ID if present (may be set on any response)
    const mcpSessionId = res.headers.get('Mcp-Session-Id') || res.headers.get('mcp-session-id');
    if (mcpSessionId) {
      this.sessionId = mcpSessionId;
    }

    const data = await this.parseResponse(res);
    if (data?.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }
    return data?.result;
  }

  async listTools() {
    try {
      const result = await this.sendRequest('tools/list');
      this.tools = result?.tools || [];
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
    if (this.sseReader) {
      this.sseReader.cancel().catch(() => {});
    }
    this.connected = false;
    this.tools = [];
    this.sessionId = null;
    this.transport = null;
  }
}

// Manage multiple MCP servers
export class MCPManager {
  constructor() {
    this.clients = new Map();
  }

  async addServer(config) {
    console.log('[MCPManager] addServer called:', config.id, config.name);
    const client = new MCPClient(config.url, config.headers || {});
    const result = await client.connect();
    console.log('[MCPManager] connect result:', result.success, 'tools:', result.tools?.length);
    if (result.success) {
      this.clients.set(config.id, { client, config, tools: result.tools });
      console.log('[MCPManager] Server added, total clients:', this.clients.size);
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
    console.log('[MCPManager] getAllTools called, clients:', this.clients.size);
    const tools = [];
    for (const [serverId, entry] of this.clients) {
      console.log(`[MCPManager] Server ${serverId}:`, entry.tools?.length || 0, 'tools');
      for (const tool of entry.tools || []) {
        tools.push({
          ...tool,
          _serverId: serverId,
          _serverName: entry.config.name,
        });
      }
    }
    console.log('[MCPManager] Total tools:', tools.length);
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
