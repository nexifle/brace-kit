![BraceKit](./thumbnail.jpg)

# BraceKit — AI Sidebar for Chrome

[![Chrome Web Store](https://developer.chrome.com/static/images/badges/en/webstore-badge-2.png)](https://chromewebstore.google.com/detail/bracekit-ai-sidebar/kdlbihnhbaeoghamncndigpgnjociehh)

An AI-powered Chrome sidebar that reads the current page content and lets you chat with multiple LLM providers. Features MCP (Model Context Protocol) support, conversation branching, AI floating toolbar, and streaming responses with markdown rendering.

> **Bring Your Own Key (BYOK)** — BraceKit is free to use. You supply your own API keys directly to your chosen providers. No subscriptions, no telemetry, no data sent to BraceKit servers.

**[Documentation](https://bracekit.nexifle.com/guide/)**

## Features

- **Page Context Reading** — Read entire page content or grab highlighted text
- **Streaming AI Chat** — Real-time streaming responses with markdown rendering
- **Multi-Provider Support** — OpenAI, Claude, Gemini, xAI, DeepSeek, Ollama, and custom endpoints
- **MCP Support** — Connect MCP servers for tool usage
- **AI Floating Toolbar** — Select text on any page to Summarize, Explain, Translate, Rephrase, and more
- **Conversation Branching** — Fork conversations at any point without losing context
- **File Attachments** — Attach images and text files; vision models analyze images automatically
- **Omnibox Quick Search** — Type `bk` in Chrome's address bar to start a new chat
- **Memory System** — Remembers preferences and context across conversations
- **Auto-Compact** — Automatically compresses long conversations to stay within context limits
- **Custom Configuration** — API keys, custom endpoints, system prompts, model selection
- **Dark Theme** — Dark UI with glassmorphism effects
- **Context Menu** — Right-click selected text to send directly to BraceKit
- **Conversation Memory** — Persistent chat history with search
- **Image Generation** — Gemini and xAI image generation with aspect ratio selection
- **Security Lock** — PIN protection for sensitive data

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
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

1. Click the gear icon to open Settings
2. Select your LLM provider (OpenAI, Claude, Gemini, etc.)
3. Enter your API key
4. Optionally adjust the model, endpoint URL, or system prompt

## Usage

### Chat
- Type a message and press Enter or click Send
- Responses stream in real-time with markdown formatting
- Use slash commands: `/compact`, `/rename`

### Page Context
- Click the attach button or "Read Current Page" to attach page content
- The AI will have full context of the page when responding

### Highlighted Text
- Select text on any webpage — it automatically appears in the sidebar
- Or click "Grab Selection" to manually grab the current selection
- Right-click selected text → "Send to BraceKit"

### AI Floating Toolbar
- Select any text on a webpage to trigger the floating toolbar
- Choose from built-in actions or add your own custom prompts
- Apply results directly to editable fields on the page

### Conversation Branching
- Click the branch icon on any message to fork the conversation
- Explore alternative directions without losing your original context

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
| Ollama | OpenAI-compatible | Any local model |
| Custom | Configurable | Any OpenAI/Anthropic-compatible endpoint |

## Project Structure

```
brace-kit/
├── src/
│   ├── background/       # Service worker (handlers, services, tools)
│   ├── content/          # AI Floating Toolbar (selection UI)
│   ├── components/       # React UI (message, settings, ui primitives)
│   ├── hooks/            # Custom React hooks
│   ├── providers/        # LLM provider abstraction
│   ├── services/         # Shared services
│   ├── store/            # Zustand state
│   ├── types/            # TypeScript types
│   ├── utils/            # Utility functions
│   ├── styles/           # Global CSS
│   ├── content.ts        # Content script entry point
│   ├── index.tsx         # Sidebar entry point
│   └── onboarding.tsx    # Onboarding page
├── dist/                 # Built extension (load this in Chrome)
├── tests/                # Unit tests (Bun test framework)
├── build.ts              # Build script
└── package.json
```
