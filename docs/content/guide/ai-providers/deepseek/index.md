+++
title = "DeepSeek"
description = "Configure DeepSeek models in BraceKit."
weight = 35
template = "page.html"

[extra]
category = "AI Providers"
+++

# DeepSeek

DeepSeek offers powerful models at competitive prices, with **DeepSeek-V4** powering both chat and reasoning modes.

## Setup

### 1. Get an API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Sign in or create an account
3. Navigate to API Keys
4. Create a new key

### 2. Configure in BraceKit

1. Open **Settings → AI Provider**
2. Select **DeepSeek** from the provider dropdown
3. Paste your API key
4. Select a model

Settings are saved automatically as you type.

## Available Models

DeepSeek's current lineup is powered by **DeepSeek-V4**:

| Model | Mode | Best For | Context | Max Output |
|-------|------|----------|---------|------------|
| **deepseek-v4-flash** | Thinking / Non-thinking | General chat, code, high-throughput tasks | 1M | 384K tokens |
| **deepseek-v4-pro** | Thinking / Non-thinking | Complex reasoning, agentic coding, analysis | 1M | 384K tokens |

> Note: the legacy `deepseek-chat` and `deepseek-reasoner` names were retired on July 24, 2026 — they now route to `deepseek-v4-flash`.

## Features

### Reasoning (Thinking Mode)

The `deepseek-v4-pro` model shows its Chain-of-Thought reasoning process when thinking mode is enabled:

```
┌─────────────────────────────────────┐
│ 🧠 Thinking...                    ▾ │
├─────────────────────────────────────┤
│ Let me analyze this problem...      │
│                                     │
│ Step 1: Identify the key variables  │
│ Step 2: Consider edge cases         │
│ Step 3: Formulate solution          │
└─────────────────────────────────────┘

Based on my analysis...
```

This happens automatically with the reasoner model.

### Function Calling

DeepSeek supports tool calling for:
- MCP server tools
- Built-in tools (Google Search)

### Cost-Effective

DeepSeek offers very competitive pricing while maintaining high quality.

## Model Parameters

Configure in **Settings → AI Provider** under the **Advanced** section:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-2 | Higher = more creative |
| **Max Tokens** | 1-8K (chat) / 1-64K (reasoner) | Maximum response length |

### Recommended Settings

| Use Case | Model | Temperature |
|----------|-------|-------------|
| Code generation | deepseek-v4-flash | 0.3 |
| General chat | deepseek-v4-flash | 0.7 |
| Complex reasoning | deepseek-v4-pro | 0.5 |
| Math/Logic | deepseek-v4-pro | 0.0 |

## Pricing

DeepSeek V4 offers **unified pricing** for both models with automatic context caching:

| Type | Price (per 1M tokens) |
|------|----------------------|
| **Input (Cache Hit)** | $0.028 |
| **Input (Cache Miss)** | $0.28 |
| **Output** | $0.42 |

**Cache Benefits:**
- Automatic context caching (enabled by default)
- 90% discount on cached input tokens
- Shared prefix across requests triggers caching

> **Note:** Check [DeepSeek pricing](https://api-docs.deepseek.com/) for current rates.

## Troubleshooting

### "Rate limit exceeded"

- Wait a moment and retry
- Check your usage limits in the console

### Reasoning not showing

- Ensure you're using `deepseek-v4-pro` (not the flash variant) for complex reasoning
- The thinking mode is optimized for complex queries (math, logic, code)
- Simple queries may not trigger extended Chain-of-Thought

### Slow responses

- The reasoner model takes longer to "think"
- For faster responses, use `deepseek-v4-flash`

## Related

- [OpenAI](/guide/ai-providers/openai/) — Alternative with reasoning models
- [Anthropic](/guide/ai-providers/anthropic/) — Alternative with extended thinking
- [Ollama](/guide/ai-providers/ollama/) — Free local alternative
