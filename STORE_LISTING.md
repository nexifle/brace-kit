# Chrome Web Store Listing Guide for BraceKit

This document is designed to help you prepare your **BraceKit** extension for the Chrome Web Store, ensuring it adheres strictly to Google's best practices, while fully highlighting the advanced capabilities that make BraceKit a premium tool.

## 1. Text Fields (Updated in `manifest.json`)

To make a strong first impression and improve your store ranking, we've updated your extension manifest.

### Item Title
- **Do:** Keep it clear, concise, and descriptive.
- **Don't:** Stuff with keywords.
- **Current:** `BraceKit: AI Sidebar` (Already optimal - clearly identifies the product and its purpose).

### Item Summary
- **Do:** Highlight features in 132 characters or less.
- **Don't:** Use generic superlatives ("best ever").
- **Current:** `Premium AI sidebar with local vault, multi-chat branching, full page & selection reading, MCP tools, and multi-LLM support.`
*(This accurately reflects the depth of features—privacy, multitasking, context reading, and models—while staying within the 132-character limit: 124 characters).*

---

## 2. Store Item Description (Draft)

*Copy and paste this text into the Chrome Web Store Developer Dashboard under the "Detailed Description" field.*

*It follows the best practice of having an overview paragraph followed by a short list of main features, communicating clearly why users will love it without keyword stuffing.*

**Draft Description:**
Unlock a genuinely powerful, private, and premium AI workspace directly alongside your browsing experience. BraceKit is an advanced, context-aware sidebar that connects you to your favorite Large Language Models (LLMs) like OpenAI, Anthropic (Claude), Google Gemini, xAI (Grok), DeepSeek, and Ollama—all without ever having to switch tabs.

Unlike basic wrappers, BraceKit is built for power users. With its encrypted local storage, multi-conversation branching, AI floating toolbar for instant text actions, omnibox quick search, and native Model Context Protocol (MCP) integrations, BraceKit gives you absolute control over your AI environment. Whether you need to instantly analyze the layout and text of an entire webpage, generate images with precise aspect ratios, or run a complex coding flow with custom local server logic, BraceKit brings state-of-the-art capabilities straight to your browser.

**Bring Your Own Key (BYOK) – 100% Free**
BraceKit does **not** provide free access to AI providers or charge monthly subscriptions. Instead, it is a **Bring Your Own Key (BYOK)** extension. This means BraceKit itself is completely free to use! You supply your own API keys for the providers you want to use, ensuring you only pay exactly for the usage you consume directly with the AI providers. Your keys are securely encrypted locally on your device.

**Key Features:**

• **Total Provider Freedom:** Connect seamlessly to OpenAI (GPT-4.1, GPT-5.2, o3, o4-mini), Anthropic (Claude 4.6 Sonnet/Opus, Haiku 4.5), Gemini (2.5 Pro/Flash, 3 Pro), xAI (Grok 4, Grok 4.1), DeepSeek (V3.2, R1), Ollama (local models), or any custom OpenAI-compatible endpoint.

• **Context Mastery**: One-click "Read Current Page" digests the whole page (stripping ads and noise) into pristine markdown format for the LLM. Highlight any text and instantly use the AI Floating Toolbar with actions like Summarize, Explain, Translate, and Rephrase.

• **AI Floating Toolbar**: Select text on any webpage and get instant AI actions—Summarize, Explain, Translate, Rephrase, Simplify, Expand, Fix Grammar, and more. Customize built-in actions or add your own custom prompts. Apply results directly to editable fields.

• **File Attachments**: Attach images and text files to your messages. Images are analyzed by vision-capable models—perfect for debugging UI issues, getting design feedback, or converting code from screenshots.

• **Omnibox Quick Search**: Type `bk` in Chrome's address bar followed by your query to instantly start a new chat or find past conversations—no need to open the sidebar first.

• **Conversation Branching**: Fork conversations at any point to explore alternative directions without losing your original context. Perfect for A/B testing prompts or exploring different solutions.

• **Image Generation on the Fly:** Full support for Gemini and xAI image generation models with advanced aspect ratio selection—perfect for responsive web design or social media assets.

• **Privacy by Default:** All data stored locally on your device. API keys are encrypted using device-bound encryption. Optional PIN protection adds another layer of security. No accounts, no telemetry, no data sent to BraceKit servers.

• **Advanced Chat Management:** Branch conversations into entirely new threads, automatically compress/summarize long conversations to save context limits (auto-compact), and use slash commands (`/compact`, `/rename`) directly from the input terminal.

• **Memory System:** BraceKit remembers your preferences, coding style, and project context across conversations—automatically extracting and recalling important information when relevant.

