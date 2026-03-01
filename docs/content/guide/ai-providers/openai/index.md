+++
title = "OpenAI"
description = "Configure OpenAI GPT models in BraceKit."
weight = 31
template = "page.html"

[extra]
category = "AI Providers"
+++

# OpenAI

OpenAI provides GPT models for general tasks and o-series models for complex reasoning. The GPT-5 series offers the latest capabilities with improved agentic performance.

## Setup

### 1. Get an API Key

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-`)

### 2. Configure in BraceKit

1. Open **Settings**
2. Select **AI** tab
3. Select **OpenAI** from the provider dropdown
4. Paste your API key in the API Key field
5. Select a model from the dropdown

Settings are saved automatically when you make changes.

## Available Models

### GPT-5 Series (Recommended)

The latest generation with improved reasoning and agentic capabilities.

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **gpt-5** | General purpose, coding, agentic tasks | 400K | Balanced performance |
| **gpt-5-mini** | Fast, cost-efficient for well-defined tasks | 400K | Cheaper, faster |
| **gpt-5-nano** | Simple tasks, high volume | 128K | Fastest, cheapest |
| **gpt-5.1** | Enhanced reasoning with configurable effort | 400K | Higher reasoning |
| **gpt-5.2** | Best for coding and agentic tasks | 400K | Latest capabilities |
| **gpt-5.2-pro** | Maximum precision and reasoning | 400K | Slowest, most expensive |

### GPT-4.1 Series

Improved GPT-4 with better performance.

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **gpt-4.1** | General purpose, reliable | 128K | Improved GPT-4 |
| **gpt-4.1-mini** | Fast, affordable alternative | 128K | Cheaper than GPT-5 |

### GPT-4o Series

Multimodal models with vision support.

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **gpt-4o** | Multimodal (text + images) | 128K | Vision support |
| **gpt-4o-mini** | Fast multimodal tasks | 128K | Cheaper vision |

### Reasoning Models (o-series)

Models that show their thinking process for complex problems.

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **o1** | Complex reasoning, math, coding | 200K | Shows reasoning |
| **o1-pro** | Highest reasoning quality | 200K | Pro-level thinking |
| **o3** | Advanced reasoning successor | 200K | Better than o1 |
| **o3-mini** | Fast reasoning tasks | 200K | Cheaper reasoning |
| **o3-pro** | Maximum reasoning depth | 200K | Best for hard problems |
| **o4-mini** | Efficient reasoning | 200K | Latest mini reasoning |

> **Note:** Model availability depends on your OpenAI account tier and API access. Some models (like o3-pro, gpt-5.2-pro) may require higher tier access.

## Features

### Reasoning Models (o-series)

The o-series models (o1, o3, o4) show their reasoning process:

```
┌─────────────────────────────────────┐
│ 🧠 Thinking...                    ▾ │
├─────────────────────────────────────┤
│ Let me work through this step by   │
│ step...                             │
└─────────────────────────────────────┘

Based on my analysis...
```

This happens automatically with all o-series models. The thinking process helps with:
- Complex math and logic problems
- Multi-step coding tasks
- Detailed analysis and planning

### Vision (Image Input)

All GPT-4o and GPT-5 models support image analysis:

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

Configure in **Settings → AI** (under the provider configuration):

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

- **o-series models** (o1, o3, o4) are slower by design — they "think" before responding
- **Pro models** (o3-pro, gpt-5.2-pro) take even longer for deeper reasoning
- For faster responses, use **gpt-4o**, **gpt-5-mini**, or **gpt-4o-mini**

## Related

- [Anthropic](/guide/ai-providers/anthropic/) — Claude models
- [Gemini](/guide/ai-providers/gemini/) — Google models
- [Configuration](/guide/reference/configuration/) — All settings
