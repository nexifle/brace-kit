+++
title = "Ollama (Local)"
description = "Run AI models locally with Ollama — no API key required."
weight = 36
template = "page.html"

[extra]
category = "AI Providers"
+++

# Ollama (Local Models)

Run AI models entirely on your computer with Ollama. No API keys, no internet required, complete privacy.

## What is Ollama?

[Ollama](https://ollama.ai) is a tool for running large language models locally. It's perfect for:
- **Privacy** — Data never leaves your computer
- **Offline use** — No internet required
- **Free** — No API costs
- **Customization** — Use any compatible model

## Setup

### 1. Install Ollama

**macOS / Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download from [ollama.ai](https://ollama.ai)

### 2. Start Ollama

```bash
ollama serve
```

This starts the Ollama server on `http://localhost:11434`.

### 3. Pull a Model

```bash
# Recommended general model
ollama pull llama3.2

# Other popular options
ollama pull mistral
ollama pull codellama
ollama pull phi3
```

### 4. Configure in BraceKit

1. Open **Settings → AI Provider**
2. Select **Ollama**
3. The API URL should be `http://localhost:11434/v1`
4. Enter any placeholder for API key (e.g., `ollama`)
5. Select your model from the dropdown
6. Click **Save**

> **Note:** BraceKit automatically fetches available models from Ollama.

## Available Models

Popular models available through Ollama:

| Model | Size | Best For |
|-------|------|----------|
| **llama3.2** | 3B | General use |
| **llama3.2:1b** | 1B | Fast, lightweight |
| **mistral** | 7B | Balanced |
| **codellama** | 7B | Code generation |
| **phi3** | 3.8B | Efficient |
| **deepseek-coder** | 6.7B | Code |
| **llava** | 7B | Vision (images) |

Browse all models at [ollama.ai/library](https://ollama.ai/library).

## Features

### Think Mode

Some models support extended thinking:

1. Click the **brain icon** (🧠) in the toolbar
2. Send your message
3. The model shows its reasoning

### Vision (LLaVA)

The `llava` model can analyze images:

1. Pull the model: `ollama pull llava`
2. Select `llava` in BraceKit
3. Attach an image to your message
4. Ask questions about it

### Auto Model Fetch

BraceKit automatically fetches your Ollama models:

1. Pull a new model: `ollama pull model-name`
2. Open the model selector in BraceKit
3. The new model appears automatically

## Model Parameters

### Ollama-Specific Settings

| Parameter | Effect |
|-----------|--------|
| **num_ctx** | Context window size |
| **num_predict** | Max tokens to generate |
| **temperature** | Randomness (0-2) |
| **top_p** | Nucleus sampling |
| **top_k** | Token selection |
| **repeat_penalty** | Avoid repetition |
| **seed** | Reproducibility |

### Configuring in BraceKit

1. Open **Settings → Chat**
2. Set temperature and other parameters
3. Changes apply to Ollama requests

## Hardware Requirements

### Minimum Requirements

| Model Size | RAM | Storage |
|------------|-----|---------|
| 1B-3B | 8GB | 5GB |
| 7B | 16GB | 10GB |
| 13B | 32GB | 20GB |
| 70B | 64GB+ | 50GB+ |

### GPU Acceleration

Ollama automatically uses GPU when available:
- **NVIDIA**: CUDA support (fastest)
- **AMD**: ROCm support
- **Apple Silicon**: Metal support (M1/M2/M3)

## Running Multiple Models

You can run multiple models and switch between them:

```bash
# Pull multiple models
ollama pull llama3.2
ollama pull mistral
ollama pull codellama

# List installed models
ollama list
```

All installed models appear in BraceKit's model selector.

## Troubleshooting

### "Connection refused"

- Ensure Ollama is running: `ollama serve`
- Check the URL in settings: `http://localhost:11434/v1`
- Verify no firewall is blocking localhost

### "Model not found"

- Pull the model first: `ollama pull model-name`
- Check model name spelling
- Run `ollama list` to see installed models

### Slow responses

- Larger models are slower
- GPU significantly improves speed
- Try a smaller model: `llama3.2:1b`

### Out of memory

- Use a smaller quantization
- Try a smaller model
- Close other applications

### Models not appearing in BraceKit

- Ensure Ollama is running
- Click the refresh button in the model selector
- Check the console for errors

## Custom Models

### From Hugging Face

```bash
# Pull from Hugging Face
ollama pull hf.co/username/model-name
```

### Create Custom Model

Create a `Modelfile`:

```
FROM llama3.2
PARAMETER temperature 0.7
SYSTEM You are a helpful coding assistant.
```

Build and run:

```bash
ollama create my-model -f Modelfile
ollama run my-model
```

## Related

- [Custom Provider](/guide/ai-providers/custom/) — For other local servers
- [Configuration](/guide/reference/configuration/) — All settings
- [Ollama Documentation](https://github.com/ollama/ollama) — Official docs
