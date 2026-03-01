+++
title = "File Attachments"
description = "Add images, text files, and documents to your messages."
weight = 25
template = "page.html"

[extra]
category = "Core Features"
+++

# File Attachments

Attach images and text files to your messages for the AI to analyze. Perfect for explaining screenshots or working with text content.

## How to Attach Files

### Method 1: Click the Paperclip

1. Click the **paperclip icon** in the toolbar
2. Select files from your computer
3. Files appear as previews above the input area

### Method 2: Paste from Clipboard

**For Images:**
1. Copy an image to your clipboard (screenshot, etc.)
2. Paste into the input area (Ctrl/Cmd+V)
3. The image is attached

**For Long Text:**
1. Copy text with more than 250 lines
2. Paste into the input area
3. It's automatically converted to a text file attachment

## Supported File Types

| Type | MIME Types | How It's Processed |
|------|------------|-------------------|
| **Images** | image/jpeg, image/png, image/gif, image/webp | Resized to max 1024px, sent to vision-capable models |
| **Text** | text/plain, text/csv | Content read and appended to message |
| **PDF** | application/pdf | Added as attachment (limited support) |

> **Note:** Code files (.js, .ts, .py, etc.) and markup files (.json, .md) may not be recognized if your system doesn't report them as `text/plain`. For best results, copy-paste the content directly or save as .txt first.

## File Size Limits

- **Maximum file size**: 2MB for all file types
- **Image processing**: Images are automatically resized to max 1024px and converted to JPEG at 90% quality

If a file exceeds the limit, you'll see an error and the file won't be attached.

## Image Attachments

### Vision Models Required

Image attachments require a vision-capable model:

| Provider | Vision Models |
|----------|---------------|
| OpenAI | GPT-4o, GPT-4 Turbo |
| Anthropic | Claude 3.5 Sonnet, Claude 3 Opus |
| Google | Gemini models |
| xAI | Grok Vision |
| Ollama | llava, bakllava, etc. |

### Image Preview

Attached images show a thumbnail preview above the input area:

- Small preview with filename
- Hover to reveal remove button
- Click X on individual files or clear all at once

### Use Cases

**UI Debugging**

```
You: [Attached screenshot of error]
What's causing this error?

BraceKit: Looking at your screenshot, the error "Cannot read property
'map' of undefined" suggests that `items` is undefined. Check if the
API call has completed before rendering the list.
```

**Design Feedback**

```
You: [Attached mockup image]
How can I improve this dashboard layout?

BraceKit: Your dashboard has a clean layout. Consider these improvements:

1. The sidebar could be collapsible for more screen space
2. The charts section could use a grid layout
3. Add visual hierarchy with larger headers
```

**Code from Screenshot**

~~~md
You: [Attached code screenshot]
Convert this to TypeScript

BraceKit: Here's the TypeScript version:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users');
  return response.json();
}
```
~~~

## Text File Attachments

Text files are read and their content is included with your message:

- File content is appended to your prompt
- Supported types: plain text (.txt) and CSV files
- Large files may hit token limits

### Use Cases

**CSV Analysis**

```
You: [Attached data.csv]
Summarize this data

BraceKit: Looking at your CSV file with 150 rows:

- 3 columns: date, revenue, expenses
- Date range: Jan 2024 - Mar 2024
- Average monthly revenue: $45,000
- Average monthly expenses: $32,000
```

**Configuration Help**

```
You: [Attached config.txt]
What does this configuration do?

BraceKit: This configuration file sets up:

1. Database connection with connection pooling
2. Logging level set to "debug"
3. Cache enabled with 5-minute TTL
```

## PDF Files

PDF support is limited:

- Files are attached but text extraction is not available in browser
- A placeholder is added to your message
- For PDF analysis, copy text manually or use page context

## Removing Attachments

- **Remove single file**: Hover over the preview and click the X button
- **Remove all files**: Click the X button in the corner of the attachments area

Attachments are cleared automatically after you send the message.

## Tips

### For Images

1. **Crop to relevant area**: Don't send full screenshots if only a portion matters
2. **Use annotations**: Draw arrows or circles before capturing
3. **Check size**: Images over 2MB will be rejected

### For Text

1. **Copy-paste directly**: For code, pasting into the message often works better
2. **Trim content**: Remove unnecessary parts before attaching
3. **Check file type**: Save as .txt if your file isn't recognized

## Related

- [Chat Interface](/guide/core-features/chat/) — Message composition
- [Image Generation](/guide/advanced/image-generation/) — Creating images
- [Page Context](/guide/core-features/page-context/) — Reading web page content
