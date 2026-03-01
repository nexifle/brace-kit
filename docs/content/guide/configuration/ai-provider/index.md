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
| **OpenAI** | GPT-4, GPT-4o, and other OpenAI models |
| **Anthropic** | Claude 3.5 Sonnet, Claude 3 Opus, etc. |
| **Google Gemini** | Gemini 1.5 Pro, Gemini 1.5 Flash, etc. |
| **xAI** | Grok models |
| **DeepSeek** | DeepSeek Chat and Reasoner |
| **Ollama** | Local models via Ollama |
| **Custom** | Your own OpenAI-compatible endpoints |

Click on a provider card to select it. The active provider is highlighted.

---

## API Key

Enter your API key for the selected provider:

- Keys are stored locally in your browser
- Never sent to BraceKit servers
- Unique per provider

To enter your key:
1. Click the API Key field
2. Paste your key
3. Click the eye icon to show/hide the key

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

### Managing Model List (Custom Providers)

For custom providers, you can manage the model list:

1. **Add Model**: Type a model name and click the + button
2. **Select Model**: Click on a model chip to select it
3. **Remove Model**: Click the X on a model chip to remove it

---

## Custom Providers

Add your own API endpoints that are compatible with OpenAI, Anthropic, Gemini, or Ollama formats.

### Adding a Custom Provider

1. Click the **+ Add** button in the provider grid
2. Fill in the details:
   - **Name**: Display name for the provider
   - **Format**: API format (OpenAI, Anthropic, Gemini, or Ollama)
   - **Base URL**: API endpoint (e.g., `https://api.example.com/v1`)
3. Click **Save Provider**

### Removing a Custom Provider

Hover over a custom provider card and click the X button that appears.

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
