+++
title = "Installation"
description = "Install BraceKit in your Chrome browser in under 2 minutes."
weight = 10
template = "page.html"

[extra]
category = "Getting Started"
icon = "<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' y1='15' x2='12' y2='3'/></svg>"
+++

BraceKit is distributed as an unpacked Chrome extension. Installation takes under two minutes and requires no Chrome Web Store account.

## Prerequisites

Before you begin, make sure you have:

- **Google Chrome** v109 or later (or any Chromium-based browser such as Edge, Brave, Arc)
- An **API key** from at least one supported AI provider (OpenAI, Anthropic, Google Gemini, xAI, or DeepSeek) — or a local [Ollama](https://ollama.ai) installation

> **Note:** BraceKit also supports fully custom OpenAI-compatible endpoints, so any local model server (LM Studio, Jan.ai, etc.) will work too.

## Step 1 — Download the Extension

Download the latest BraceKit release from the GitHub releases page:

```bash
# Option A: Clone the repository
git clone https://github.com/your-org/brace-kit.git
cd brace-kit

# Option B: Download the pre-built zip
# → Unzip the downloaded archive
```

## Step 2 — Build (if from source)

If you cloned the repository, build the extension bundle:

```bash
bun install
bun run build
```

The output will be in the `dist/` directory.

## Step 3 — Load into Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** by toggling the switch in the top-right corner
3. Click **Load unpacked**
4. Select the `dist/` folder from your BraceKit directory
5. The BraceKit icon will appear in your Chrome toolbar

> **Tip:** Pin the extension to your toolbar by clicking the puzzle icon (Extensions menu) and pinning BraceKit for quick access.

## Step 4 — Configure Your API Key

1. Click the BraceKit icon to open the sidebar
2. Click the **Settings** icon in the top-right of the sidebar
3. Navigate to **Providers**
4. Enter your API key for the provider you want to use
5. Click **Save**

You're all set! Start a new chat from any webpage.

## Updating BraceKit

To update to the latest version:

```bash
git pull origin main
bun run build
```

Then return to `chrome://extensions/` and click the **Refresh** icon on the BraceKit card. Your settings and conversation history are preserved.

## Troubleshooting

| Problem | Solution |
|---|---|
| Extension not loading | Make sure you selected the `dist/` folder, not the root project folder |
| API requests failing | Double-check your API key has sufficient credits and the correct permissions |
| Sidebar not appearing | Try clicking the BraceKit icon in the toolbar, not the extensions menu |
| Build errors | Run `bun install` first to ensure all dependencies are installed |

If you continue to have issues, open a [GitHub Issue](https://github.com/your-org/brace-kit/issues).
