+++
title = "MCP Server Settings"
description = "Connect external tools and data sources via MCP servers."
weight = 5
template = "page.html"

[extra]
category = "Configuration"
+++

# MCP Server Settings

Connect external tools and data sources to BraceKit using Model Context Protocol (MCP) servers.

---

## What is MCP?

Model Context Protocol (MCP) is a standard for connecting AI assistants to external tools and data sources. With MCP servers, BraceKit can:

- Access local files and databases
- Search the web with specialized tools
- Interact with APIs and services
- Run custom tools and scripts

---

## Server List

View all configured MCP servers:

| Indicator | Status |
|-----------|--------|
| 🟢 Green dot | Connected and active |
| ⚪ Gray dot | Disconnected or disabled |

Each server shows:
- **Name**: Server identifier
- **URL**: Server endpoint
- **Tool Count**: Number of available tools

---

## Adding Servers {#add-server}

### Server Configuration

To add a new MCP server:

1. Click the **+** button
2. Fill in the details:
   - **Server Name**: Display name for the server
   - **Server URL**: HTTP endpoint (e.g., `http://localhost:3000`)
   - **Headers**: Optional authentication headers
3. Click **Connect Server**

### Headers Format

Enter headers as `Key: Value` pairs, one per line:

```
Authorization: Bearer sk-xxx
X-Custom-Header: value
```

### Example: Local MCP Server

If you're running an MCP server locally:

```
Name: Local Tools
URL: http://localhost:3000
Headers: (leave empty for local)
```

---

## Viewing Tools {#viewing-tools}

### Expanding Server Details

Click on a server to expand and view its available tools.

Each tool shows:
- **Name**: Tool identifier
- **Description**: What the tool does

### Refreshing Tools

Click **Refresh** to re-fetch the list of tools from the server.

### Connection Errors

If a server shows a connection error:

1. Check that the server is running
2. Verify the URL is correct
3. Check any required headers
4. Click **Refresh** or **Try reconnecting**

---

## Managing Servers

### Enable/Disable Server

Toggle the switch to enable or disable a server without removing it.

### Edit Server

1. Click the **pencil icon**
2. Modify name, URL, or headers
3. Click **Update Server**

### Remove Server

Click the **X icon** to remove a server from the list.

---

## Related

- [AI Provider Settings](../ai-provider/)
- [Troubleshooting](/guide/reference/troubleshooting/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
