+++
title = "xAI (Grok)"
description = "Configure xAI Grok models in BraceKit."
weight = 34
template = "page.html"

[extra]
category = "AI Providers"
+++

# xAI (Grok)

xAI's Grok models offer frontier-level reasoning with exceptional cost efficiency. BraceKit supports both chat and image generation.

## Setup

### 1. Get an API Key

1. Go to [console.x.ai](https://console.x.ai)
2. Sign in or create an account
3. Navigate to API Keys
4. Create a new key

### 2. Configure in BraceKit

1. Open **Settings → AI Provider**
2. Select **xAI** from the provider dropdown
3. Paste your API key
4. Select a model

Settings are saved automatically as you type.

## Available Models

### Current Flagship

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **grok-4.5** | Coding, agentic tasks | 500K | Current flagship, configurable reasoning |
| **grok-4.3** | Balanced workloads | 1M | Strong reasoning + tool use |

### Grok 4.20 Series

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **grok-4.20-0309-reasoning** | Complex reasoning | 1M | Extended thinking (alias `grok-4.20`) |
| **grok-4.20-0309-non-reasoning** | Fast responses | 1M | Quick, no reasoning (alias `grok-4.20-non-reasoning`) |
| **grok-4.20-multi-agent-0309** | Multi-agent workflows | 1M | Coordinated agent runs |

### Coding & Media

| Model | Best For | Notes |
|-------|----------|-------|
| **grok-build-0.1** | Agentic coding | Code-first model |
| **grok-imagine-image** | Image generation | Standard quality |
| **grok-imagine-image-pro** | Image generation | Higher quality |
| **grok-imagine-image-quality** | Image generation | Quality-tuned |

## Features

### Reasoning Mode

Grok 4.x models are reasoning models that show their thinking process:

1. Click the brain icon (🧠) in the toolbar
2. Send your message
3. View the reasoning in a collapsible section

> **Note:** Reasoning can be toggled per request. Use the `-non-reasoning` variants (e.g. `grok-4.20-0309-non-reasoning`) for quick responses without extended thinking.

### Image Generation

Generate images with Grok:

1. Select an image model (e.g., `grok-imagine-image`)
2. Choose an aspect ratio in the toolbar
3. Describe the image
4. Image appears in the response

```
You: Generate a futuristic city skyline at sunset

BraceKit: [Generated image appears here]
```

See [Image Generation](/guide/advanced/image-generation/) for details.

### Function Calling

Grok models support tool calling for:
- MCP server tools
- Built-in tools (Google Search)

### Vision

Grok Vision models can analyze images:
- Attach images to messages
- Ask questions about them

## Model Parameters

Configure in **Settings → AI Provider** under the **Advanced** section:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-2 | Higher = more creative |
| **Max Tokens** | 1-131K | Maximum response length |

> **Note:** Reasoning models (Grok 4.x) don't support `presencePenalty`, `frequencyPenalty`, or `stop` parameters.

## Image Generation Settings

| Aspect Ratio | Best For |
|--------------|----------|
| auto | Model selects best (xAI only) |
| 1:1 | Profile pictures, icons |
| 16:9 | Banners, headers |
| 9:16 | Stories, mobile |
| 3:2 | Photography |
| 2:3 | Portrait photography |

## Pricing

xAI pricing (per 1M tokens):

| Model | Input | Output | Context |
|-------|-------|--------|---------|
| grok-4.5 | $2.00 | $6.00 | 500K |
| grok-4.3 | $1.25 | $2.50 | 1M |
| grok-4.20-0309-reasoning | $1.25 | $2.50 | 1M |
| grok-4.20-0309-non-reasoning | $1.25 | $2.50 | 1M |

> **Note:** Check [xAI pricing](https://docs.x.ai/developers/models) for current rates. Image generation priced separately.

## Troubleshooting

### "API key invalid"

- Verify your key is correct
- Check the key hasn't been revoked
- Ensure you have credits in your account

### "Parameter not supported"

- Reasoning models don't support `presencePenalty`, `frequencyPenalty`, `stop`
- Remove these parameters from your request

### Image generation slow

- Image generation takes 10-30 seconds
- Complex prompts take longer
- Try simpler prompts for faster results

### Model not available

- Some models require API tier upgrade
- Check [xAI Console](https://console.x.ai/team/default/models) for your access

## Related

- [Gemini](/guide/ai-providers/gemini/) — Alternative image generation
- [Image Generation](/guide/advanced/image-generation/) — Full guide
- [Configuration](/guide/reference/configuration/) — All settings
