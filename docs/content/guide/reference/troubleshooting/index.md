+++
title = "Troubleshooting"
description = "Solutions to common BraceKit problems."
weight = 53
template = "page.html"

[extra]
category = "Reference"
+++

# Troubleshooting

Solutions to common problems with BraceKit.

## AI Provider & API Issues

### "Invalid API Key" Error

**What it means:** Your API key is missing, incorrect, or has been revoked.

**Solutions:**

1. **Check your API key:**
   - Open BraceKit Settings → Providers
   - Make sure the API key is entered correctly (no extra spaces)
   - If you copied it, try pasting again carefully

2. **Verify in provider dashboard:**
   - OpenAI: [platform.openai.com](https://platform.openai.com)
   - Anthropic: [console.anthropic.com](https://console.anthropic.com)
   - Google AI: [aistudio.google.com](https://aistudio.google.com)
   - xAI: [console.x.ai](https://console.x.ai)
   - DeepSeek: [platform.deepseek.com](https://platform.deepseek.com)
   - Groq: [console.groq.com](https://console.groq.com)

3. **Regenerate the key:**
   - Create a new API key in your provider dashboard
   - Update it in BraceKit settings

### "Rate Limit Exceeded" Error

**What it means:** You've made too many requests too quickly.

**Solutions:**

1. **Wait a moment:** Rate limits usually reset within a minute
2. **Check your usage:** Review your API usage in the provider dashboard
3. **Verify your plan:** Some limits are based on your subscription tier
4. **Try a different model:** Some models have higher rate limits

### "Model Not Found" Error

**What it means:** The model name is incorrect or not available for your account.

**Solutions:**

1. **Check the model name:** Make sure it's spelled correctly
2. **Type it manually:** If the model isn't in the dropdown, type the exact model name
3. **Check availability:** Some models require special access or higher tier plans

### Responses Are Very Slow

**Possible causes and solutions:**

1. **Network connection:** Slow internet affects API response times
2. **Provider status:** Check if the AI provider is experiencing issues
   - [OpenAI Status](https://status.openai.com)
   - [Anthropic Status](https://status.anthropic.com)
   - [Google Cloud Status](https://status.cloud.google.com)
3. **Try a faster model:** Switch to a smaller, quicker model
4. **Reduce conversation length:** Long conversations take more time to process

---

## Chat & Conversation Issues

### Sidebar Not Appearing

**If the sidebar doesn't open when you click the BraceKit icon:**

1. **Refresh the page:** Sometimes the extension needs a page refresh to load properly
2. **Check if extension is enabled:**
   - Go to `chrome://extensions/`
   - Make sure BraceKit is enabled
3. **Try a different tab:** Open a new tab and try again
4. **Restart Chrome:** Close and reopen Chrome completely

### Chat Responses Not Streaming

**If responses appear all at once instead of word-by-word:**

1. **Check streaming setting:** Settings → Chat → Enable "Stream responses"
2. **Some models don't support streaming:** This is normal for certain models
3. **Network issues:** Slow connections may cause the entire response to appear at once

### Conversation History Disappeared

**If your conversations are missing:**

1. **Check filters:** Make sure no filter is hiding your conversations
2. **Clear search:** Empty the search box in the history drawer
3. **Check if you're signed in:** Data is stored locally in your browser
4. **Browser cleared storage:** If you cleared browser data, conversations may be lost

### "Context Length Exceeded" Error

**What it means:** Your conversation is too long for the AI to process.

**Solutions:**

1. **Use `/compact`:** Type `/compact` in the chat to summarize the conversation
2. **Enable auto-compact:** Settings → Compact → Toggle "Enable Auto-Compact"
3. **Start a new conversation:** Sometimes the simplest solution
4. **Use a model with larger context:** Switch to Claude, Gemini, or GPT-4

---

## Text Selection & Page Reading

### Text Selection Toolbar Not Appearing

**If the AI toolbar doesn't appear when you select text:**

1. **Check the setting:** Settings → Chat → Enable "Text Selection AI"
2. **Select more text:** The toolbar only appears for selections longer than the minimum length (default: 5 characters)
3. **Refresh the page:** The content script may need to reload
4. **Check if the site is supported:** Some secure pages (like Chrome settings) don't allow extensions

### Page Content Not Being Read Correctly

**If the AI doesn't understand the page content:**

1. **Some pages block reading:** Secure pages, PDFs, and certain sites may not be readable
2. **Very long pages:** Extremely long pages may be truncated
3. **Dynamic content:** Content that loads after the page may not be captured
4. **Try refreshing:** Reload the page and try again

---

## File Attachments

### File Upload Failed

**If your file won't attach:**

1. **Check file size:** Maximum file size is 2MB
2. **Check file type:** Supported types are:
   - Images: PNG, JPG, JPEG, GIF, WebP
   - Documents: PDF, TXT, CSV
3. **Try a different file:** The file may be corrupted

### Image Not Displaying

**If attached images don't show properly:**

1. **File may be corrupted:** Try opening the image in another app first
2. **Format not supported:** Convert to PNG or JPG
3. **File too large:** Resize the image before attaching

### PDF Not Processing

**If PDF content isn't being read:**

1. **Scanned PDFs:** Image-based PDFs cannot be read as text
2. **Password-protected PDFs:** Remove password protection first
3. **Complex formatting:** Some PDFs with unusual layouts may not parse correctly

---

## Image Generation

### Image Generation Failed

**If the AI fails to generate an image:**

1. **Check model support:** Only certain models support image generation:
   - xAI: Grok-2-image
   - Google: Imagen models
2. **Check API access:** Image generation may require higher API access
3. **Try a simpler prompt:** Complex prompts may fail

### Generated Images Not Saving

**If images aren't appearing in your gallery:**

1. **Check storage:** Browser storage may be full
2. **Download manually:** Right-click the image to save it
3. **Clear old images:** Settings → Data → Clear old images from gallery

---

## Memory & Personalization

### AI Not Remembering Preferences

**If the memory system isn't working:**

1. **Check if memory is enabled:** Settings → Memory → Enable "Memory"
2. **Memory takes time:** The AI learns from conversations gradually
3. **Add memories manually:** You can add memories directly in Settings → Memory

### Memories Not Saving

**If your memories disappear:**

1. **Check storage:** Browser storage may have been cleared
2. **Export backup:** Use Settings → Data → Export to backup your memories
3. **Browser settings:** Some browser settings clear extension data on exit

---

## Local AI (Ollama)

### Cannot Connect to Ollama

**If BraceKit can't connect to your local Ollama server:**

1. **Make sure Ollama is running:**
   - Open a terminal and run `ollama serve`
   - Or simply run `ollama` to start the server

2. **Check the URL:** The default URL is `http://localhost:11434/v1`
   - Go to Settings → Providers → Ollama
   - Verify the Base URL is correct

3. **Check firewall settings:** Make sure localhost connections are allowed

4. **Verify Ollama is working:**
   - Run `ollama list` to see installed models
   - Run `ollama run llama3` to test

### Ollama Models Not Appearing

**If your Ollama models don't show in the dropdown:**

1. **Pull some models first:** Run `ollama pull llama3` to download a model
2. **Refresh the model list:** Click the refresh button in the provider settings
3. **Type manually:** If models don't appear, type the model name directly

---

## MCP Servers

### MCP Server Won't Connect

**If your MCP server shows as disconnected:**

1. **Check if the server is running:** Make sure your MCP server is actually running
2. **Verify the URL:** Check that the server URL in settings is correct
3. **Check headers:** If your server requires authentication, verify the headers are correct
4. **Check server logs:** Look at your MCP server's console for error messages
5. **Restart the server:** Stop and start your MCP server again

### MCP Tools Not Working

**If connected MCP server tools don't work:**

1. **Check tool availability:** Go to Settings → MCP Servers → Click on server to view tools
2. **Verify tool permissions:** Some tools may require specific permissions
3. **Check server response:** The MCP server may be returning errors

---

## Security & PIN

### Forgot PIN

> **Important:** There is no way to recover a forgotten PIN. You must reset.

**To reset:**

1. Remove the BraceKit extension from Chrome
2. Reinstall BraceKit from the Chrome Web Store
3. All data (conversations, settings, memories) will be lost
4. You'll need to reconfigure everything

**Prevent this in the future:**
- Use a PIN you'll remember
- Export a backup before setting a PIN: Settings → Data → Export

### PIN Not Working

**If your PIN is rejected:**

1. **Type slowly:** Make sure each digit is registered
2. **Check keyboard layout:** Ensure you're using the correct number keys
3. **Try number row instead of numpad:** Some keyboards register these differently

---

## Data & Backup

### Backup Export Failed

**If exporting data fails:**

1. **Large data:** If you have many conversations, export may take time. Wait for it to complete.
2. **Browser storage issues:** Clear some browser data and try again
3. **Try without encryption:** Export without a password first to isolate the issue

### Backup Import Failed

**If importing a backup fails:**

1. **Wrong file format:** Make sure you're using a BraceKit backup file (.json)
2. **Wrong password:** If the backup was encrypted, you need the correct password
3. **Corrupted file:** The backup file may be damaged
4. **Incompatible version:** Very old backups may not be compatible with newer versions

### Settings Reset Unexpectedly

**If your settings disappear:**

1. **Browser cleared data:** Chrome may have cleared extension storage
2. **Extension reinstalled:** Reinstalling removes all data
3. **Storage quota exceeded:** Browser may have freed up space

**Prevent data loss:**
- Export backups regularly: Settings → Data → Export
- Store backups in a safe location

---

## Extension Issues

### Extension Not Working After Update

**If BraceKit stops working after an update:**

1. **Refresh all tabs:** Reload any tabs where BraceKit was open
2. **Restart Chrome:** Close Chrome completely and reopen
3. **Check extension status:** Go to `chrome://extensions/` and verify BraceKit is enabled

### Extension Crashes or Freezes

**If BraceKit becomes unresponsive:**

1. **Close and reopen the sidebar:** Click the icon to close, then open again
2. **Refresh the page:** Reload the current webpage
3. **Clear old conversations:** Too many conversations can slow things down
4. **Check for error messages:** Open Chrome DevTools (F12) → Console tab

---

## Getting Help

### Before Reporting

1. **Try basic fixes:**
   - Refresh the page
   - Restart Chrome
   - Check settings are correct

2. **Check this documentation:** Your issue may already have a solution above

### Reporting Issues

When reporting a bug or issue, please include:

1. **Steps to reproduce:** What did you do that caused the issue?
2. **Expected behavior:** What should have happened?
3. **Actual behavior:** What actually happened?
4. **Screenshots:** If applicable, include screenshots
5. **Browser version:** Find in Chrome menu → Help → About Google Chrome
6. **Console errors:** If you see red errors in DevTools Console, include them

### Where to Get Help

- **Documentation:** [BraceKit Docs](/guide/)
- **GitHub Issues:** [Report a Bug](https://github.com/satriaajiputra/brace-kit/issues)

---

## Related

- [Configuration](/guide/configuration/)
- [Getting Started](/guide/getting-started/)
- [Security](/guide/advanced/security/)
