/**
 * MCP (Model Context Protocol) client for Chrome extension
 * Supports Streamable HTTP and SSE transports
 */

import type { MCPServer, MCPTool } from '../types';

interface MCPToolInternal extends MCPTool {
  _serverId?: string;
  _serverName?: string;
}

interface ConnectResult {
  success: boolean;
  tools?: MCPTool[];
  error?: string;
}

interface JSONRPCResponse<T = unknown> {
  jsonrpc: string;
  id?: number;
  result?: T;
  error?: {
    message: string;
    code?: number;
  };
}

interface InitializeResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: {
    name: string;
    version: string;
  };
}

interface ToolsListResult {
  tools: MCPTool[];
}

interface ToolCallResult {
  content: Array<{ type: string; text: string }>;
}

interface SSEReader {
  cancel: () => Promise<void>;
}

export class MCPClient {
  private serverUrl: string;
  private customHeaders: Record<string, string>;
  private tools: MCPTool[];
  private connected: boolean;
  private sessionId: string | null;
  private transport: 'streamable' | 'sse' | null;
  private postEndpoint: string | null;
  private sseReader: SSEReader | null;

  constructor(serverUrl: string, headers: Record<string, string> = {}) {
    this.serverUrl = serverUrl.replace(/\/+$/, ''); // trim trailing slashes
    this.customHeaders = headers;
    this.tools = [];
    this.connected = false;
    this.sessionId = null; // Mcp-Session-Id
    this.transport = null;
    this.postEndpoint = null;
    this.sseReader = null;
  }

  async connect(): Promise<ConnectResult> {
    // Strategy 1: Streamable HTTP — POST initialize to the base URL
    try {
      const result = await this.connectStreamable();
      if (result.success) return result;
    } catch (e) {
      const error = e as Error;
      console.warn('Streamable HTTP failed:', error.message);
    }

    // Strategy 2: SSE transport
    try {
      const result = await this.connectSSE();
      if (result.success) return result;
    } catch (e) {
      const error = e as Error;
      console.warn('SSE transport failed:', error.message);
    }

    return { success: false, error: 'Could not connect to MCP server' };
  }

  private async connectStreamable(): Promise<ConnectResult> {
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
          clientInfo: { name: 'brace-kit', version: '1.0.0' },
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
    const data = await this.parseResponse<InitializeResult>(res);
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
    } catch {
      /* optional notification */
    }

    await this.listTools();
    return { success: true, tools: this.tools };
  }

  private async connectSSE(): Promise<ConnectResult> {
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

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Read until we get the endpoint event
    const endpoint = await new Promise<string>((resolve, reject) => {
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
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              reject(new Error('SSE stream ended'));
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            processBuffer();
            read();
          })
          .catch(reject);
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
  private async parseResponse<T>(res: Response): Promise<JSONRPCResponse<T> | null> {
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      // Parse SSE stream to extract JSON-RPC response
      const reader = res.body?.getReader();
      if (!reader) return null;

      const decoder = new TextDecoder();
      let buffer = '';
      let result: JSONRPCResponse<T> | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              result = JSON.parse(line.slice(5).trim()) as JSONRPCResponse<T>;
            } catch {
              /* not JSON yet */
            }
          }
        }

        if (result) break;
      }

      return result;
    }

    // Default: parse as JSON
    return (await res.json()) as JSONRPCResponse<T>;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.customHeaders,
    };
  }

  private async sendRequest<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
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

    const data = await this.parseResponse<T>(res);
    if (data?.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }
    return data?.result as T;
  }

  private async listTools(): Promise<MCPTool[]> {
    try {
      const result = await this.sendRequest<ToolsListResult>('tools/list');
      this.tools = result?.tools || [];
      return this.tools;
    } catch (e) {
      console.warn('Failed to list MCP tools:', e);
      this.tools = [];
      return [];
    }
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolCallResult> {
    try {
      const result = await this.sendRequest<ToolCallResult>('tools/call', {
        name,
        arguments: args,
      });
      return result;
    } catch (e) {
      const error = e as Error;
      return {
        content: [{ type: 'text', text: `Error calling tool: ${error.message}` }],
      };
    }
  }

  disconnect(): void {
    if (this.sseReader) {
      this.sseReader.cancel().catch(() => {});
    }
    this.connected = false;
    this.tools = [];
    this.sessionId = null;
    this.transport = null;
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Verify the server is still alive by re-listing tools.
   * Returns false if the connection has dropped; also marks connected = false.
   */
  async ping(): Promise<boolean> {
    if (!this.connected) return false;
    try {
      await this.sendRequest<ToolsListResult>('tools/list');
      return true;
    } catch {
      this.connected = false;
      return false;
    }
  }

  getTransport(): 'streamable' | 'sse' | null {
    return this.transport;
  }
}

interface MCPClientEntry {
  client: MCPClient;
  config: MCPServer;
  tools: MCPTool[];
}

// Manage multiple MCP servers
export class MCPManager {
  private clients: Map<string, MCPClientEntry>;

  constructor() {
    this.clients = new Map();
  }

  async addServer(config: MCPServer): Promise<ConnectResult> {
    const client = new MCPClient(config.url, config.headers || {});
    const result = await client.connect();
    if (result.success) {
      this.clients.set(config.id, {
        client,
        config,
        tools: result.tools || [],
      });
    }
    return result;
  }

  removeServer(id: string): void {
    const entry = this.clients.get(id);
    if (entry) {
      entry.client.disconnect();
      this.clients.delete(id);
    }
  }

  getAllTools(): MCPToolInternal[] {
    const tools: MCPToolInternal[] = [];
    for (const [serverId, entry] of this.clients) {
      for (const tool of entry.tools || []) {
        tools.push({
          ...tool,
          _serverId: serverId,
          _serverName: entry.config.name,
        });
      }
    }
    return tools;
  }

  async callTool(name: string): Promise<{ client: MCPClient; tool: MCPTool; serverName: string; serverId: string } | null> {
    // Find which server has this tool
    for (const [serverId, entry] of this.clients) {
      const tool = entry.tools.find((t) => t.name === name);
      if (tool) {
        return { client: entry.client, tool, serverName: entry.config.name, serverId };
      }
    }
    return null;
  }

  disconnectAll(): void {
    for (const [, entry] of this.clients) {
      entry.client.disconnect();
    }
    this.clients.clear();
  }

  getClientCount(): number {
    return this.clients.size;
  }

  async getConnectedServerIds(): Promise<string[]> {
    const alive: string[] = [];
    for (const [id, entry] of this.clients) {
      const ok = await entry.client.ping();
      if (ok) {
        alive.push(id);
      }
    }
    return alive;
  }
}
