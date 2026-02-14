import { useState } from 'react';
import { useMCP } from '../../hooks/useMCP.ts';

export function MCPServersSettings() {
  const { mcpServers, addMCPServer, removeMCPServer, toggleMCPServer } = useMCP();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    setIsConnecting(true);
    const result = await addMCPServer(name.trim(), url.trim(), headers);
    setIsConnecting(false);
    if (result.success) {
      setName('');
      setUrl('');
      setHeaders('');
      setShowForm(false);
    } else {
      alert(`Failed to connect: ${result.error || 'Unknown error'}`);
    }
  };

  return (
    <section className="settings-section">
      <div className="section-header-row">
        <h3>MCP Servers</h3>
        <button
          className={`section-toggle-btn ${showForm ? 'active' : ''}`}
          title="Add server"
          onClick={() => setShowForm(!showForm)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div id="mcp-servers-list">
        {mcpServers.map((server) => {
          const isActive = server.connected && server.enabled !== false;
          return (
            <div key={server.id} className="mcp-server-item">
              <div className="mcp-server-info">
                <span
                  className={`status-dot ${isActive ? 'connected' : 'disconnected'}`}
                  title={isActive ? 'Connected' : server.enabled === false ? 'Disabled' : 'Disconnected'}
                ></span>
                <span className="mcp-server-name">{server.name}</span>
                <span className="mcp-server-url">{server.url}</span>
                {server.toolCount ? (
                  <span className="mcp-server-tools">{server.toolCount} tools</span>
                ) : null}
              </div>
              <div className="mcp-server-actions">
                <label className="toggle-switch small">
                  <input
                    type="checkbox"
                    checked={server.enabled !== false}
                    onChange={(e) => toggleMCPServer(server.id, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <button
                  className="btn-disconnect"
                  title="Remove server"
                  onClick={() => removeMCPServer(server.id)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <div id="mcp-add-form" className="mcp-add-form">
          <div className="form-group compact">
            <label htmlFor="mcp-name">Server Name</label>
            <input
              type="text"
              id="mcp-name"
              placeholder="My MCP Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group compact">
            <label htmlFor="mcp-url">Server URL</label>
            <input
              type="url"
              id="mcp-url"
              placeholder="http://localhost:3000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="form-group compact">
            <label htmlFor="mcp-headers">
              Headers <span className="hint">(one per line, Key: Value)</span>
            </label>
            <textarea
              id="mcp-headers"
              rows={2}
              placeholder="Authorization: Bearer sk-xxx"
              value={headers}
              onChange={(e) => setHeaders(e.target.value)}
            />
          </div>
          <button className="btn-secondary" onClick={handleAdd} disabled={isConnecting}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {isConnecting ? 'Connecting...' : 'Connect Server'}
          </button>
        </div>
      )}
    </section>
  );
}
