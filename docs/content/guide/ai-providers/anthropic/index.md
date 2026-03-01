+++
title = "Anthropic (Claude)"
description = "Configure Claude models in BraceKit."
weight = 32
template = "page.html"

[extra]
category = "AI Providers"
+++

# Anthropic (Claude)

Anthropic's Claude models are known for nuanced understanding, careful reasoning, and strong safety practices.

## Setup

### 1. Get an API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign in or create an account
3. Navigate to API Keys
4. Create a new key

### 2. Configure in BraceKit

1. Open **Settings**
2. Select the **AI** tab
3. Choose **Anthropic** from the provider dropdown
4. Paste your API key
5. Select a model

## Available Models

| Model | API ID | Best For | Context |
|-------|--------|----------|---------|
| **Claude Opus 4.6** | claude-opus-4-6 | Most complex tasks, coding | 200K / 1M |
| **Claude Sonnet 4.6** | claude-sonnet-4-6 | Best balance of speed and intelligence | 200K / 1M |
| **Claude Haiku 4.5** | claude-haiku-4-5-20251001 | Fast responses, high volume | 200K |
| **Claude Sonnet 4** | claude-sonnet-4-20250514 | Previous generation | 200K |
| **Claude 3.5 Sonnet** | claude-3-5-sonnet-20241022 | Legacy | 200K |
| **Claude 3.5 Haiku** | claude-3-5-haiku-20241022 | Legacy, fast | 200K |

> **Note:** Claude 3 Opus was retired in January 2026. Use Claude Opus 4.6 instead.

## Features

### Extended Thinking

Claude supports extended thinking, which shows the model's reasoning process:

1. Click the **brain icon** (🧠) in the toolbar
2. Send your message
3. Claude shows its thinking process

```
┌─────────────────────────────────────┐
│ 🧠 Thinking...                    ▾ │
├─────────────────────────────────────┤
│ The user is asking about async/    │
│ await. I should cover:             │
│ 1. What it is                      │
│ 2. How it works with Promises      │
│ 3. Common patterns and pitfalls    │
└─────────────────────────────────────┘

Async/await is syntactic sugar...
```

All current Claude models support extended thinking. Claude Opus 4.6 and Sonnet 4.6 also support adaptive thinking.

### Vision

Claude models support image analysis:

1. Attach an image to your message
2. Ask a question about it
3. Claude analyzes and responds

### Function Calling

Claude supports tool calling for:
- MCP server tools
- Built-in tools (Google Search)

### Large Context

Claude models support up to 200K tokens (1M in beta for Opus/Sonnet 4.6):
- Analyze entire codebases
- Process long documents
- Extended conversations

## Extended Thinking Settings

Extended thinking uses additional tokens for reasoning:

| Setting | Effect |
|---------|--------|
| **Enabled** | Shows thinking process, uses more tokens |
| **Disabled** | Standard responses, fewer tokens |

> **Note:** Extended thinking uses more tokens and costs more. The thinking tokens are counted in your API usage.

## Model Parameters

Configure in **Settings → Chat** (Model Parameters section):

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-1 | Higher = more creative |
| **Max Tokens** | 1-128K | Maximum response length |

### Recommended Settings

| Use Case | Temperature | Max Tokens |
|----------|-------------|------------|
| Code generation | 0.3 | 4096 |
| General chat | 0.7 | Default |
| Analysis | 0.5 | 8192 |
| Creative writing | 0.9 | 8192 |

## Pricing

Anthropic charges per token. Approximate costs:

| Model | Input (per 1M) | Output (per 1M) |
|-------|----------------|-----------------|
| Claude Opus 4.6 | $5.00 | $25.00 |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| Claude Haiku 4.5 | $1.00 | $5.00 |

> **Note:** Extended thinking uses additional tokens. Check [Anthropic pricing](https://anthropic.com/pricing) for current rates.

## Troubleshooting

### "Overloaded"

Claude sometimes returns "overloaded" errors during peak times:
- Wait a moment and retry
- Try a different model (Haiku is more available)

### "Context length exceeded"

- Your conversation is too long
- Use `/compact` to summarize
- Start a new conversation

### Extended thinking not showing

- Ensure the brain icon is toggled on
- Check you're using a Claude model
- Some queries may not trigger extended thinking

### Model not available

- Verify your API key has access to the model
- Check if the model ID is correct
- Some models may require special access

## Related

- [OpenAI](/guide/ai-providers/openai/) — GPT models
- [Gemini](/guide/ai-providers/gemini/) — Google models
- [Extended Thinking](/guide/core-features/chat/#reasoning--extended-thinking) — Feature details
