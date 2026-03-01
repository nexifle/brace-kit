+++
title = "Safety Settings"
description = "Password protection and security settings."
weight = 7
template = "page.html"

[extra]
category = "Configuration"
+++

# Safety Settings

Protect your BraceKit data with password protection.

---

## Enable Lock

Require a password when opening the BraceKit sidebar.

| Setting | Behavior |
|---------|----------|
| **On** | Password required to access BraceKit |
| **Off** | No password protection |

When enabled:
- The sidebar shows a lock screen on open
- Your API keys and conversations are protected
- You must enter the password to unlock

---

## Set Password {#set-password}

Configure your access password.

### Requirements

- **Minimum length**: 4 characters
- **No maximum length**
- Can include letters, numbers, and symbols

### Setting a Password

1. Enable **Enable Lock**
2. Enter your password in **Set Password**
3. Confirm in **Confirm Password**
4. Click **Save Password**

### Changing Password

To change your password:
1. Enter the new password in both fields
2. Click **Save Password**
3. The old password is replaced

> **Note**: There's no "current password" verification when changing. Make sure you remember your new password.

### Password Status

When a password is set, you'll see:
- A green dot with "Password is set"
- The lock screen will appear on next open

---

## Important Notes

### Forgot Password

If you forget your password:
- There is no recovery mechanism
- You'll need to clear BraceKit data to reset
- This will delete all your conversations and settings

To reset:
1. Go to Chrome Extensions (`chrome://extensions/`)
2. Find BraceKit and click "Remove"
3. Reinstall BraceKit
4. Or use Chrome DevTools to clear storage

### Security Recommendations

- Use a unique password for BraceKit
- Don't reuse passwords from other services
- Consider the sensitivity of your conversations
- Export your data regularly as backup

---

## Related

- [Data Settings](../data/) (for backups)
- [Troubleshooting](/guide/reference/troubleshooting/)
