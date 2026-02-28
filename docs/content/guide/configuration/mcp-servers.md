+++
title = "MCP Servers"
description = "Configure and manage Model Context Protocol servers in BraceKit."
weight = 33
template = "page.html"

[extra]
category = "Configuration"
+++

MCP servers are configured in a `.mcp.json` file. BraceKit reads this file on startup and reconnects whenever the settings change.

## `.mcp.json` format

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

## Configuration fields

| Field | Type | Required | Description |
|---|---|---|---|
| `command` | `string` | ✅ | The executable to run (`npx`, `python`, `node`, etc.) |
| `args` | `string[]` | ✅ | Arguments passed to the command |
| `env` | `object` | ❌ | Environment variables for the server process |
| `disabled` | `boolean` | ❌ | Set to `true` to disable without removing |

## Managing servers in the UI

1. Open **Settings → MCP Servers**
2. Click **Add Server** and fill in the command + args
3. BraceKit starts the server process and shows its connection status
4. Available tools from the server appear automatically in your next chat

## Popular MCP servers

| Server | Install command |
|---|---|
| Filesystem | `npx -y @modelcontextprotocol/server-filesystem ./` |
| GitHub | `npx -y @modelcontextprotocol/server-github` |
| Postgres | `npx -y @modelcontextprotocol/server-postgres` |
| Brave Search | `npx -y @modelcontextprotocol/server-brave-search` |
| Puppeteer | `npx -y @modelcontextprotocol/server-puppeteer` |

## Troubleshooting

If a server fails to connect, check:

1. `command` is installed and accessible (`which npx`, etc.)
2. Required environment variables are set in the `env` block
3. The server logs in **Settings → MCP Servers → [server name] → Logs**
