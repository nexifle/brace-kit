+++
title = "Documentation"
description = "Complete guide for setting up and using BraceKit — the AI-powered Chrome sidebar."
sort_by = "weight"
template = "section.html"

[extra]
nav_groups = [
    { title = "Getting Started", items = [
        { label = "Introduction", url = "/guide/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'/><path d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'/></svg>" },
        { label = "Installation", url = "/guide/getting-started/installation/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' y1='15' x2='12' y2='3'/></svg>" },
        { label = "First Chat", url = "/guide/getting-started/first-chat/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>" },
    ]},
    { title = "Core Features", items = [
        { label = "Chat Interface", url = "/guide/core-features/chat/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'/></svg>" },
        { label = "AI Floating Toolbar", url = "/guide/core-features/ai-floating-toolbar/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'/></svg>" },
        { label = "Page Context", url = "/guide/core-features/page-context/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='10'/><line x1='2' y1='12' x2='22' y2='12'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/></svg>" },
        { label = "Text Selection", url = "/guide/core-features/text-selection/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M4 7V4h16v3'/><path d='M9 20h6'/><path d='M12 4v16'/></svg>" },
        { label = "Branching", url = "/guide/core-features/branching/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><line x1='6' y1='3' x2='6' y2='15'/><circle cx='18' cy='6' r='3'/><circle cx='6' cy='18' r='3'/><path d='M18 9a9 9 0 0 1-5.5 8.28'/></svg>" },
        { label = "File Attachments", url = "/guide/core-features/attachments/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48'/></svg>" },
    ]},
    { title = "AI Providers", items = [
        { label = "Overview", url = "/guide/ai-providers/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>", children = [
            { label = "OpenAI", url = "/guide/ai-providers/openai/" },
            { label = "Anthropic", url = "/guide/ai-providers/anthropic/" },
            { label = "Google Gemini", url = "/guide/ai-providers/gemini/" },
            { label = "xAI (Grok)", url = "/guide/ai-providers/xai/" },
            { label = "DeepSeek", url = "/guide/ai-providers/deepseek/" },
            { label = "Ollama (Local)", url = "/guide/ai-providers/ollama/" },
            { label = "Custom Provider", url = "/guide/ai-providers/custom/" },
        ]},
    ]},
    { title = "Advanced", items = [
        { label = "MCP Servers", url = "/guide/advanced/mcp-servers/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'/></svg>" },
        { label = "Memory System", url = "/guide/advanced/memory/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'/><path d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'/></svg>" },
        { label = "Auto-Compact", url = "/guide/advanced/auto-compact/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><polyline points='4 14 10 14 10 20'/><polyline points='20 10 14 10 14 4'/><line x1='14' y1='10' x2='21' y2='3'/><line x1='3' y1='21' x2='10' y2='14'/></svg>" },
        { label = "Image Generation", url = "/guide/advanced/image-generation/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3' y='3' width='18' height='18' rx='2' ry='2'/><circle cx='8.5' cy='8.5' r='1.5'/><polyline points='21 15 16 10 5 21'/></svg>" },
        { label = "Gallery View", url = "/guide/advanced/gallery/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3' y='3' width='7' height='7'/><rect x='14' y='3' width='7' height='7'/><rect x='14' y='14' width='7' height='7'/><rect x='3' y='14' width='7' height='7'/></svg>" },
        { label = "Security & PIN", url = "/guide/advanced/security/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><rect x='3' y='11' width='18' height='11' rx='2' ry='2'/><path d='M7 11V7a5 5 0 0 1 10 0v4'/></svg>" },
    ]},
    { title = "Reference", items = [
        { label = "Configuration", url = "/guide/configuration/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>", children = [
            { label = "AI Provider", url = "/guide/configuration/ai-provider/" },
            { label = "Chat", url = "/guide/configuration/chat/" },
            { label = "Compact", url = "/guide/configuration/compact/" },
            { label = "Memory", url = "/guide/configuration/memory/" },
            { label = "MCP Servers", url = "/guide/configuration/mcp-servers/" },
            { label = "Data", url = "/guide/configuration/data/" },
            { label = "Safety", url = "/guide/configuration/safety/" },
        ]},
        { label = "Troubleshooting", url = "/guide/reference/troubleshooting/", icon = "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><circle cx='12' cy='12' r='10'/><path d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'/><path d='M12 17h.01'/></svg>" },
    ]},
]
+++

# BraceKit Documentation

Welcome to BraceKit — your AI assistant, right in your browser sidebar.

## What is BraceKit?

BraceKit is a Chrome Extension (Manifest V3) that brings AI-powered assistance directly into your browser. It reads page content, understands your context, and lets you chat with multiple LLM providers without switching tabs.

### Key Features

| Feature | Description |
|---------|-------------|
| **Streaming Chat** | Real-time responses with markdown rendering |
| **AI Floating Toolbar** | Instant AI actions when you select text on any page |
| **Page Context** | AI reads and understands the current webpage |
| **Text Selection** | Select any text and ask questions about it |
| **Multi-Provider** | OpenAI, Claude, Gemini, xAI, DeepSeek, Ollama, and custom |
| **MCP Support** | Connect external tool servers for extended capabilities |
| **Memory System** | AI remembers your preferences across conversations |
| **Conversation Branching** | Explore alternatives without losing context |
| **Image Generation** | Create images with Gemini or xAI models |
| **PIN Protection** | Secure your API keys and conversations |

## Quick Start

Get up and running in 2 minutes:

1. **[Install the extension](/guide/getting-started/installation/)** — Build from source or download
2. **[Configure your provider](/guide/getting-started/first-chat/)** — Add your API key
3. **Start chatting** — Ask questions about any webpage

## Documentation Sections

### [Getting Started](/guide/getting-started/)
New to BraceKit? Start here. Learn how to install, configure, and send your first message.

### [Core Features](/guide/core-features/)
Deep dive into essential features: chat interface, page context, text selection, branching, and file attachments.

### [AI Providers](/guide/ai-providers/)
Setup guides for each supported AI provider, including local models via Ollama.

### [Advanced](/guide/advanced/)
Power user features: MCP servers, memory system, auto-compact, image generation, and security.

### [Reference](/guide/reference/)
Configuration options, keyboard shortcuts, and troubleshooting guides.

## Need Help?

- **Found a bug?** [Open an issue on GitHub](#)
- **Have a feature request?** We'd love to hear from you!
