+++
title = "Google Gemini"
description = "Configure Google Gemini models in BraceKit."
weight = 33
template = "page.html"

[extra]
category = "AI Providers"
+++

# Google Gemini

Google's Gemini models offer strong performance with unique features like Google Search grounding, extended thinking, and built-in image generation.

## Setup

### 1. Get an API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API Key"
4. Create a new key or copy existing

### 2. Configure in BraceKit

1. Open **Settings → Providers**
2. Select **Gemini** from the provider dropdown
3. Paste your API key
4. Select a model from the dropdown (models are fetched automatically)
5. Settings are saved automatically

## Available Models

> **Note:** Models are fetched dynamically from Google's API based on your API key.

### Current Stable Models

| Model | Best For | Context | Notes |
|-------|----------|---------|-------|
| **gemini-2.5-flash** | General use | 1M | Best price-performance, fast |
| **gemini-2.5-pro** | Complex tasks | 1M | Most capable, deep reasoning |
| **gemini-2.5-flash-lite** | Simple tasks | 1M | Ultra-low latency, cost-efficient |

### Image Generation Models

| Model | Best For |
|-------|----------|
| **gemini-2.5-flash-image** | Native image generation and editing |

### Thinking Models

Gemini 2.5 Pro supports extended thinking for complex reasoning:
- Click the **brain icon** (🧠) in the toolbar to enable
- The model shows its reasoning process before the response

> **Note:** Image generation models don't support extended thinking or Google Search.

## Special Features

### Google Search Grounding

Gemini can use Google Search to provide up-to-date information:

1. Click the **Google icon** in the toolbar (when using Gemini)
2. Send your message
3. Gemini searches and includes sources

```
You: What are the latest features in React 19?

BraceKit: [Uses Google Search]

Based on recent information, React 19 includes:

1. **Actions** — New way to handle form submissions
2. **use() hook** — Read resources in render
3. **Server Components** — Improved support

Sources:
- react.dev/blog
- github.com/facebook/react
```

> **Note:** Google Search grounding is not available on image generation models.

### Image Generation

Generate images directly in chat:

1. Select `gemini-2.5-flash-image` model
2. Choose an aspect ratio in the toolbar
3. Describe the image you want
4. The image appears in the response

See [Image Generation](/guide/advanced/image-generation/) for full details.

### Vision

All Gemini models support image analysis:
- Attach images to messages
- Ask questions about them
- Get detailed analysis

### Large Context

Gemini models support large context windows (up to 1M tokens):
- Analyze entire documents
- Process large codebases
- Extended conversations

## Model Parameters

Configure in **Settings → Providers** under Model Parameters:

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Temperature** | 0-2 | Higher = more creative |
| **Max Tokens** | 1-128K | Maximum response length |
| **Top P** | 0-1 | Nucleus sampling |
| **Top K** | 1-100 | Token selection limit |

## Aspect Ratios for Image Generation

When using `gemini-2.5-flash-image`:

| Ratio | Best For |
|-------|----------|
| 1:1 | Profile pictures, icons |
| 16:9 | Banners, headers |
| 9:16 | Stories, mobile |
| 4:3 | Standard photos |
| 3:4 | Portraits |
| 3:2 | Photography |
| 2:3 | Portrait photography |
| 4:5 | Instagram posts |
| 5:4 | Landscape orientation |
| 21:9 | Ultrawide, cinematic |

> **Note:** Gemini doesn't support "auto" aspect ratio. Select a specific ratio.

## Deprecated Models

The following models are deprecated or being phased out. Migrate to newer versions:

| Deprecated Model | Migrate To | Date |
|-----------------|------------|------|
| gemini-1.5-pro | gemini-2.5-pro | Sept 2025 |
| gemini-1.5-flash | gemini-2.5-flash | Sept 2025 |
| gemini-2.0-flash | gemini-2.5-flash | June 2026 |

Check [Google's deprecations page](https://ai.google.dev/gemini-api/docs/deprecations) for the latest information.

## Pricing

Google offers generous free tiers. Check [Google AI pricing](https://ai.google.dev/pricing) for current rates.

## Troubleshooting

### "Quota exceeded"

- You've hit the free tier limit
- Wait for the quota to reset
- Or upgrade to paid tier

### Image generation failed

- Ensure you're using `gemini-2.5-flash-image`
- Check your prompt doesn't violate safety guidelines
- Try a simpler prompt

### Google Search not working

- Ensure the Google Search toggle is on
- Image generation models don't support search
- Some queries may not trigger search
- Check your API key has search access

### Models not loading

- Verify your API key is correct
- Check network connection
- Try refreshing the model list

### "Model not found" error

- The model may have been deprecated
- Check the [deprecations page](https://ai.google.dev/gemini-api/docs/deprecations)
- Switch to a newer model version

## Related

- [Image Generation](/guide/advanced/image-generation/) — Full guide
- [OpenAI](/guide/ai-providers/openai/) — GPT models
- [xAI](/guide/ai-providers/xai/) — Alternative image generation
- [Google AI Studio](https://aistudio.google.com) — Get API keys

Sources:
- [Gemini API Changelog](https://ai.google.dev/gemini-api/docs/changelog)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Models](https://ai.google.dev/gemini-api/docs/models)
