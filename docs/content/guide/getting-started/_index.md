+++
title = "Getting Started"
description = "Get up and running with BraceKit in minutes."
sort_by = "weight"
template = "section.html"
weight = 10

[extra]
category = "Getting Started"
+++

# Getting Started

New to BraceKit? This section will guide you through everything you need to know to get started.

## What You'll Need

Before installing BraceKit, make sure you have:

- **Google Chrome** v109 or later (or any Chromium-based browser: Edge, Brave, Arc)
- An **API key** from at least one AI provider:
  - [OpenAI](https://platform.openai.com/api-keys)
  - [Anthropic](https://console.anthropic.com)
  - [Google Gemini](https://aistudio.google.com)
  - [xAI](https://console.x.ai)
  - [DeepSeek](https://platform.deepseek.com)
- **Or** a local [Ollama](https://ollama.ai) installation for offline AI

## Quick Setup

### 1. Install BraceKit

Clone and build the extension:

```bash
git clone https://github.com/your-org/brace-kit.git
cd brace-kit
bun install
bun run build
```

Then load it in Chrome from the `dist/` folder.

→ **[Full installation guide](/guide/getting-started/installation/)**

### 2. Configure Your Provider

1. Click the BraceKit icon to open the sidebar
2. Click **Settings** (gear icon)
3. Navigate to **AI Provider**
4. Select your provider and enter your API key
5. Choose a model

→ **[First chat tutorial](/guide/getting-started/first-chat/)**

### 3. Start Using

- **Chat**: Type a message and press Enter
- **Page context**: Click the globe icon to include page content
- **Text selection**: Highlight text on any page to ask about it

## Next Steps

- Learn about [core features](/guide/core-features/) like page context and branching
- Set up [MCP servers](/guide/advanced/mcp-servers/) for extended capabilities
- Enable the [memory system](/guide/advanced/memory/) for personalized responses
