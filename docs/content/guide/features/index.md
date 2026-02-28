+++
title = "Features"
description = "A deep dive into everything BraceKit can do — from AI chat to MCP tool calling."
weight = 20
template = "page.html"

[extra]
category = "Core Concepts"
icon = "<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2'/></svg>"
+++

BraceKit is more than a chat widget — it's a fully-featured AI workspace embedded directly into your browser.

## Streaming AI Chat

Every response streams in real time, token by token — no waiting for the full response to load. Markdown renders live as it arrives: code blocks, tables, lists, and all formatting.

BraceKit supports **reasoning models** such as `o1`, `o3`, and Claude's extended thinking. When a model emits a `<thinking>` block, BraceKit renders it in a collapsible section so you can follow the model's reasoning without cluttering your answer.

```
User: Explain async/await in 3 sentences.

BraceKit: [Thinking... ▾]
  The user wants a concise explanation. I should cover
  the Promise relationship, the syntax benefit, and error handling.

Async/await is syntactic sugar over JavaScript Promises that lets
you write asynchronous code in a synchronous style...
```

### Supported message types

| Type | Description |
|---|---|
| Text | Full markdown rendering with syntax highlighting |
| Images | Inline image display (multimodal models) |
| Tool calls | Expandable tool call / result blocks |
| Reasoning | Collapsible `<thinking>` sections |
| Branches | Fork any message to explore alternatives |

---

## Page Context

Click the **Page Context** button (📄) to inject the full text of your current tab into your message. Ask questions about any article, documentation page, or web app — without copy-pasting.

You can also **highlight text** on the page. BraceKit detects your selection and offers to include just the excerpt.

### What gets read

- Visible text content (paragraphs, headings, lists)
- Code blocks and pre-formatted text on the page
- Table data
- Alt text from images

> **Note:** BraceKit does not read password fields or content hidden behind login walls.

### Text selection toolbar

When you highlight text on any page, a floating toolbar appears offering:

- **Explain** — Ask BraceKit to explain the selected text
- **Summarize** — Condense the selection
- **Translate** — Translate to a chosen language
- **Custom** — Open BraceKit with the selection pre-filled

---

## MCP Tool Support

BraceKit implements the **Model Context Protocol (MCP)**, letting you connect external tool servers to AI conversations. Configure servers in `.mcp.json` and they'll appear as callable tools in every chat session.

### Built-in tools

| Tool | Description |
|---|---|
| `google_search` | Search the web via Google Custom Search API |
| `continue_message` | Continue generating if a response was cut off |

### Adding MCP servers

1. Open **Settings → MCP Servers**
2. Paste your server command, e.g.:
   ```bash
   npx -y @modelcontextprotocol/server-filesystem ./
   ```
3. Click **Save** — BraceKit connects to the server automatically

### Example: filesystem server

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

Once connected, the model can read, write, and search files in your project directory.

---

## Multi-Provider Support

Switch AI providers without leaving the sidebar. BraceKit supports:

| Provider | Models |
|---|---|
| **OpenAI** | GPT-4o, o1, o3-mini, and all latest models |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku |
| **Google Gemini** | Gemini 1.5 Pro, Flash, 2.0 series |
| **xAI** | Grok-2, Grok-Beta |
| **DeepSeek** | DeepSeek-V3, R1 |
| **Ollama** | Any locally-running model |
| **Custom** | Any OpenAI-compatible endpoint |

Provider switching is instant — your conversation context carries over automatically.

---

## Memory & Conversation History

BraceKit persists your conversation history locally using Chrome's `storage.local` API. You can:

- **Branch** any conversation to explore alternative answers
- **Name** conversations for quick retrieval
- **Export** as Markdown for archival or sharing

### Branching

Click the branch icon (⑂) on any assistant message to create a fork from that point. Explore a different question, change the system prompt, or switch models — the original conversation is preserved.

---

## File Attachments

Drag and drop or paste images directly into the input area. BraceKit converts them to base64 and passes them to multimodal models automatically.

**Supported by:**
- GPT-4o Vision (OpenAI)
- Claude 3 series (Anthropic)
- Gemini Pro Vision (Google)

---

## PIN Protection

Sensitive API keys are protected behind an optional PIN. Enable it under **Settings → Security**. BraceKit will prompt for your PIN whenever you reopen the sidebar after the browser has been idle for the configured timeout.

```
Settings → Security → Enable PIN
Settings → Security → PIN Timeout: 15 minutes (default)
```