• **Background Agent Loop:** Conversations run independently in a service worker, meaning you can close the sidebar, navigate away, and your AI assistant will flawlessly continue working in the background.

• **MCP (Model Context Protocol) Integration:** Level up your AI by seamlessly connecting sophisticated local MCP servers. BraceKit automatically recognizes and securely connects to your local tools, unlocking boundless capabilities right inside your browser.

• **Premium Look & Feel:** A breathtaking glassmorphism dark theme with micro-animations, robust markdown table rendering, dynamic UI elements, and a gallery view for all your generated images makes working with LLMs feel cutting-edge.

It's time to supercharge your web browsing without compromises. Install BraceKit today and take your ultimate AI assistant wherever you go on the web.

### Plain Text Version (No Markdown)

*Use this version if the Chrome Web Store doesn't support markdown formatting:*

```
Unlock a genuinely powerful, private, and premium AI workspace directly alongside your browsing experience. BraceKit is an advanced, context-aware sidebar that connects you to your favorite Large Language Models (LLMs) like OpenAI, Anthropic (Claude), Google Gemini, xAI (Grok), DeepSeek, and Ollama—all without ever having to switch tabs.

Unlike basic wrappers, BraceKit is built for power users. With its encrypted local storage, multi-conversation branching, AI floating toolbar for instant text actions, omnibox quick search, and native Model Context Protocol (MCP) integrations, BraceKit gives you absolute control over your AI environment. Whether you need to instantly analyze the layout and text of an entire webpage, generate images with precise aspect ratios, or run a complex coding flow with custom local server logic, BraceKit brings state-of-the-art capabilities straight to your browser.

BRING YOUR OWN KEY (BYOK) – 100% FREE

BraceKit does NOT provide free access to AI providers or charge monthly subscriptions. Instead, it is a Bring Your Own Key (BYOK) extension. This means BraceKit itself is completely free to use! You supply your own API keys for the providers you want to use, ensuring you only pay exactly for the usage you consume directly with the AI providers. Your keys are securely encrypted locally on your device.

KEY FEATURES:

- Total Provider Freedom: Connect seamlessly to OpenAI (GPT-4.1, GPT-5.2, o3, o4-mini), Anthropic (Claude 4.6 Sonnet/Opus, Haiku 4.5), Gemini (2.5 Pro/Flash, 3 Pro), xAI (Grok 4, Grok 4.1), DeepSeek (V3.2, R1), Ollama (local models), or any custom OpenAI-compatible endpoint.

- Context Mastery: One-click "Read Current Page" digests the whole page (stripping ads and noise) into pristine markdown format for the LLM. Highlight any text and instantly use the AI Floating Toolbar with actions like Summarize, Explain, Translate, and Rephrase.

- AI Floating Toolbar: Select text on any webpage and get instant AI actions—Summarize, Explain, Translate, Rephrase, Simplify, Expand, Fix Grammar, and more. Customize built-in actions or add your own custom prompts. Apply results directly to editable fields.

- File Attachments: Attach images and text files to your messages. Images are analyzed by vision-capable models—perfect for debugging UI issues, getting design feedback, or converting code from screenshots.

- Omnibox Quick Search: Type "bk" in Chrome's address bar followed by your query to instantly start a new chat or find past conversations—no need to open the sidebar first.

- Conversation Branching: Fork conversations at any point to explore alternative directions without losing your original context. Perfect for A/B testing prompts or exploring different solutions.

- Image Generation on the Fly: Full support for Gemini and xAI image generation models with advanced aspect ratio selection—perfect for responsive web design or social media assets.

- Privacy by Default: All data stored locally on your device. API keys are encrypted using device-bound encryption. Optional PIN protection adds another layer of security. No accounts, no telemetry, no data sent to BraceKit servers.

- Advanced Chat Management: Branch conversations into entirely new threads, automatically compress/summarize long conversations to save context limits (auto-compact), and use slash commands (/compact, /rename) directly from the input terminal.

- Memory System: BraceKit remembers your preferences, coding style, and project context across conversations—automatically extracting and recalling important information when relevant.

- Background Agent Loop: Conversations run independently in a service worker, meaning you can close the sidebar, navigate away, and your AI assistant will flawlessly continue working in the background.

- MCP (Model Context Protocol) Integration: Level up your AI by seamlessly connecting sophisticated local MCP servers. BraceKit automatically recognizes and securely connects to your local tools, unlocking boundless capabilities right inside your browser.

- Premium Look & Feel: A breathtaking glassmorphism dark theme with micro-animations, robust markdown table rendering, dynamic UI elements, and a gallery view for all your generated images makes working with LLMs feel cutting-edge.

It's time to supercharge your web browsing without compromises. Install BraceKit today and take your ultimate AI assistant wherever you go on the web.
```

