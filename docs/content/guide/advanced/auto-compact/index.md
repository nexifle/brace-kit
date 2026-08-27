+++
title = "Auto-Compact"
description = "Automatically summarize long conversations to stay within context limits."
weight = 43
template = "page.html"

[extra]
category = "Advanced"
+++

# Auto-Compact

Long conversations eventually exceed the model's context window. Auto-compact automatically summarizes conversations to stay within limits.

## Why Auto-Compact?

Every AI model has a context limit, for example:

| Model | Context Window |
|-------|---------------|
| GPT-5.2 | 400K tokens |
| Claude Sonnet 4.6 | 200K tokens |
| gemini-2.5-flash | 1M tokens |

When you approach this limit:
- New messages may fail
- Older context is lost
- Responses become less coherent

Auto-compact solves this by:
1. Detecting when you're near the limit (or when the provider reports a context overflow)
2. Generating a structured checkpoint of discarded history (goal, progress, next steps)
3. Marking older messages as compacted (they stay in history)
4. Continuing with the checkpoint plus recent messages kept verbatim

## How It Works

Auto-compact is **checkpoint-and-replay**, not a wipe:

1. **Cut**: Walk backward from the newest message until a keep-recent budget is filled. Cuts only at user or assistant messages, never a lone tool result.
2. **Summarize**: A dedicated summarizer (no tools) writes Goal, Constraints, Progress, Decisions, Next Steps, and Critical Context. Later compacts **update** the previous checkpoint instead of replacing it.
3. **Rebuild**: Active context is system prompt + checkpoint + the recent tail. Original messages remain stored.

If a request fails because the prompt was too large, BraceKit compact-and-retries **once**.

## Configuration

### Enable Auto-Compact

1. Open **Settings**
2. Find **Auto Compact** section
3. Toggle **Enable Auto Compact**

### Compact at / Keep recent

Sliders are percentages of the **selected model's** context window (not raw token counts). Defaults: compact at **87%**, keep recent **16%**.

### Context Window

The context window comes from the **selected model**, not the whole provider. Built-in models use BraceKit’s known limits. For a custom model, set **Context** on the Advanced card or in the add/edit model dialog (Settings → AI).

If that number is wrong, compact may fire too early or too late.

## Manual Compact

Trigger compact manually with the slash command:

```
/compact
/compact preserve the exact failing test output
```

This is useful when:
- You want to clean up before a long message
- You're preparing to branch
- The conversation feels bloated

## Usage Indicator

When you're within **15% of the threshold**, a warning indicator appears above the input area:

- **≤15% remaining**: Gray indicator
- **≤10% remaining**: Yellow warning
- **≤5% remaining**: Red pulsing warning

Hover over the indicator to see exact token usage.

## What Happens During Compact

When compact triggers:

1. **Indicator shows** "Compacting..."
2. **Conversation** is sent to AI for summarization
3. **Summary** is generated
4. **Messages tagged** as compacted (non-destructive)
5. **Summary appended** to conversation
6. **Conversation continues** normally

## Best Practices

### Let It Run Automatically

- Don't manually compact too often
- Trust the threshold setting
- Only manual compact when necessary

### Review Summaries

After compact, check the summary:
- Ensure key points are captured
- Add important details if missed

### Branch Before Compact

If you want to preserve full context:
1. Branch the conversation
2. Compact the original
3. Original has summary, branch has full history

### Set Correct Context Window

For accurate auto-compact timing:
- Check **Context** on the selected model (Settings → AI → Advanced)
- Custom models: set the real token limit there
- Default is 128K if not set

## Troubleshooting

### Compact triggers too often

- Increase the threshold (e.g., 95%)
- Check Context on the selected model (Settings → AI → Advanced)
- Consider using a model with larger context

### Compact not triggering

- Ensure auto-compact is enabled
- Check threshold isn't too high
- Verify Context on the selected model is correct

### Summaries missing key info

- Edit the custom summary prompt
- Add important context back manually
- Consider branching before compact

### "Compacting..." stuck

- Wait up to 30 seconds
- Check network connection
- Restart the sidebar if needed

## Related

- [Branching](/guide/core-features/branching/) — Preserve full context
- [Memory System](/guide/advanced/memory/) — Persistent preferences
- [Configuration](/guide/reference/configuration/) — All settings
