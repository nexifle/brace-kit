+++
title = "MCP Servers"
description = "Connect external tools via HTTP-based Model Context Protocol."
weight = 41
template = "page.html"

[extra]
category = "Advanced"
+++

# MCP Servers

MCP (Model Context Protocol) allows BraceKit to connect to external servers for additional tools like search, database access, or other APIs.

## Adding an MCP Server

### Step 1: Open Settings

1. Click the **Settings** icon (⚙️) in the sidebar
2. Select **MCP Servers** from the list

### Step 2: Add New Server

1. Click the **+** button in the top right corner
2. Fill in the form:

| Field | Description |
|-------|-------------|
| **Server Name** | A friendly name (e.g., "My API") |
| **Server URL** | HTTP address of the MCP server (e.g., `http://localhost:3000`) |
| **Headers** | Authentication headers if required (optional) |

### Step 3: Format Headers

If the server requires authentication, enter headers in this format:

```
Authorization: Bearer your-api-key
X-API-Key: your-key
```

One header per line, using `Key: Value` format.

### Step 4: Connect

Click **Connect Server**. BraceKit will:

1. Contact the server at the provided URL
2. Perform MCP handshake
3. Fetch the list of available tools

If successful, the server will show **🟢 Connected** status with the number of available tools.

## Managing Servers

### Viewing Available Tools

1. Click on a server card to expand it
2. The list of tools will be displayed with their descriptions
3. Click **Refresh** to reload the tool list

### Toggle Server

- Use the toggle switch to enable/disable a server
- Disabled servers won't be used in chat

### Edit Server

1. Click the **pencil** ✏️ icon on the server card
2. Update name, URL, or headers
3. Click **Update Server** to save

### Remove Server

Click the **X** icon on the server card to delete it.

## Server Status

| Status | Meaning |
|--------|---------|
| 🟢 Green | Server connected, tools ready to use |
| 🔴 Gray | Server disconnected or disabled |

## Built-in Tools

BraceKit has built-in tools that work without any MCP server:

| Tool | Function |
|------|----------|
| `google_search` | Search the web via Google Custom Search |
| `continue_message` | Continue generating if response was cut off |

### Enabling Google Search

1. Go to **Settings → Chat**
2. Enable **Enable Google Search Tool**
3. Enter your Google API Key
4. AI will automatically search the web when needed

## Using Tools in Chat

When tools are available, the AI will automatically use them when relevant:

```
You: Who is the current president of Indonesia?

BraceKit: [🔧 Calling google_search...]

Based on my search, the current president is...

[✅ Tool result shown]
```

## MCP Server Requirements

BraceKit supports **HTTP-based MCP servers** with these transports:

- **Streamable HTTP** — POST to base URL
- **SSE (Server-Sent Events)** — GET `/sse` endpoint

Servers must implement the standard MCP protocol with these methods:
- `initialize` — Initial handshake
- `tools/list` — Return list of available tools
- `tools/call` — Execute a tool

## Troubleshooting

### Server Won't Connect

- Make sure the URL is correct and the server is running
- Check network connectivity
- Verify the server supports CORS

### Tools Not Appearing

- Ensure the server implements `tools/list`
- Click **Refresh** to reload
- Check server logs for errors

### Tool Call Fails

- Check if API key/token is still valid
- Ensure server handles `tools/call` correctly
- Verify argument format being sent

## Security Tips

- Use HTTPS for sensitive connections
- Don't share API keys with others
- Only connect to trusted servers
- Rotate API keys periodically
