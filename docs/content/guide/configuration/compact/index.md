+++
title = "Compact Settings"
description = "Configure auto-compact behavior for long conversations."
weight = 3
template = "page.html"

[extra]
category = "Configuration"
+++

# Compact Settings

Configure how BraceKit handles long conversations by automatically summarizing older messages.

---

## Enable Auto-Compact

Toggle automatic conversation compaction:

| Setting | Behavior |
|---------|----------|
| **On** (default) | Automatically summarize when threshold is reached |
| **Off** | Manual compact only via `/compact` command |

When enabled, BraceKit monitors your conversation length and automatically creates a summary when approaching the context limit.

---

## Threshold

Set the percentage of context window usage that triggers auto-compact.

| Value | Behavior |
|-------|----------|
| **50%** | Compact early, more frequent summaries |
| **70%** | Balanced approach |
| **90%** (default) | Compact late, maximize context usage |
| **95%** | Maximum context before compacting |

### How It Works

1. BraceKit tracks token usage in the current conversation
2. When usage reaches the threshold percentage of your context window
3. Older messages are summarized into a compact summary
4. The conversation continues with the summary as context

> **Tip**: Lower thresholds (70-80%) are better for long, complex conversations. Higher thresholds (90-95%) preserve more detail.

---

## Summary Prompt

Customize how BraceKit creates summaries.

### Default Prompt

The default prompt instructs the AI to preserve:
- Key decisions and conclusions
- Important code snippets
- Action items and next steps
- User preferences mentioned

### Customizing the Prompt

You can modify the prompt to:
- Focus on specific types of information
- Change the summary format
- Add domain-specific instructions

### Reset to Default

Click **Reset** to restore the default prompt.

---

## Manual Compact

Even with auto-compact disabled, you can manually trigger a compact:

1. Type `/compact` in the chat
2. Press Enter
3. The conversation will be summarized

---

## Related

- [AI Provider Settings](../ai-provider/) (for Context Window configuration)
- [Chat Settings](../chat/)
- [Troubleshooting](/guide/reference/troubleshooting/)
