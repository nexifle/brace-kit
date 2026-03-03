+++
title = "Privacy Policy"
description = "How BraceKit collects, uses, and protects your information."
date = 2026-03-03
template = "page.html"

[extra]
category = "Legal"
+++

# Privacy Policy

**Effective Date:** March 3, 2026
**Contact:** [bracekit@nexifle.com](mailto:bracekit@nexifle.com)

BraceKit is a browser extension that provides an AI-powered chat sidebar. This Privacy Policy explains how BraceKit handles your information.

## Summary

BraceKit is designed with privacy first:

- **No accounts required** — No sign-up, no login.
- **No telemetry** — BraceKit does not collect usage analytics or send data to BraceKit servers.
- **Local-first storage** — All your data stays on your device.
- **You control your data** — You can clear all data at any time from Settings.

## What Data BraceKit Stores

All data is stored **locally on your device** using browser storage APIs.

### API Keys

- Stored in `chrome.storage.local` using device-bound encryption.
- Never transmitted to BraceKit or any third party.
- Only sent directly to the AI provider you have configured (e.g., OpenAI, Anthropic).

### Conversations

- Stored in your browser's IndexedDB, local to your device.
- Never uploaded or synced to external servers.

### Memory & Settings

- Stored in `chrome.storage.local` on your device.
- Includes provider configuration, chat settings, and saved memories.

### Attached Files & Images

- Processed locally in your browser.
- Sent directly to your configured AI provider as part of your chat message.
- Not stored persistently by BraceKit.

## Data BraceKit Transmits

BraceKit sends data **only** in the following circumstances:

| Data | Destination | Purpose |
|------|-------------|---------|
| Chat messages & page context | Your configured AI provider | Generating AI responses |
| Attached files / images | Your configured AI provider | Processing attachments |
| API key (per request) | Your configured AI provider | Authentication |

BraceKit itself does **not** receive any of this data. All API calls go directly from your browser to the AI provider's servers.

## Third-Party AI Providers

When you use BraceKit, your messages and page context are sent to the AI provider you configure. Each provider has its own privacy policy:

- **OpenAI** — [openai.com/policies/privacy-policy](https://openai.com/policies/privacy-policy)
- **Anthropic (Claude)** — [anthropic.com/legal/privacy](https://www.anthropic.com/legal/privacy)
- **Google (Gemini)** — [policies.google.com/privacy](https://policies.google.com/privacy)
- **xAI (Grok)** — [x.ai/legal/privacy-policy](https://x.ai/legal/privacy-policy)
- **DeepSeek** — [deepseek.com/en/privacy_policy](https://www.deepseek.com/en/privacy_policy)
- **Ollama** — Runs locally on your machine; no external data transmission.

BraceKit has no control over how these providers handle your data. Please review their policies before use.

## Data Retention

- All BraceKit data persists until you explicitly delete it.
- You can clear all data from **Settings → Data → Clear All Data**.
- Uninstalling the extension removes all locally stored data from your browser.

## Data Security

BraceKit employs the following security measures:

- **API key encryption** — API keys are encrypted with a device-unique key before storage. See [Security & PIN](/guide/advanced/security/) for full details.
- **PIN protection** — Optional PIN lock prevents unauthorized access to the sidebar.
- **Local-only storage** — No cloud synchronization minimizes data exposure.

## Data Export

You can export your BraceKit data from **Settings → Data → Export**. Exported files containing API keys are encrypted with a password you provide. BraceKit does not have access to your exported data.

## Children's Privacy

BraceKit is not intended for children under the age of 13. We do not knowingly collect information from children.

## Changes to This Policy

We may update this Privacy Policy from time to time. The "Effective Date" at the top of this page will reflect the latest revision. We encourage you to review this policy periodically.

## Contact

For privacy-related questions or concerns, please contact:

**Email:** [bracekit@nexifle.com](mailto:bracekit@nexifle.com)

---

*See also: [Terms of Service](/terms/) · [Security & PIN](/guide/advanced/security/)*
