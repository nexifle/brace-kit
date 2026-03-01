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

1. Open **Settings → Providers**
2. Select **xAI (Grok)**
3. Paste your API key
4. Select a model
5. Click **Connect**

## Available Models

### Grok 4.1 Series (Latest)

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **grok-4-1-fast-reasoning** | Complex reasoning | 2M | Extended thinking, best quality |
| **grok-4-1-fast-non-reasoning** | Fast responses | 2M | Quick, capable, cost-efficient |

### Grok 4 Series

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **grok-4** | Complex tasks | 131K | Reasoning model |
| **grok-4-fast-reasoning** | Reasoning | 2M | Faster reasoning variant |
| **grok-4-fast-non-reasoning** | General use | 2M | Fast, no reasoning |

### Grok 3 Series

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **grok-3** | General use | 131K | Balanced performance |
| **grok-3-mini** | Quick tasks | 131K | Faster, cheaper |

### Image Generation

| Model | Best For | Notes |
|-------|----------|-------|
| **grok-2-image-1212** | Image generation | Latest image model |
| **grok-imagine-image** | Image generation | Standard quality |
| **grok-imagine-image-pro** | Image generation | Higher quality |

## Features

### Reasoning Mode

Grok 4 and 4.1 models are reasoning models that show their thinking process:

1. Click the brain icon (🧠) in the toolbar
2. Send your message
3. View the reasoning in a collapsible section

> **Note:** Grok 4 and 4.1 always use reasoning — there's no non-reasoning mode for the base models. Use `grok-4-1-fast-non-reasoning` or `grok-4-fast-non-reasoning` for quick responses without extended thinking.

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

Configure in **Settings → Chat**:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-2 | Higher = more creative |
| **Max Tokens** | 1-131K | Maximum response length |

> **Note:** Reasoning models (Grok 4, Grok 4.1) don't support `presencePenalty`, `frequencyPenalty`, or `stop` parameters.

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
| grok-4-1-fast-reasoning | $0.20 | $0.50 | 2M |
| grok-4-0709 | $3.00 | $15.00 | 131K |
| grok-3 | $3.00 | $15.00 | 131K |
| grok-3-mini | $0.30 | $0.50 | 131K |

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
