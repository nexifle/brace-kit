+++
title = "Text Selection"
description = "Select any text on a webpage and ask questions about it."
weight = 23
template = "page.html"

[extra]
category = "Core Features"
+++

# Text Selection

Select any text on a webpage and BraceKit will automatically capture it for discussion. Perfect for explaining code snippets, translating text, or getting quick definitions.

## How It Works

### Automatic Capture

1. Highlight any text on a webpage
2. Open the BraceKit sidebar
3. The selected text appears as a preview above the input
4. Type your question and send

### Manual Capture

Click **"Grab Selection"** to capture the current selection from the page.

### Context Menu

1. Select text on any page
2. Right-click
3. Choose **"Send to BraceKit"**
4. The sidebar opens with the selection ready

## Selection Preview

When text is captured, you'll see a preview above the input:

- Shows the first 80 characters of selected text
- Click the **X** to remove the selection
- The full text is included when you send your message

## Use Cases

### Code Explanation

```
Selected: A complex function from a codebase

You: What does this function do?

BraceKit: This function is a custom hook that manages async data fetching:

1. It takes a URL as input
2. Creates state for data, loading, and error
3. Fetches data on mount and when URL changes
4. Returns the current state
```

### Translation

```
Selected: Text in a foreign language

You: Translate this to English

BraceKit: Here's the translation:

"The quick brown fox jumps over the lazy dog."
```

### Summarization

```
Selected: A long paragraph

You: Summarize this in one sentence

BraceKit: The paragraph explains how React's virtual DOM improves
performance by minimizing direct DOM manipulations.
```

### Simplification

```
Selected: Technical documentation

You: Explain this like I'm 5

BraceKit: Think of it like a translator. When you speak to a computer,
you need to use its language. This tool helps translate your instructions
into something the computer can understand.
```

### Fact-Checking

```
Selected: A claim from an article

You: Is this accurate?

BraceKit: This claim is partially accurate. While it's true that React
uses a virtual DOM, the performance benefit comes specifically from
batching updates and efficient diffing, not just from having a virtual
representation.
```

## Combining with Page Context

You can use both page context and text selection together:

1. Click the globe icon to attach page context
2. Then select specific text on the page
3. Both are included in your message

~~~markdown
You: The page explains React Hooks. Can you show me how the
`useEffect` example (highlighted) would work with an API call?

BraceKit: Looking at the highlighted useEffect example and the
page context, here's how you'd adapt it for an API call:

```javascript
useEffect(() => {
  fetch('/api/data')
    .then(res => res.json())
    .then(setData);
}, []); // Empty array = run once on mount
```
~~~

## Tips

### Better Selections

1. **Select complete thoughts**: Include full sentences or code blocks for better context

2. **Include context**: If code references variables, select enough to show definitions

3. **Be specific in your question**: "Explain the error handling in this code" vs "What is this?"

### For Code

- Include import statements if relevant
- Select the full function, not just part
- Include comments for context

### For Text

- Select complete paragraphs when possible
- Include headings for context
- Don't worry about formatting — it's preserved

## Related

- [AI Floating Toolbar](/guide/core-features/ai-floating-toolbar/) — Instant AI actions when you select text
- [Page Context](/guide/core-features/page-context/) — Attach full page content
- [File Attachments](/guide/core-features/attachments/) — Upload files
- [Chat Interface](/guide/core-features/chat/) — Using the chat
