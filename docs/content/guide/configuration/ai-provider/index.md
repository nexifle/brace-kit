+++
title = "AI Provider Settings"
description = "Configure AI providers, API keys, and model parameters."
weight = 1
template = "page.html"

[extra]
category = "Configuration"
+++

# AI Provider Settings

Configure your AI providers, API keys, models, and advanced parameters.

---

## Provider Selection

Select from available AI providers:

| Provider | Description |
|----------|-------------|
| **OpenAI** | GPT-5.6 (Sol/Terra/Luna), GPT-5.5, GPT-5.4 |
| **Anthropic** | Claude Opus 5, Sonnet 5, Haiku 4.5, Fable 5 |
| **Google Gemini** | Gemini 3.6 Flash, 3.5 Flash, 3.1 Pro |
| **xAI** | Grok 4.6, Grok 4.5, Grok 4.3, Grok 4.20 |
| **DeepSeek** | DeepSeek V4 Flash and Pro |
| **Ollama** | Local models via Ollama |
| **Custom** | Your own OpenAI-compatible endpoints |

Open the **provider dropdown** to select a provider — search for it, or use ↑↓ and Enter. The active provider is shown at the top of the list. Use the **+ Add** button for a custom provider.

---

## API Key

Enter your API key for the selected provider:

- Keys are stored locally in your browser
- Never sent to BraceKit servers
- Unique per provider

Paste your key into the **API Key** field. Click the eye icon to show/hide the value.

> **Note**: Ollama running on localhost doesn't require an API key.

---

## Base URL

For **Custom Providers** and **Ollama**, you can configure a custom Base URL:

- **Ollama**: Change from default `http://localhost:11434` to connect to a remote server
- **Custom**: Enter the full API endpoint URL

---

## Model Selection

Choose a model for the selected provider:

- **Dropdown**: If the provider supports model fetching, select from the list
- **Manual Input**: Type the model name if not in the list

### Managing Models (Custom Providers)

For custom providers, models are shown as chips directly in the Model field:

- **Select Model**: Click a chip to make it the active model (highlighted in blue)
- **Add Model**: Type a name in the input at the bottom of the chip list and press Enter or click **+**
- **Remove Model**: Click the **×** on any chip

---

## Custom Providers

Add your own API endpoints that are compatible with OpenAI, Anthropic, Gemini, or Ollama formats.

### Adding a Custom Provider

1. Click the **+ Add** button next to the provider dropdown
2. Fill in the details:
   - **Name**: Display name for the provider
   - **Format**: API format (OpenAI, Anthropic, Gemini, or Ollama)
   - **Base URL**: API endpoint (e.g., `https://api.example.com/v1`)
3. Click **Save Provider**

### Removing a Custom Provider

Hover over a custom provider button in the grid and click the **×** that appears in the top-right corner.

---

## Context Window

Set the context window size for the current provider:

- This affects auto-compact threshold calculations
- Default values are provided based on provider presets
- Override if using a model with a different context window

---

## Model Parameters

Fine-tune model behavior with advanced parameters. Available parameters vary by provider format.

### Common Parameters

| Parameter | Description | Range |
|-----------|-------------|-------|
| **Temperature** | Controls creativity. Low = consistent, High = varied | 0.0 - 2.0 |
| **Top P** | Controls word choice breadth. Lower = more focused | 0.0 - 1.0 |
| **Max Tokens** | Maximum response length | Any positive integer |

### Advanced Parameters

| Parameter | Provider | Description |
|-----------|----------|-------------|
| **Top K** | Anthropic, Gemini, Ollama | Limits word choices to top K options |
| **Min P** | Ollama | Minimum probability threshold for tokens |
| **Context Window** | Ollama | Context window size in tokens (`num_ctx`) |
| **Keep Alive** | Ollama | How long to keep model in memory (e.g., "5m", "24h") |
| **Thinking Budget** | Anthropic, Gemini | Max tokens for internal reasoning (when enabled) |

### Resetting Parameters

Click **"Reset to defaults"** to clear all custom parameter values.

---

## Related

- [Chat Settings](../chat/)
- [AI Providers Guide](/guide/ai-providers/)
- [Troubleshooting](/guide/reference/troubleshooting/)