---

## 3. Graphical Assets Checklist

Before publishing, you must provide several visual assets. Here is a checklist directly based on the Chrome Web Store guidelines:

### Store Icon (128x128 pixels minimum, usually 128x128 PNG)
- [ ] **Do:** Simple, recognizable brand logo. Use colors/design consistent with other assets.
- [ ] **Don't:** Include small, illegible screenshots or UI graphics within the icon.

### Screenshots (1280x800 or 640x400 pixels)
*Provide at least 1 (preferably the maximum 5) screenshots.*
- [ ] **Do:** Show the Lockscreen / PIN Protection to prove security features.
- [ ] **Do:** Show the sophisticated Input Area (especially the aspect-ratio dropdown or the MCP popover integrations).
- [ ] **Do:** Show the chat UI seamlessly processing a piece of highlighted text from a vibrant article.
- [ ] **Do:** Show the AI Floating Toolbar appearing when text is selected.
- [ ] **Do:** Show the Gallery view with generated/attached images.
- [ ] **Do:** Fill the whole image (full bleed, no padding, square corners).

### Small Promo Tile (440x280 pixels)
*Appears on the homepage, category pages, and search results.*
- [ ] **Do:** Keep the image simple and clean. Use saturated colors.
- [ ] **Do:** Maintain branding and imagery consistent with your Icon and Screenshots.
- [ ] **Don't:** Use too much text or leave it mostly empty (white/light gray). Make sure edges are well defined.
- [ ] **Don't:** Add fake accolades (e.g., "Editor's Choice").

### Marquee Image (Optional but recommended: 1400x560 pixels)
*Only used if featured in the marquee section of the Web Store homepage.*
- [ ] **Do:** Create a high-res, uncluttered header graphic.

### Additional Recommendations
- Ensure you set up a **Support URL** or website in your Developer Dashboard to build trust.
- Remember to configure your developer profile settings to help users find you easily.

---

## 4. Web Store Privacy & Policy Guidance

When submitting to the Chrome Web Store, you will need to fill out the Privacy tab. Based on how BraceKit works, here is how you should fill out the required forms:

### Single Purpose & Permission Justification
Chrome requires that extensions only request permissions that tightly align with a single purpose.

**Single Purpose Description:**
"Provides an AI chat sidebar that can read the active webpage's content, process user-selected text, and connect to external AI providers using the user's own API keys."

**Permission Justifications:**
*   `sidePanel`: Required to display the core application UI alongside the user's active browsing session.
*   `activeTab`: Required to interact with the currently active page when the user explicitly clicks the "Read Current Page" button, uses the AI Floating Toolbar, or applies text transformations to editable fields.
*   `storage`: Required to save the user's encrypted API keys, conversation history, memory data, and extension settings locally on their device.
*   `contextMenus`: Required to allow users to right-click text on the web and send it directly to the AI sidebar.
*   `declarativeNetRequest`: Required to manage network requests for MCP (Model Context Protocol) server connections and AI provider API calls.
*   `host_permissions` (`https://*/*`): Required to make API calls to any HTTPS LLM provider endpoint the user configures (OpenAI, Anthropic, Gemini, xAI, DeepSeek, or any custom OpenAI-compatible endpoint). Because BraceKit is a Bring Your Own Key (BYOK) extension that supports user-defined custom endpoints, the specific domain cannot be known at build time.
*   `host_permissions` (`http://localhost/*`, `http://127.0.0.1/*`): Required exclusively for local AI servers such as Ollama (`http://localhost:11434`) and local MCP (Model Context Protocol) servers that run on the user's own machine over HTTP.

### Data Usage
In the Chrome Web Store dashboard, you must answer what data you collect. Because BraceKit is completely local and BYOK, **you do not collect, store remotely, or send data to your own servers.** However, data is sent to the LLM providers (OpenAI, Anthropic, etc.) based on the user's explicit actions.

**What user data do you plan to collect from users now or in the future?**

You should check **ONLY** the following boxes (because the extension reads page content to send to the AI):

*   [x] **Website content:** For example: text, images, sounds, videos, or hyperlinks.
    *   *Justification (if asked):* The extension reads the text content of the user's active webpage only when explicitly requested by the user (via "Read Current Page" button, text selection, or right-click context menu), so that the AI model they configured can analyze or summarize it.

*Do NOT check boxes like "Personally identifiable information", "Authentication information", or "Location" because your extension code does not collect this telemetry for your own use.*

**Disclosures Certification:**
You must check all three boxes at the bottom:
*   [x] I do not sell or transfer user data to third parties, outside of the approved use cases. *(True: Data only goes directly from the user's browser to the LLM APIs the user configured).*
*   [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
*   [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.
