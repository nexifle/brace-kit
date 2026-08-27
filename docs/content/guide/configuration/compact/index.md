+++
title = "Compact Settings"
description = "Configure auto-compact behavior for long conversations."
weight = 3
template = "page.html"

[extra]
category = "Configuration"
+++

# Compact Settings

Configure how BraceKit checkpoints long conversations: older turns become a structured summary, recent messages stay verbatim.

---

## Enable Auto-Compact

| Setting | Behavior |
|---------|----------|
| **On** (default) | Compact when usage exceeds the Compact-at share of the model window |
| **Off** | Manual compact only via `/compact` |

---

## Compact at

Percentage of the **selected model's** context window. Auto-compact runs when estimated usage goes past this share (the remainder is reserved for the next reply).

| Value | Behavior |
|-------|----------|
| **50–70%** | Compact earlier, more often |
| **87%** (default) | Matches a ~16k token reserve on a 128k window |
| **95%** | Compact only when nearly full |

The settings page shows the equivalent reserved token count for the current model.

---

## Keep recent

Share of the model window left as **verbatim** recent messages (not summarized). Default **16%** (~20k tokens on a 128k window).

BraceKit only cuts at safe points (never a tool result without its assistant call). If one turn is larger than this budget, the start of that turn is summarized separately.

---

## Manual Compact

1. Type `/compact` in the chat
2. Optionally add extra instructions: `/compact preserve API error strings`
3. Press Enter

`/compact` extra text is one-shot guidance for that summarization only.

---

## Related

- [AI Provider Settings](../ai-provider/) (for Context Window configuration)
- [Chat Settings](../chat/)
- [Troubleshooting](/guide/reference/troubleshooting/)
