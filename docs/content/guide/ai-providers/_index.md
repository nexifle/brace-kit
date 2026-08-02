+++
title = "AI Providers"
description = "Configure and switch between AI providers in BraceKit."
sort_by = "weight"
template = "section.html"
weight = 30

[extra]
category = "AI Providers"
+++

# AI Providers

BraceKit supports multiple AI providers, letting you switch between models instantly without leaving the sidebar. Each provider has its own configuration, and you can use multiple providers simultaneously.

## Supported Providers

| Provider | Type | Models | Special Features |
|----------|------|--------|------------------|
| **[OpenAI](/guide/ai-providers/openai/)** | Cloud | GPT-5.6 (Sol/Terra/Luna), GPT-5.5 | Reasoning models |
| **[Anthropic](/guide/ai-providers/anthropic/)** | Cloud | Claude Opus 5, Sonnet 5, Haiku 4.5 | Extended thinking |
| **[Gemini](/guide/ai-providers/gemini/)** | Cloud | Gemini 3.6 Flash, 3.5 Flash, 3.1 Pro | Google Search, Image gen |
| **[xAI](/guide/ai-providers/xai/)** | Cloud | Grok 4.5, Grok 4.3, Grok 4.20 | Image generation |
| **[DeepSeek](/guide/ai-providers/deepseek/)** | Cloud | DeepSeek V4 (Flash, Pro) | Thinking mode |
| **[Ollama](/guide/ai-providers/ollama/)** | Local | Any model | Offline, Private |
| **[Custom](/guide/ai-providers/custom/)** | Any | Any | Multi-format (OpenAI, Anthropic, Gemini, Ollama) |

## Quick Setup

### Step 1: Open Settings

1. Click the **Settings** icon (⚙️) in the header
2. Navigate to **AI Provider** tab

### Step 2: Select Provider

Open the provider dropdown and pick a provider — search for it or use the keyboard (↑↓ to navigate, Enter to select). The configuration fields below update to reflect the selected provider. Use the **+ Add** button to register a custom provider.

### Step 3: Enter API Key

Each provider requires an API key (except Ollama):

| Provider | Get API Key |
|----------|-------------|
| OpenAI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| Gemini | [aistudio.google.com](https://aistudio.google.com) |
| xAI | [console.x.ai](https://console.x.ai) |
| DeepSeek | [platform.deepseek.com](https://platform.deepseek.com) |

### Step 4: Select Model

Choose a model from the dropdown or type a custom model name.

### Step 5: Done

Settings are saved automatically as you type. The provider is now active.

## Switching Providers

To switch between configured providers:

1. Click the **provider button** in the input toolbar (e.g., "OpenAI ▾")
2. Select a different provider from the grid
3. Choose a model
4. Continue chatting — context is preserved

> **Note:** Your conversation context carries over when switching providers. The new provider sees the same message history.

## Provider Features

### Reasoning / Extended Thinking

Some models can show their reasoning process:

| Provider | Models | How to Enable |
|----------|--------|---------------|
| Anthropic | Claude Opus 5, Sonnet 5 | Click brain icon (🧠) |
| OpenAI | GPT-5.6 (reasoning levels) | Automatic |
| Gemini | 3.6 Flash, 3.1 Pro, Thinking models | Click brain icon (🧠) |
| xAI | Grok 4.5, Grok 4.20 reasoning | Automatic (reasoning models) |
| DeepSeek | V4 (thinking mode) | Automatic |
| Ollama | With think mode | Click brain icon |

### Function Calling / Tools

Most models support tool calling for MCP and built-in tools:

| Provider | Tool Support |
|----------|--------------|
| OpenAI | ✅ Full |
| Anthropic | ✅ Full |
| Gemini | ✅ Full (image models limited) |
| xAI | ✅ Full |
| DeepSeek | ✅ Full |
| Ollama | ⚠️ Limited |

### Image Generation

Generate images directly in chat:

| Provider | Models | Aspect Ratios |
|----------|--------|---------------|
| Gemini | gemini-3-pro-image, gemini-3.1-flash-image | 1:1, 16:9, 9:16, etc. |
| xAI | grok-imagine-image, grok-imagine-image-pro | 1:1, 16:9, 9:16, etc. |

### Vision (Image Input)

Send images for analysis:

| Provider | Vision Models |
|----------|---------------|
| OpenAI | GPT-5.6, GPT-5.5, GPT-5.4 |
| Anthropic | Claude Opus 5, Sonnet 5 |
| Gemini | All Gemini models |
| xAI | Grok 4.5, Grok 4.3 |
| Ollama | llava, bakllava |

## API Key Security

Your API keys are:
- **Stored locally** in Chrome's extension storage
- **Never sent** to BraceKit servers
- **Only used** to authenticate with the AI provider

## Multiple API Keys

You can configure multiple providers simultaneously:

1. Set up OpenAI with your OpenAI key
2. Set up Anthropic with your Anthropic key
3. Set up Gemini with your Google key
4. Switch between them as needed

Each provider stores its own key independently.

## Custom Endpoints

For self-hosted or proxy services, add a custom provider:

1. Click the **+ Add** button next to the provider dropdown
2. Fill in the **Name**, **Format**, and **Base URL**:
   - **OpenAI** format — LM Studio, vLLM, OpenRouter, Azure OpenAI
   - **Anthropic** format — Anthropic-compatible proxies
   - **Gemini** format — Gemini-compatible proxies
   - **Ollama** format — Ollama native API
3. Click **Save Provider**, then enter your API key in the Configuration section

See the [Custom Provider guide](/guide/ai-providers/custom/) for details.

## Troubleshooting

### "No models available"

- Check your API key is valid
- Verify the API key has the right permissions
- Try typing a model name manually

### "API request failed"

- Check your internet connection
- Verify the API endpoint URL is correct
- Ensure your API key has sufficient credits

### "Model not responding"

- Some models (gpt-5.6-sol at high reasoning levels) take longer to respond
- Check provider status pages for outages
- Try a different model

For more help, see the [Troubleshooting guide](/guide/reference/troubleshooting/).
