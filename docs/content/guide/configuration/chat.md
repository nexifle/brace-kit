+++
title = "Chat Settings"
description = "Control AI response behavior — system prompt, temperature, max tokens, and streaming."
weight = 32
template = "page.html"

[extra]
category = "Configuration"
+++

Control response behavior under **Settings → Chat**.

## System Prompt

A system prompt is prepended to every conversation, acting as persistent instructions for the model. Use it to set tone, formatting rules, or domain-specific context.

```
You are a helpful assistant. Always respond in Markdown.
Format code blocks with the correct language tag.
When asked about code, prefer modern, idiomatic solutions.
Keep responses concise unless the user explicitly asks for detail.
```

> The system prompt applies to all new conversations. Existing conversations are not affected retroactively.

## Temperature

Controls response creativity and randomness:

| Value | Behavior | Best for |
|---|---|---|
| `0.0` | Fully deterministic | Factual Q&A, data extraction |
| `0.3` | Conservative | Code generation, structured output |
| `0.7` | Balanced (default) | General use |
| `1.0` | Creative | Brainstorming, writing |
| `2.0` | Maximum randomness | Experimental only |

## Max Tokens

Sets the maximum number of tokens in a single response. Leave blank to use the provider's default.

> **Warning:** Very high token limits can result in slow responses and increased API costs. Most tasks work well under 4096 tokens.

## Streaming

Streaming is enabled by default. Responses appear token-by-token as they're generated, giving you near-instant feedback.

Disable streaming only if your custom endpoint doesn't support Server-Sent Events (SSE). When disabled, BraceKit waits for the complete response before displaying it.

## Context Window

BraceKit automatically trims conversation history to fit within the model's context window. Older messages are summarized and dropped when the context limit approaches. You can always **branch** a long conversation to start fresh with selected context.
