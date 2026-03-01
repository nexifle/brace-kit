+++
title = "Installation"
description = "Install BraceKit in your Chrome browser in under 2 minutes."
weight = 11
template = "page.html"

[extra]
category = "Getting Started"
icon = "<svg width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' y1='15' x2='12' y2='3'/></svg>"
+++

# Installation

BraceKit is distributed as an unpacked Chrome extension. Installation takes under two minutes.

## Prerequisites

Before you begin, ensure you have:

- **Google Chrome** v109 or later (or Chromium-based browsers: Edge, Brave, Arc)
- **Bun** runtime installed ([bun.sh](https://bun.sh))
- An **API key** from at least one supported provider

## Step 1: Clone the Repository

```bash
git clone https://github.com/your-org/brace-kit.git
cd brace-kit
```

## Step 2: Install Dependencies

```bash
bun install
```

This will install all required dependencies including React, Zustand, and Tailwind CSS.

## Step 3: Build the Extension

```bash
bun run build
```

The build process:
1. Bundles all TypeScript/React files
2. Copies static assets (icons, manifest)
3. Outputs everything to the `dist/` folder

You should see output like:

```
✓ Built background.js
✓ Built content.js
✓ Built index.js
✓ Built onboarding.js
✓ Copied static files
```

## Step 4: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `dist/` folder from your BraceKit directory

> **Important:** Select the `dist/` folder, not the project root!

The BraceKit icon will appear in your Chrome toolbar.

### Pin the Extension

For quick access, pin BraceKit to your toolbar:

1. Click the puzzle piece icon (Extensions menu)
2. Find BraceKit
3. Click the pin icon

## Step 5: Configure Your API Key

1. Click the BraceKit icon to open the sidebar
2. Click the **Settings** icon (⚙️) in the top-right
3. Navigate to **AI Provider**
4. Select your preferred provider
5. Enter your API key
6. Click **Save**

You're ready to chat! See the [First Chat guide](/guide/getting-started/first-chat/) to learn the basics.

## Development Mode

For development with hot reload:

```bash
bun run dev
```

This starts a development server. Changes to source files will automatically rebuild the extension.

> **Note:** You still need to refresh the extension in `chrome://extensions/` after changes.

## Updating BraceKit

To update to the latest version:

```bash
git pull origin main
bun install
bun run build
```

Then refresh the extension in Chrome:

1. Go to `chrome://extensions/`
2. Find BraceKit
3. Click the refresh icon (↻)

Your settings and conversation history are preserved.

## Troubleshooting

### Extension not loading

- Make sure you selected the `dist/` folder, not the project root
- Check for build errors in the terminal
- Verify Chrome version is 109 or later

### Build errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules bun.lockb
bun install
bun run build
```

### Sidebar not appearing

- Click the BraceKit icon in the toolbar, not the extensions menu
- Try refreshing the page
- Check the browser console for errors (F12 → Console)

### API requests failing

- Verify your API key is correct
- Check your API key has sufficient credits
- Ensure the correct endpoint URL is configured

For more help, see the [Troubleshooting guide](/guide/reference/troubleshooting/).
