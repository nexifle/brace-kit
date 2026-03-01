+++
title = "DeepSeek"
description = "Configure DeepSeek models in BraceKit."
weight = 35
template = "page.html"

[extra]
category = "AI Providers"
+++

# DeepSeek

DeepSeek offers powerful models at competitive prices, with V3.2 powering both chat and reasoning modes.

## Setup

### 1. Get an API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Sign in or create an account
3. Navigate to API Keys
4. Create a new key

### 2. Configure in BraceKit

1. Open **Settings → AI Provider**
2. Select **DeepSeek**
3. Paste your API key
4. Select a model
5. Click **Save**

## Available Models

Both models are powered by **DeepSeek-V3.2** with different modes:

| Model | Mode | Best For | Context | Max Output |
|-------|------|----------|---------|------------|
| **deepseek-chat** | Non-thinking | General chat, code, summarization | 128K | 8K tokens |
| **deepseek-reasoner** | Thinking | Math, logic, complex analysis | 128K | 64K tokens |

## Features

### Reasoning (Thinking Mode)

The `deepseek-reasoner` model shows its Chain-of-Thought reasoning process:

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

Configure in **Settings → Chat**:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-2 | Higher = more creative |
| **Max Tokens** | 1-8K (chat) / 1-64K (reasoner) | Maximum response length |

### Recommended Settings

| Use Case | Model | Temperature |
|----------|-------|-------------|
| Code generation | deepseek-chat | 0.3 |
| General chat | deepseek-chat | 0.7 |
| Complex reasoning | deepseek-reasoner | 0.5 |
| Math/Logic | deepseek-reasoner | 0.0 |

## Pricing

DeepSeek V3.2 offers **unified pricing** for both models with automatic context caching:

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

- Ensure you're using `deepseek-reasoner` (not `deepseek-chat`)
- The thinking mode is optimized for complex queries (math, logic, code)
- Simple queries may not trigger extended Chain-of-Thought

### Slow responses

- The reasoner model takes longer to "think"
- For faster responses, use `deepseek-chat`

## Related

- [OpenAI](/guide/ai-providers/openai/) — Alternative with reasoning models
- [Anthropic](/guide/ai-providers/anthropic/) — Alternative with extended thinking
- [Ollama](/guide/ai-providers/ollama/) — Free local alternative
