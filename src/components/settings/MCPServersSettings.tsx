import { useState, useCallback, useEffect } from 'react';
import { useMCP } from '../../hooks/useMCP.ts';
import { XIcon, ChevronDownIcon, TerminalIcon, PencilIcon, PlusIcon } from 'lucide-react';
import type { MCPTool, MCPServer } from '../../types/index.ts';

function ToolItem({ tool }: { tool: MCPTool }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasLongDescription = (tool.description?.length || 0) > 60;

  return (
    <div
      className="flex flex-col gap-0.5 p-2 rounded bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer group/tool"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <TerminalIcon size={10} className="text-primary/70 shrink-0" />
          <span className="text-xs font-mono font-bold text-foreground truncate">{tool.name}</span>
        </div>
        {hasLongDescription && (
          <ChevronDownIcon
            size={10}
            className={`text-muted-foreground/40 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        )}
      </div>
      {tool.description && (
        <p className={`text-xs text-muted-foreground/80 leading-snug pl-4 transition-all duration-200 ${isExpanded ? '' : 'line-clamp-2'}`}>
          {tool.description}
        </p>
      )}
    </div>
  );
}

export function MCPServersSettings() {
  const { mcpServers, addMCPServer, removeMCPServer, toggleMCPServer, updateMCPServer, listTools } = useMCP();
  const [showForm, setShowForm] = useState(false);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Tools reveal state
  const [expandedServerId, setExpandedServerId] = useState<string | null>(null);
  const [allTools, setAllTools] = useState<MCPTool[]>([]);
  const [isLoadingTools, setIsLoadingTools] = useState(false);

  const fetchTools = useCallback(async () => {
    setIsLoadingTools(true);
    const tools = await listTools();
    setAllTools(tools);
    setIsLoadingTools(false);
  }, [listTools]);

  useEffect(() => {
    if (expandedServerId) {
      fetchTools();
    }
  }, [expandedServerId, fetchTools]);

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) return;
    setIsConnecting(true);

    let result;
    if (editingServerId) {
      // Parse headers
      const headersMap: Record<string, string> = {};
      const headerLines = headers.trim().split('\n');
      for (const line of headerLines) {
        const idx = line.indexOf(':');
        if (idx > 0) {
          const key = line.slice(0, idx).trim();
          const val = line.slice(idx + 1).trim();
          if (key) headersMap[key] = val;
        }
      }

      result = await updateMCPServer(editingServerId, {
        name: name.trim(),
        url: url.trim(),
        headers: headersMap,
      });
    } else {
      result = await addMCPServer(name.trim(), url.trim(), headers);
    }

    setIsConnecting(false);
    if (result.success) {
      resetForm();
    } else {
      alert(`Failed: ${result.error || 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setName('');
    setUrl('');
    setHeaders('');
    setShowForm(false);
    setEditingServerId(null);
  };

  const handleEdit = (server: MCPServer) => {
    setName(server.name);
    setUrl(server.url);

    // Format headers back to text
    const headersText = Object.entries(server.headers || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    setHeaders(headersText);

    setEditingServerId(server.id);
    setShowForm(true);
    // Scroll to top of form
  };

  const toggleExpand = (id: string) => {
    setExpandedServerId(expandedServerId === id ? null : id);
  };

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">MCP Servers</h3>
          <p className="text-xs text-muted-foreground leading-none">External tools and data sources</p>
        </div>
        <button
          className={`w-7 h-7 flex items-center justify-center rounded-md transition-all ${showForm && !editingServerId
            ? 'bg-primary text-primary-foreground shadow-sm'
            : 'bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground'
            }`}
          title="Add server"
          onClick={() => {
            if (showForm && editingServerId) {
              setEditingServerId(null);
              setName('');
              setUrl('');
              setHeaders('');
            } else {
              setShowForm(!showForm);
            }
          }}
        >
          {editingServerId ? <XIcon size={14} /> : (
            <PlusIcon size={14} className={`transition-transform duration-200 ${showForm ? 'rotate-45' : ''}`} />
          )}
        </button>
      </div>

      {showForm && (
        <div className="flex flex-col gap-3 p-3 mb-2 rounded-lg bg-secondary/30 border border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            {editingServerId ? 'Edit MCP Server' : 'New MCP Server'}
          </div>
          <div className="flex flex-col gap-1 px-0.5">
            <label htmlFor="mcp-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Server Name</label>
            <input
              type="text"
              id="mcp-name"
              className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
              placeholder="My MCP Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 px-0.5">
            <label htmlFor="mcp-url" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">Server URL</label>
            <input
              type="url"
              id="mcp-url"
              className="w-full h-8 px-2.5 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground"
              placeholder="http://localhost:3000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1 px-0.5">
            <label htmlFor="mcp-headers" className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center justify-between">
              Headers <span className="text-xs lowercase font-normal opacity-60">Key: Value (one per line)</span>
            </label>
            <textarea
              id="mcp-headers"
              rows={2}
              className="w-full p-2 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground resize-none"
              placeholder="Authorization: Bearer sk-xxx"
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 h-9 flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 transition-all disabled:opacity-50 shadow-sm active:scale-[0.98]"
              onClick={handleSave}
              disabled={isConnecting}
            >
              {isConnecting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <PlusIcon size={14} />
              )}
              {isConnecting ? 'Connecting...' : editingServerId ? 'Update Server' : 'Connect Server'}
            </button>
            {editingServerId && (
              <button
                className="px-4 h-9 bg-muted text-muted-foreground text-sm font-medium rounded-md hover:bg-muted/80 transition-all"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {mcpServers.map((server) => {
          const isActive = server.connected && server.enabled !== false;
          const isExpanded = expandedServerId === server.id;
          const serverTools = allTools.filter(t => t._serverId === server.id);

          return (
            <div key={server.id} className="flex flex-col overflow-hidden rounded-lg border border-border/40 bg-secondary/10 transition-all hover:bg-secondary/20">
              <div className="flex items-center gap-3 p-2.5">
                <div
                  className="flex-1 flex flex-col gap-0.5 min-w-0 cursor-pointer group"
                  onClick={() => toggleExpand(server.id)}
                >
                  <div className="flex items-center gap-1.5 font-bold uppercase tracking-tight text-xs text-foreground">
                    <div
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-success animate-pulse' : 'bg-muted-foreground/40'
                        }`}
                      title={isActive ? 'Connected' : server.enabled === false ? 'Disabled' : 'Disconnected'}
                    />
                    <span className="truncate group-hover:text-primary transition-colors">{server.name}</span>
                    <ChevronDownIcon
                      size={12}
                      className={`ml-0.5 transition-transform duration-300 opacity-40 group-hover:opacity-100 ${isExpanded ? 'rotate-180 text-primary' : ''}`}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground truncate opacity-60 leading-tight">{server.url}</span>
                  {server.toolCount ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="inline-flex px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs font-bold uppercase tracking-widest">
                        {server.toolCount} items
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={server.enabled !== false}
                      onChange={(e) => toggleMCPServer(server.id, e.target.checked)}
                    />
                    <div className="w-7 h-4 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-3"></div>
                  </label>
                  <button
                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-all"
                    title="Edit server"
                    onClick={() => handleEdit(server)}
                  >
                    <PencilIcon size={14} />
                  </button>
                  <button
                    className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all"
                    title="Remove server"
                    onClick={() => removeMCPServer(server.id)}
                  >
                    <XIcon size={14} />
                  </button>
                </div>
              </div>

              {/* Tools Revealed Section */}
              {isExpanded && (
                <div className="px-2.5 pb-3 pt-1 border-t border-border/20 bg-background/40 animate-in slide-in-from-top-1 duration-300">
                  <div className="flex flex-col gap-1.5 mt-1.5">
                    {isLoadingTools ? (
                      <div className="py-4 flex flex-col items-center justify-center gap-2 opacity-40">
                        <div className="w-3 h-3 border border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs font-bold uppercase tracking-wider">Loading tools...</span>
                      </div>
                    ) : serverTools.length > 0 ? (
                      serverTools.map(tool => (
                        <ToolItem key={tool.name} tool={tool} />
                      ))
                    ) : (
                      <div className="py-3 text-center text-xs font-bold text-muted-foreground/40 uppercase tracking-widest border border-dashed border-border/40 rounded">
                        No tools found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
