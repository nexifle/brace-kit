# AI Sidebar — Chrome Extension

An AI-powered Chrome sidebar that reads the current page content and lets you chat with multiple LLM providers. Features MCP (Model Context Protocol) support, highlighted text selection, and streaming responses with markdown rendering.

## Features

- 🔍 **Page Context Reading** — Read entire page content or grab highlighted text
- 💬 **Streaming AI Chat** — Real-time streaming responses with markdown rendering
- 🔌 **Multi-Provider Support** — OpenAI, Claude, Gemini, xAI, DeepSeek, custom endpoints
- 🛠️ **MCP Support** — Connect MCP servers for tool usage
- ⚙️ **Custom Configuration** — API keys, custom endpoints, system prompts, model selection
- 🌙 **Dark Theme** — Premium dark UI with glassmorphism effects
- 📋 **Context Menu** — Right-click selected text → "Send to AI Sidebar"

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select this `ai-sidebar` folder
5. Click the extension icon in the toolbar to open the sidebar

## Setup

1. Click the ⚙️ gear icon to open Settings
2. Select your LLM provider (OpenAI, Claude, Gemini, etc.)
3. Enter your API key
4. Optionally adjust the model, endpoint URL, or system prompt

## Usage

### Chat
- Type a message and press Enter or click Send
- Responses stream in real-time with markdown formatting

### Page Context
- Click the 📎 attach button or "Read Current Page" to attach page content
- The AI will have full context of the page when responding

### Highlighted Text
- Select text on any webpage — it automatically appears in the sidebar
- Or click "Grab Selection" to manually grab the current selection
- Right-click selected text → "Send to AI Sidebar"

### MCP Servers
- Open Settings → MCP Servers section
- Enter server name and URL, click "Connect Server"
- Connected tools are automatically made available to the AI

## Supported Providers

| Provider | API Format | Models |
|----------|-----------|--------|
| OpenAI | Native | gpt-4o, gpt-4o-mini, o1, o3-mini |
| Anthropic | Native | claude-sonnet-4-20250514, claude-3-5-sonnet, claude-3-opus |
| Google Gemini | Native | gemini-2.0-flash, gemini-1.5-pro |
| xAI (Grok) | OpenAI-compatible | grok-2, grok-2-mini |
| DeepSeek | OpenAI-compatible | deepseek-chat, deepseek-reasoner |
| Custom | Configurable | Any |

## File Structure

```
ai-sidebar/
├── manifest.json      # Chrome extension manifest (V3)
├── background.js      # Service worker (API calls, MCP, routing)
├── content.js         # Content script (page reading, text selection)
├── sidebar.html       # Sidebar panel HTML
├── sidebar.css        # Dark theme styles
├── sidebar.js         # Sidebar application logic
├── providers.js       # LLM provider abstraction
├── mcp.js             # MCP client (SSE transport)
├── markdown.js        # Markdown renderer
└── icons/             # Extension icons (16/48/128px)
```
