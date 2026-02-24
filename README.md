# BraceKit — Chrome Extension

An AI-powered Chrome sidebar that reads the current page content and lets you chat with multiple LLM providers. Features MCP (Model Context Protocol) support, highlighted text selection, and streaming responses with markdown rendering.

## Features

- 🔍 **Page Context Reading** — Read entire page content or grab highlighted text
- 💬 **Streaming AI Chat** — Real-time streaming responses with markdown rendering
- 🔌 **Multi-Provider Support** — OpenAI, Claude, Gemini, xAI, DeepSeek, custom endpoints
- 🛠️ **MCP Support** — Connect MCP servers for tool usage
- ⚙️ **Custom Configuration** — API keys, custom endpoints, system prompts, model selection
- 🌙 **Dark Theme** — Premium dark UI with glassmorphism effects
- 📋 **Context Menu** — Right-click selected text → "Send to BraceKit"
- 💾 **Conversation Memory** — Persistent chat history with search
- 🖼️ **Image Support** — View and manage images in conversations
- 🔐 **Security Lock** — PIN protection for sensitive data

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/) - Fast JavaScript runtime
- **UI Framework**: React 19 + TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React
- **Build**: Bun bundler

## Installation

### Prerequisites

- [Bun](https://bun.sh/) installed on your system
- Chrome browser

### Build & Load

```bash
# Clone the repository
git clone <repo-url>
cd brace-kit

# Install dependencies
bun install

# Build the extension
bun run build
```

Then in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder (not the project root)
5. Click the extension icon to open the sidebar

### Development

```bash
# Start dev server with hot reload
bun run dev

# Type checking
bun run typecheck
```

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
- Right-click selected text → "Send to BraceKit"

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

## Project Structure

```
brace-kit/
├── src/
│   ├── background/            # Service worker (Manifest V3)
│   │   ├── index.ts           # Entry point, message routing
│   │   ├── handlers/          # Domain-specific handlers (chat, mcp, memory, models)
│   │   ├── services/          # Business logic (chat.service, streaming.service)
│   │   ├── tools/             # Built-in tools (google_search, continue_message)
│   │   └── utils/             # Utilities (errors)
│   ├── components/            # React UI components
│   │   ├── message/           # Message display (decomposed)
│   │   │   ├── sections/      # Content sections (Reasoning, Context, Images, etc.)
│   │   │   ├── actions/       # Action buttons (Copy, Branch, Edit)
│   │   │   └── display/       # Display components (Lightbox, Attachments)
│   │   ├── settings/          # Settings panels (Provider, MCP, Memory, Security)
│   │   └── ui/                # Reusable primitives (Btn, IconButton, TextInput)
│   ├── hooks/                 # Custom React hooks
│   │   ├── useChat.ts         # Main chat logic
│   │   ├── useStreaming.ts    # Stream processing
│   │   ├── useMemory.ts       # Conversation persistence
│   │   ├── useMCP.ts          # MCP server management
│   │   └── useProvider.ts     # Provider/model selection
│   ├── providers/             # LLM provider abstraction
│   │   ├── formats/           # Provider-specific formatters (openai, anthropic, gemini)
│   │   └── utils/             # Schema utilities
│   ├── services/              # Shared services (toolRegistry)
│   ├── store/                 # Zustand state management
│   ├── types/                 # TypeScript type definitions
│   ├── utils/                 # Utility functions (markdown, crypto, formatters)
│   ├── styles/                # Global CSS styles
│   ├── content.ts             # Content script (page reading, text selection)
│   ├── index.tsx              # Sidebar entry point
│   └── onboarding.tsx         # Onboarding page
├── dist/                      # Built extension (load this in Chrome)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── index.js
│   ├── onboarding.js
│   └── icons/
├── package.json
├── build.ts                   # Build script
└── tsconfig.json
```
