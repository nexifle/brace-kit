+++
title = "Chat Settings"
description = "Configure chat behavior, system prompt, and text selection."
weight = 2
template = "page.html"

[extra]
category = "Configuration"
+++

# Chat Settings

Customize how the AI assistant behaves in conversations.

---

## System Prompt

Define the AI's personality and behavior with a custom system prompt.

### Default Prompt

```
You are BraceKit, a helpful AI assistant. When the user shares
page content or selected text, help them understand and work
with it. Be concise and helpful.
```

### Customization Ideas

- **Response Style**: "Always respond in bullet points"
- **Domain Expertise**: "You are an expert in TypeScript and React"
- **Output Format**: "Always include code examples when explaining concepts"
- **Language**: "Respond in Bahasa Indonesia"

---

## Streaming

Control how responses appear:

| Setting | Behavior |
|---------|----------|
| **Enabled** (default) | Responses appear word-by-word as generated |
| **Disabled** | Wait for complete response before displaying |

Streaming provides a more interactive experience but may feel slower for short responses.

---

## Text Selection AI

Enable AI assistance when selecting text on webpages.

### Enable Text Selection AI

When enabled, selecting text on any webpage shows an AI toolbar with quick actions.

### Minimum Selection Length

Set the minimum characters needed to trigger the toolbar:

- **Range**: 5 - 100 characters
- **Default**: 10 characters
- **Recommendation**: 10–20 for more intentional selections

### Built-in Actions

Nine built-in actions come with the toolbar, split into two default positions:

**Toolbar** (always visible):

| Action | Category |
|--------|----------|
| Summarize | Analyze |
| Explain | Analyze |
| Translate | Transform |
| Rephrase | Transform |

**More menu** (dropdown):

| Action | Category |
|--------|----------|
| Simplify | Transform |
| Expand | Transform |
| Make Formal | Change Tone |
| Make Casual | Change Tone |
| Fix Grammar | Fix & Improve |

For each built-in action you can:

- **Toggle on/off** — disable actions you never use
- **Rename** — give it a shorter or more meaningful label
- **Change position** — move between *Toolbar* (always visible) and *More menu* (dropdown)
- **Change category** — regroup it in the More menu
- **Reset** — restore the action to its original defaults (↺ icon on hover)

> **Translate** requires selecting a target language from the popup before the request is sent. Supported languages: English, Spanish, French, German, Chinese, Japanese, Korean, Indonesian, Portuguese, Russian, Arabic, Hindi.

### Custom Actions

Add your own AI actions with a fully custom prompt. Click **+** in the Custom Actions section and fill in:

| Field | Description |
|-------|-------------|
| **Label** | Button text shown in the toolbar |
| **Position** | *Toolbar — always visible* or *More — in dropdown menu* |
| **Category** | Groups the action in the More menu (optional) |
| **Prompt Template** | Your full prompt — use `{{text}}` as the placeholder for the selected text |

Example prompt template:

```
Convert the following text into a bulleted list of key points. Return only the list:

{{text}}
```

> Changes apply the next time you select text on a page.

See [AI Floating Toolbar](/guide/core-features/ai-floating-toolbar/) for the full guide including example prompt templates.

---

## Google Search

BraceKit can search the web to provide up-to-date information.

### Google Search Grounding (Gemini Only)

When using Gemini providers, enable **Google Search Grounding** for real-time web search:

- Reduces hallucinations
- Provides current information
- Built into Gemini models

### Google Search Tool (Non-Gemini Providers)

For other providers (OpenAI, Anthropic, etc.), enable **Google Search Tool**:

1. Toggle **Google Search Tool** on
2. Enter your **Gemini API Key** (used as search backend)
3. The AI can now search the web when needed

> **Note**: This feature requires a Gemini API key regardless of your main provider.

---

## Related

- [AI Provider Settings](../ai-provider/)
- [Memory Settings](../memory/)
- [Getting Started](/guide/getting-started/)
