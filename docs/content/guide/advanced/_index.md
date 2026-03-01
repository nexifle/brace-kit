+++
title = "Advanced Features"
description = "Power user features for extended capabilities."
sort_by = "weight"
template = "section.html"
weight = 40

[extra]
category = "Advanced"
+++

# Advanced Features

Take BraceKit to the next level with these power user features.

## Feature Overview

| Feature | What it does |
|---------|--------------|
| **[MCP Servers](/guide/advanced/mcp-servers/)** | Connect external tools via Model Context Protocol |
| **[Memory System](/guide/advanced/memory/)** | AI remembers your preferences across conversations |
| **[Auto-Compact](/guide/advanced/auto-compact/)** | Automatically summarize long conversations |
| **[Image Generation](/guide/advanced/image-generation/)** | Create images with Gemini or xAI |
| **[Gallery View](/guide/advanced/gallery/)** | Browse all generated and attached images |
| **[Security & PIN](/guide/advanced/security/)** | Protect your data with password lock |

## MCP (Model Context Protocol)

MCP is a protocol for connecting external tools to AI assistants. With MCP servers, BraceKit can:

- Search the web (Google, Brave Search)
- Read and write files
- Query databases
- Access APIs
- And much more

### Quick Setup

1. Create a `.mcp.json` file in your project
2. Add server configurations
3. BraceKit automatically connects

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "./"]
    }
  }
}
```

→ **[Full MCP guide](/guide/advanced/mcp-servers/)**

## Memory System

The memory system lets BraceKit remember information across conversations:

- Personal preferences
- Coding style
- Project context
- Goals and interests

### How it Works

1. Enable memory in Settings
2. Chat normally
3. BraceKit extracts important information
4. Future conversations include relevant memories

→ **[Memory system guide](/guide/advanced/memory/)**

## Auto-Compact

Long conversations eventually hit token limits. Auto-compact automatically summarizes old messages to make room for new ones.

### When it Triggers

- At 90% of context window (configurable)
- Or manually with `/compact` command

→ **[Auto-compact guide](/guide/advanced/auto-compact/)**

## Image Generation

Generate images directly in chat using Gemini or xAI models.

### Quick Start

1. Select an image generation model
2. Choose aspect ratio
3. Describe your image

```
You: Generate a minimalist logo for a tech startup

BraceKit: [Generated image appears]
```

→ **[Image generation guide](/guide/advanced/image-generation/)**

## Gallery View

All generated and attached images are saved to a gallery:

- Browse by conversation
- Favorite important images
- Download or copy
- Jump to source conversation

→ **[Gallery guide](/guide/advanced/gallery/)**

## Security

Protect your API keys and conversations with PIN protection:

- Set a 4-8 digit PIN
- Auto-lock after timeout
- Secure storage for sensitive data

→ **[Security guide](/guide/advanced/security/)**

## Coming Soon

- Voice input
- Custom themes
- Export conversations
- Team sharing
