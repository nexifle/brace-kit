+++
title = "Custom Provider"
description = "Connect to any AI API endpoint with multiple format support."
weight = 37
template = "page.html"

[extra]
category = "AI Providers"
+++

# Custom Provider

Connect BraceKit to any AI API endpoint with support for multiple formats: OpenAI, Anthropic, Gemini, and Ollama. Perfect for self-hosted models, proxies, or alternative services.

## Use Cases

- **Local models**: LM Studio, Jan.ai, LocalAI
- **Proxies**: OpenRouter, Azure OpenAI
- **Self-hosted**: vLLM, TGI, text-generation-webui
- **Alternative services**: Any OpenAI-compatible API

## Setup

### 1. Open Settings

1. Click **Settings** (⚙️)
2. Go to **AI Provider** tab

### 2. Add Custom Provider

Click the **+ Add** button in the provider grid and fill in:

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Display name | "LM Studio" |
| **Format** | API format | OpenAI, Anthropic, Gemini, Ollama |
| **Base URL** | API endpoint | `http://localhost:1234/v1` |

Click **Save Provider** to create it.

### 3. Configure and Use

1. The new provider appears in the provider grid — click to select it
2. Enter your **API Key** in the Configuration section (or leave empty for local servers)
3. Add or select a **Model** in the Configuration section

## API Formats

BraceKit supports multiple API formats:

### OpenAI Format

The most common format, used by:
- LM Studio
- Jan.ai
- LocalAI
- vLLM
- OpenRouter
- Azure OpenAI

```
Base URL: http://localhost:1234/v1
Endpoint: /chat/completions
```

### Anthropic Format

For Anthropic-compatible endpoints:

```
Base URL: https://your-anthropic-proxy.com
Format: Anthropic
```

### Gemini Format

For Gemini-compatible endpoints:

```
Base URL: https://your-gemini-proxy.com
Format: Gemini
```

### Ollama Format

For Ollama native API:

```
Base URL: http://localhost:11434
Format: Ollama
Endpoint: /api/chat
```

## Common Configurations

### LM Studio

1. Open LM Studio
2. Start a local server (port 1234)
3. Configure in BraceKit:

```
Name: LM Studio
Base URL: http://localhost:1234/v1
API Key: none
Format: OpenAI
```

### Jan.ai

1. Open Jan
2. Enable local server in settings
3. Configure in BraceKit:

```
Name: Jan
Base URL: http://localhost:1337/v1
API Key: none
Format: OpenAI
```

### LocalAI

```
Name: LocalAI
Base URL: http://localhost:8080/v1
API Key: none
Format: OpenAI
```

### vLLM

```
Name: vLLM
Base URL: http://localhost:8000/v1
API Key: none
Format: OpenAI
```

### OpenRouter

```
Name: OpenRouter
Base URL: https://openrouter.ai/api/v1
API Key: your-openrouter-key
Format: OpenAI
```

### Azure OpenAI

```
Name: Azure OpenAI
Base URL: https://your-resource.openai.azure.com/openai/deployments/your-deployment
API Key: your-azure-key
Format: OpenAI
```

## Model Fetching

BraceKit attempts to fetch available models from the `/models` endpoint.

### If Fetching Works

Models appear automatically in the dropdown.

### If Fetching Fails

1. Type the model name manually
2. Check the API documentation for available models
3. Verify the endpoint is correct

## Troubleshooting

### "Connection refused"

- Ensure the server is running
- Check the port is correct
- Verify no firewall is blocking

### "401 Unauthorized"

- Add the correct API key
- Some services need any non-empty string

### "Model not found"

- Type the model name manually
- Check the service's model list
- Verify model name spelling

### "CORS error"

- The server may need CORS headers
- Configure the server to allow browser requests
- Or use a browser extension to bypass (development only)

### Streaming not working

- Ensure the endpoint supports SSE
- Check the response format matches the selected format
- Some local servers don't support streaming

## Security Notes

### Local Servers

For local development servers:
- No API key needed (or any placeholder)
- Only accessible from your machine
- Safe to use without authentication

### Remote Servers

For remote or public servers:
- Always use a real API key
- Ensure HTTPS is enabled
- Consider rate limiting

## Related

- [Ollama](/guide/ai-providers/ollama/) — Recommended for local models
- [Configuration](/guide/reference/configuration/) — All settings
