+++
title = "Security & PIN"
description = "Protect your API keys and conversations with PIN protection."
weight = 46
template = "page.html"

[extra]
category = "Advanced"
+++

# Security & PIN Protection

Protect your BraceKit data with PIN protection. When enabled, the sidebar locks after a period of inactivity, requiring your PIN to access.

## Why Use PIN Protection?

- **API Keys** — Protect your paid API keys
- **Conversations** — Keep chat history private
- **Shared Computers** — Prevent unauthorized access
- **Sensitive Data** — Extra layer of security

## Enabling PIN Protection

### Setup

1. Open **Settings → Safety**
2. Toggle **Enable PIN Lock**
3. Enter a 4-8 digit PIN
4. Confirm the PIN
5. Click **Save**

### PIN Requirements

- 4-8 digits
- Numbers only
- Cannot be sequential (1234)
- Cannot be repeated (1111)

## How It Works

### Lock Behavior

When PIN is enabled:

1. **After timeout** — Sidebar locks automatically
2. **Manual lock** — Click lock icon in header
3. **On open** — PIN required to access

### Lock Screen

```
┌─────────────────────────────────────┐
│                                     │
│           🔒 BraceKit               │
│                                     │
│     Enter your PIN to continue      │
│                                     │
│     [ _ _ _ _ ]                     │
│                                     │
│     [Unlock]                        │
│                                     │
└─────────────────────────────────────┘
```

### Timeout Settings

Configure when auto-lock triggers:

| Setting | Behavior |
|---------|----------|
| **Immediate** | Lock when sidebar closes |
| **5 minutes** | Lock after 5 min idle |
| **15 minutes** | Lock after 15 min idle |
| **30 minutes** | Lock after 30 min idle |
| **Never** | Only lock manually |

Configure in **Settings → Safety → PIN Timeout**.

## Manual Lock

Click the **lock icon** (🔒) in the header to immediately lock the sidebar.

## Changing Your PIN

1. Open **Settings → Safety**
2. Click **Change PIN**
3. Enter current PIN
4. Enter new PIN
5. Confirm new PIN

## Disabling PIN

1. Open **Settings → Safety**
2. Toggle **Enable PIN Lock** off
3. Enter current PIN to confirm

## Data Protection

### What's Protected

When locked, the following are inaccessible:
- All conversations
- API keys
- Settings
- Memory data
- MCP configurations

### What's Not Protected

- Extension presence (visible in toolbar)
- That BraceKit is installed

### Data Storage

All data is stored locally:
- **chrome.storage.local** — Settings, keys
- **IndexedDB** — Conversations, images
- **Encrypted** — API keys are encrypted

## Security Best Practices

### Strong PIN

- Use 6+ digits
- Avoid obvious patterns
- Don't use birth dates
- Don't reuse other PINs

### Regular Changes

- Change PIN periodically
- Immediately if you suspect compromise

### Timeout Setting

- Use shorter timeouts for sensitive data
- Balance security with convenience

### Browser Security

- Lock your computer when away
- Use browser profile protection
- Don't share your browser profile

## Recovery

### Forgotten PIN

If you forget your PIN:

1. **No recovery** — PINs cannot be recovered
2. **Reset data** — Clear extension data
3. **Start fresh** — Reconfigure everything

To reset:
1. Go to `chrome://extensions/`
2. Find BraceKit
3. Click "Remove"
4. Reinstall and reconfigure

> **Warning:** Resetting removes all data including conversations and API keys.

## Privacy

### What BraceKit Stores

- **API keys** — Encrypted, local only
- **Conversations** — Local storage only
- **Memories** — Local storage only
- **No cloud sync** — Data never leaves your device

### What BraceKit Sends

- **API requests** — Only to configured providers
- **No telemetry** — No usage analytics
- **No account** — No BraceKit account required

## Troubleshooting

### PIN not working

- Check caps lock is off
- Ensure number pad works
- Try typing slowly
- Reset if forgotten

### Auto-lock not triggering

- Check timeout setting
- Ensure PIN is enabled
- Verify sidebar is closing properly

### Lock screen stuck

- Refresh the page
- Restart the browser
- Reset extension if needed

## Related

- [Configuration](/guide/reference/configuration/) — All settings
- [Memory System](/guide/advanced/memory/) — What's stored
- [Troubleshooting](/guide/reference/troubleshooting/) — Common issues
