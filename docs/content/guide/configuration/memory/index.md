+++
title = "Memory Settings"
description = "Manage persistent memory and personalization."
weight = 4
template = "page.html"

[extra]
category = "Configuration"
+++

# Memory Settings

Configure how BraceKit remembers information across conversations to provide personalized responses.

---

## Enable Memory

Toggle the memory system:

| Setting | Behavior |
|---------|----------|
| **On** (default) | AI extracts and stores memories from conversations |
| **Off** | No persistent memory, fresh start each conversation |

When enabled, BraceKit automatically learns your preferences, interests, and context from your conversations.

---

## How Memory Works

1. **Automatic Extraction**: During conversations, the AI identifies important information
2. **Categorized Storage**: Memories are stored in relevant categories
3. **Context Injection**: Relevant memories are included in future conversations
4. **Personalization**: Responses become tailored to your preferences over time

---

## Categories {#categories}

Memories are organized into categories:

| Category | Description |
|----------|-------------|
| **Personal** | Name, background, personal details |
| **Goals** | Objectives and targets you've mentioned |
| **Interests** | Topics, hobbies, and areas of interest |
| **Expertise** | Skills, profession, and knowledge areas |
| **Preferences** | Coding style, language preferences, formats |
| **Style** | Communication style preferences |
| **Habits** | Work patterns and routines |
| **Context** | Project context, current work |
| **Dislikes** | Things to avoid or you don't prefer |

---

## Managing Memories {#managing-memories}

### Adding Memories Manually

1. Click **Add Memory**
2. Select a category from the dropdown
3. Enter the memory content
4. Click **Save**

This is useful for explicitly telling BraceKit about preferences you want it to remember.

### Editing Memories

1. Hover over a memory
2. Click the **pencil icon**
3. Edit the content
4. Click **Save**

### Deleting Memories

1. Hover over a memory
2. Click the **X icon**
3. The memory is immediately removed

### Clearing All Memories

1. Click **Clear All Memories**
2. Confirm the action in the dialog
3. All memories will be permanently deleted

> **Warning**: Clearing memories cannot be undone. Your assistant will lose all personalization.

---

## Tips for Better Memory

- **Be explicit**: Clearly state preferences when possible
- **Add manually**: Use manual memory for important preferences
- **Review periodically**: Check and clean up memories regularly
- **Use categories**: Help organize memories by selecting appropriate categories

---

## Related

- [Chat Settings](../chat/)
- [Data Settings](../data/) (for backing up memories)
- [Getting Started](/guide/getting-started/)
