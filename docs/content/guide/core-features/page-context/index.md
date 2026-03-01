+++
title = "Page Context"
description = "Let BraceKit read and understand the current webpage."
weight = 22
template = "page.html"

[extra]
category = "Core Features"
+++

# Page Context

Page context is BraceKit's superpower. It reads the content of your current webpage and includes it in your conversation, so you can ask questions about what you're viewing.

## How It Works

1. Navigate to any webpage
2. Open the BraceKit sidebar
3. Click the **globe icon** in the toolbar
4. The page content is attached to your next message
5. Ask questions about the page

## What Gets Read

BraceKit extracts the main content and converts it to markdown:

| Content Type | Included |
|--------------|----------|
| Main content | ✅ Articles, posts, documentation |
| Code blocks | ✅ With syntax highlighting preserved |
| Tables | ✅ Converted to markdown tables |
| Links | ✅ Preserved with URLs |
| Images | ✅ Alt text and URLs |
| Meta info | ✅ Page title, URL, description |

**Removed automatically:**
- Navigation, footers, sidebars
- Ads and sponsored content
- Scripts, styles, iframes
- Forms and buttons
- Hidden elements

### Content Preview

When page context is attached, you'll see a preview above the input:

- Page title
- Page URL
- Remove button (X) to detach

## Quick Actions

On the welcome screen (when no conversation exists), you'll see:

- **Read Page** — Attach page content and start chatting
- **Grab Selection** — Use currently highlighted text

## Use Cases

### Summarizing Articles

```
You: Summarize the key points of this article

BraceKit: Based on the article, here are the key points:

1. The article introduces React Hooks as a new way to use state
2. It explains useState and useEffect in detail
3. It provides examples of custom hooks
4. It discusses best practices and common pitfalls
```

### Explaining Documentation

~~~markdown
You: Explain the code example in the "Getting Started" section

BraceKit: Looking at the code example from the "Getting Started" section:

```javascript
const [count, setCount] = useState(0);
```

This creates a state variable called `count` initialized to 0...
~~~

### Extracting Information

```
You: What API endpoints are mentioned on this page?

BraceKit: The documentation mentions these endpoints:

- GET /api/users — List all users
- POST /api/users — Create a new user
- GET /api/users/:id — Get user by ID
- DELETE /api/users/:id — Delete a user
```

### Debugging Help

~~~markdown
You: I'm getting an error. Can you help me understand what's wrong?

BraceKit: Looking at the error message on your page:

"TypeError: Cannot read property 'map' of undefined"

This error occurs when you try to call .map() on a value that is
undefined. In your code at line 42:

```javascript
{items.map(item => <Item key={item.id} {...item} />)}
```

The `items` variable is undefined when the component first renders...
~~~

## Privacy Notes

- Page content is only sent to your configured AI provider
- BraceKit does not store page content permanently
- Content is processed locally before being sent
- No data is sent to BraceKit servers

## Limitations

### Content That Won't Work

- **PDFs in browser**: The content script can't read PDF files
- **Canvas/WebGL**: Rendered graphics aren't extractable
- **IFrame content**: Cross-origin iframes are blocked
- **Dynamic content**: Some SPA content may not be fully captured

### Large Pages

Very long pages may be truncated at approximately 30,000 characters. When truncated, a note is added to the content indicating it was cut off.

BraceKit prioritizes:
- Main content areas (`<main>`, `<article>`)
- Visible content over hidden sections
- Earlier content when truncation is needed

## Tips

### Better Results

1. **Be specific**: "What does the `useEffect` section say?" vs "What's on this page?"

2. **Combine with selection**: Attach page context, then highlight specific parts

3. **Ask for structure**: "Create a table summarizing the features mentioned"

4. **Request comparisons**: "How does this approach compare to the traditional method?"

### Working with Code

For documentation with code examples:

~~~markdown
You: Run me through the first code example step by step

BraceKit: Let me break down the code from the first example:

```javascript
function Counter() {
  const [count, setCount] = useState(0);  // 1. Initialize state
  return (
    <button onClick={() => setCount(c => c + 1)}>  // 2. Update on click
      Clicked {count} times
    </button>
  );
}
```

1. `useState(0)` creates a state variable...
~~~

## Related

- [File Attachments](/guide/core-features/attachments/) — Attach files to messages
- [Chat Interface](/guide/core-features/chat/) — Using the chat
