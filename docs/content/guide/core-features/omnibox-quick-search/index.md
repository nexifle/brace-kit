+++
title = "Omnibox Quick Search"
description = "Access BraceKit directly from Chrome's address bar with the 'bk' keyword."
weight = 27
template = "page.html"

[extra]
category = "Core Features"
+++

# Omnibox Quick Search

Type `bk` in Chrome's address bar to ask questions or jump to a past conversation — without opening the sidebar first.

## How It Works

1. Click the address bar (or press `Ctrl+L` / `Cmd+L`)
2. Type `bk` followed by a space
3. Type your query
4. Press `Enter` to start a new chat, or select a matching conversation from the dropdown

BraceKit opens the sidebar automatically and the query is sent immediately.

## Suggestions

As you type, two types of suggestions appear:

| Suggestion | What it does |
|------------|--------------|
| **Ask AI: `<your query>`** | Opens a new conversation and sends the query |
| **Chat: `<conversation title>`** | Opens an existing conversation that matches your query |

> **Note:** Conversation search matches against **titles only**, not the full message content. If you're looking for a conversation by what was said in it, use the History panel inside the sidebar instead.

## Starting a New Chat

Type any query and press `Enter` (or select the "Ask AI" suggestion):

```
bk explain the difference between TCP and UDP
```

The sidebar opens, a new conversation is created, and your message is sent automatically.

## Finding a Past Conversation

If you have a conversation titled "Project ideas" and type:

```
bk project
```

The suggestion list will include **Chat: Project ideas**. Select it to jump directly to that conversation.

## Limitations

- **Title-only search**: The omnibox searches conversation titles only. It does not search through message content.
- **Requires an active tab**: BraceKit opens in the side panel of your current tab. The keyword won't work from the Extensions or Settings pages in Chrome.
- **Provider must be configured**: A new chat started from the omnibox uses your currently selected AI provider. If no API key is set, the message will fail — configure a provider in Settings first.

## Tips

**Rename conversations** to make them easier to find later. Double-click the conversation title in the chat view to rename it.

**Use descriptive titles** like "React performance tips" or "Tax questions 2025" instead of the default "New Chat" — these become searchable from the omnibox.

## Related

- [Chat Interface](/guide/core-features/chat/) — Using the full sidebar chat
- [Text Selection](/guide/core-features/text-selection/) — Capture highlighted text via right-click
- [AI Floating Toolbar](/guide/core-features/ai-floating-toolbar/) — Instant AI actions on selected text
