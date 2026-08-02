+++
title = "OpenAI"
description = "Configure OpenAI GPT models in BraceKit."
weight = 31
template = "page.html"

[extra]
category = "AI Providers"
+++

# OpenAI

OpenAI provides GPT models with configurable reasoning levels. The GPT-5.6 family (Sol, Terra, Luna) offers the latest capabilities with improved agentic performance and tool use.

## Setup

### 1. Get an API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

### 2. Configure in BraceKit

1. Open **Settings**
2. Select **AI Provider** tab
3. Select **OpenAI** from the provider dropdown
4. Paste your API key in the API Key field
5. Select a model from the dropdown

Settings are saved automatically as you type.

Settings are saved automatically when you make changes.

## Available Models

### GPT-5.6 Family (Recommended)

The latest generation. The `gpt-5.6` alias routes to `gpt-5.6-sol`.

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **gpt-5.6-sol** | Complex professional work | 1.05M | Frontier model, all reasoning levels |
| **gpt-5.6-terra** | Balanced intelligence & cost | 1.05M | Strong middle tier |
| **gpt-5.6-luna** | Cost-sensitive, high volume | 1.05M | Fastest, cheapest |

### Previous Generation

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **gpt-5.5** | General purpose | 400K | Previous flagship |
| **gpt-5.4** | General purpose, coding | 1.05M | Prior generation, computer use |
| **gpt-oss** | Open-weight models | 400K | Openly available weights |

### Reasoning (Effort Levels)

GPT-5.x models support configurable reasoning effort: `minimal`, `low`, `medium`, and `high`. The `gpt-5.6` alias routes to `gpt-5.6-sol`.

| Model | Reasoning Levels | Best For |
|-------|------------------|----------|
| **gpt-5.6-sol** | minimal → high | Complex professional work |
| **gpt-5.6-terra** | minimal → high | Balanced intelligence & cost |
| **gpt-5.6-luna** | minimal → high | Cost-sensitive, high volume |

> **Note:** Model availability depends on your OpenAI account tier and API access. Some models may require higher tier access.

## Features

### Reasoning (Effort Levels)

The GPT-5.6 family shows its reasoning process:

```
┌─────────────────────────────────────┐
│ 🧠 Thinking...                    ▾ │
├─────────────────────────────────────┤
│ Let me work through this step by   │
│ step...                             │
└─────────────────────────────────────┘

Based on my analysis...
```

This happens automatically when a reasoning level above `none` is set. The thinking process helps with:
- Complex math and logic problems
- Multi-step coding tasks
- Detailed analysis and planning

### Vision (Image Input)

All GPT-5.6, GPT-5.5 and GPT-5.4 models support image analysis:

1. Attach an image to your message
2. Ask a question about it
3. The model analyzes and responds

Supported formats: PNG, JPEG, GIF, WebP

### Function Calling

OpenAI models support tool calling for:
- MCP server tools
- Built-in tools (Google Search)

### Streaming

All OpenAI models support streaming responses for real-time output.

## Model Parameters

Configure in **Settings → AI Provider** under the **Advanced** section:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-2 | Higher = more creative, lower = more focused |
| **Max Tokens** | 1+ | Maximum response length |
| **Top P** | 0-1 | Controls diversity of word choices |

> **Note:** OpenAI does not support Top K or Thinking Budget parameters. Those are available for Anthropic, Gemini, and Ollama providers.

### Recommended Settings

| Use Case | Temperature | Top P | Max Tokens |
|----------|-------------|-------|------------|
| Code generation | 0.3 | 0.9 | 4096 |
| General chat | 0.7 | 1.0 | Default |
| Creative writing | 1.0 | 1.0 | 8192 |
| Factual Q&A | 0.0 | 0.9 | 2048 |

## Pricing

OpenAI charges per token. Check [OpenAI pricing](https://developers.openai.com/api/docs/pricing) for current rates.

## Troubleshooting

### "Insufficient quota"

- Add credits to your OpenAI account
- Check usage limits at platform.openai.com

### "Model not found"

- Verify the model name is correct
- Some models require organization verification

### Slow responses

- **Higher reasoning levels** (xhigh, max) are slower by design — they "think" before responding
- **Flagship models** (gpt-5.6-sol) take longer for deep reasoning
- For faster responses, use **gpt-5.6-luna** or **gpt-5.6-terra** with a low reasoning level

## Related

- [Anthropic](/guide/ai-providers/anthropic/) — Claude models
- [Gemini](/guide/ai-providers/gemini/) — Google models
- [Configuration](/guide/reference/configuration/) — All settings
