+++
title = "Configuration"
description = "All settings and configuration options available in BraceKit, explained in detail."
weight = 30
template = "page.html"

[extra]
category = "Core Concepts"
icon = "<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>"
+++

All BraceKit settings are accessible via the **Settings** panel (the gear icon ⚙ in the top-right of the sidebar). Settings are persisted in `chrome.storage.local` — private to your device, never synced to any server.

---

## Provider Settings

Configure API keys and endpoints under **Settings → Providers**.

### API Keys

Each provider has its own API key field. Keys are stored encrypted in extension storage and are never transmitted to BraceKit servers.

| Provider | Where to get a key |
|---|---|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| Google Gemini | [aistudio.google.com](https://aistudio.google.com) |
| xAI | [console.x.ai](https://console.x.ai) |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com) |

### Custom Endpoint (OpenAI-compatible)

For local models or proxies (Ollama, LM Studio, Jan.ai), set a custom base URL under **Settings → Providers → Custom**:

| Field | Example value |
|---|---|
| Base URL | `http://localhost:11434/v1` |
| API Key | `ollama` (any non-empty string for local) |
| Default model | `llama3.2:latest` |

```
Settings → Providers → Custom → Base URL
Settings → Providers → Custom → API Key
```

> **Tip:** Models are fetched automatically from the `/v1/models` endpoint. If your server doesn't support that, you can type a model name manually.

---

## Chat Settings

Control response behavior under **Settings → Chat**.

### System Prompt

Set a persistent system prompt that is prepended to every conversation. Example:

```
You are a helpful assistant. Always respond in Markdown.
Format code blocks with the correct language tag.
When asked about code, prefer modern, idiomatic solutions.
```

### Temperature

Controls response creativity and randomness:

| Value | Behavior |
|---|---|
| `0.0` | Fully deterministic — same input always gives same output |
| `0.3` | Conservative — good for factual / coding tasks |
| `0.7` | Balanced — default for most use cases |
| `1.0` | Creative — higher variance, more exploratory |
| `2.0` | Maximum randomness — not recommended for factual tasks |

### Max Tokens

Sets the maximum number of tokens in a single response. Leave blank to use the provider's default.

> **Warning:** Very high token limits can result in slow responses and increased API costs. Most tasks work well under 4096 tokens.

### Streaming

Streaming is enabled by default. Responses appear token-by-token as they're generated.

Disable streaming only if your custom endpoint doesn't support Server-Sent Events (SSE). When disabled, BraceKit waits for the full response before displaying it.

---

## MCP Server Configuration

MCP servers are configured in a `.mcp.json` file. BraceKit reads this file on startup and reconnects whenever the settings change.

### `.mcp.json` format

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
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://localhost/mydb"
      }
    }
  }
}
```

### Available configuration fields

| Field | Type | Required | Description |
|---|---|---|---|
| `command` | `string` | ✅ | The executable to run (e.g. `npx`, `python`, `node`) |
| `args` | `string[]` | ✅ | Arguments passed to the command |
| `env` | `object` | ❌ | Environment variables for the server process |
| `disabled` | `boolean` | ❌ | Set to `true` to disable without removing the entry |

### Managing servers in the UI

1. Open **Settings → MCP Servers**
2. Click **Add Server** and fill in the command + args
3. BraceKit starts the server process and shows its connection status
4. Available tools from the server appear automatically in your next chat

---

## Security Settings

### PIN Protection

Enable PIN under **Settings → Security → Enable PIN**. You'll be prompted to set a 4–8 digit PIN.

```
Settings → Security → Enable PIN
Settings → Security → PIN Timeout: 15 minutes (default)
```

The PIN gates access to the sidebar when the browser has been idle longer than the configured timeout. Your API keys and conversation history remain inaccessible until the correct PIN is entered.

### Data Privacy

- All conversation history is stored **locally** in `chrome.storage.local`
- API keys are **never** sent to any BraceKit server or third party
- No analytics, telemetry, or crash reporting is collected
- BraceKit does not require a BraceKit account

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+Shift+B` | Open / close the BraceKit sidebar |
| `Enter` | Send message |
| `Shift+Enter` | Insert a new line in the input |
| `Esc` | Cancel a streaming response |
| `/` | Focus the search bar (on docs pages) |

Shortcuts can be customized at `chrome://extensions/shortcuts` in your browser.
