+++
title = "Provider Settings"
description = "Configure API keys, models, and custom endpoints for each AI provider in BraceKit."
weight = 31
template = "page.html"

[extra]
category = "Configuration"
+++

Configure API keys and endpoints under **Settings → Providers**.

## API Keys

Each provider has its own API key field. Keys are stored encrypted in extension storage and are never transmitted to BraceKit servers.

| Provider | Where to get a key |
|---|---|
| **OpenAI** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) |
| **xAI** | [console.x.ai](https://console.x.ai) |
| **DeepSeek** | [platform.deepseek.com](https://platform.deepseek.com) |

> Only providers with a configured API key will appear in the model selector.

## Custom Endpoint (OpenAI-compatible)

For local models (Ollama, LM Studio, Jan.ai) or self-hosted proxies, configure a custom base URL under **Settings → Providers → Custom**:

| Field | Example value |
|---|---|
| Base URL | `http://localhost:11434/v1` |
| API Key | `ollama` (any non-empty string for local) |
| Default model | `llama3.2:latest` |

```
Settings → Providers → Custom → Base URL
Settings → Providers → Custom → API Key
```

> **Tip:** BraceKit fetches the model list from `/v1/models` automatically. If your server doesn't support this, type a model name manually in the model field.

## Ollama

Ollama requires no API key. Set the base URL to `http://localhost:11434/v1` and leave the API Key field as any non-empty string (e.g. `ollama`).

```bash
# Start Ollama server
ollama serve

# Pull a model
ollama pull llama3.2
```

BraceKit will list all models you've pulled via `ollama pull`.

## Model Selection

Once a provider is configured, click the provider/model selector in the BraceKit toolbar to switch between models. Switching is instant — your current conversation context carries over.
