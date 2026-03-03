+++
title = "Data Settings"
description = "Export, import, and backup your BraceKit data."
weight = 6
template = "page.html"

[extra]
category = "Configuration"
+++

# Data Settings

Manage your BraceKit data with export, restore, and reset functionality.

---

## Export Backup

Download a complete backup of your BraceKit data.

### What's Included

- **Conversations**: All chat history
- **Settings**: All configuration options
- **Memories**: Stored personalization data
- **Custom Providers**: Your added providers (configuration only)

### API Keys (Optional)

You can choose to include API keys in your backup:

- **Without API Keys** — You'll need to re-enter keys after restore (safer)
- **With API Keys** — Keys are encrypted with your password and portable across devices

> **Note**: API keys are always encrypted at rest on your device. When included in backups, they are re-encrypted with your password for portability.

### Exporting Data

1. (Optional) Toggle **Include API Keys** if you want to backup your keys
2. (Optional) Enter an **Encryption Password** to secure your backup
   - **Required** if including API keys
   - **Optional** for general backup encryption
3. Click the **Export** button (label changes based on your selections):
   - **Export** — plain backup, no password
   - **Export Encrypted** — password set, no API keys
   - **Export with Keys** — API keys included (password required)
4. A JSON file will be downloaded to your computer

> **Note**: The export process may temporarily freeze the interface. Please wait until the download completes.

### Encryption

If you set an encryption password:
- Your data is encrypted before export
- You'll need the same password to import
- **Do not lose this password** — it cannot be recovered

---

## Restore Backup

Restore your data from a previously exported backup file.

### Smart Import

When you select a backup file, BraceKit inspects it first:

- **Shows backup info** — Encrypted status, whether it contains API keys
- **Prompts for password** — If backup contains API keys or is encrypted
- **Auto-imports** — If backup is unencrypted and has no API keys

### Restoring Data

1. Click **Select & Restore Backup**
2. Choose your backup JSON file
3. BraceKit will inspect the backup and show relevant info
4. If prompted, enter the **Decryption Password**
5. Click **Restore** (or **Restore with Keys** if backup includes API keys) to confirm
6. Wait for the import to complete
7. The page will reload with your restored data

> **Warning**: Restoring will **completely overwrite** your current data. Make sure to export your current data first if you want to preserve it.

### API Key Restoration

When restoring a backup with API keys:

1. Password is required to decrypt the key bundle
2. Keys are decrypted from backup password encryption
3. Keys are re-encrypted with your device's unique key
4. Keys work immediately after restore

> **Note**: If you see "API keys have been re-encrypted for this device" — that's normal! It means the keys were successfully restored and secured for your current device.

### Restore Errors

If restore fails:
- Check that the file is a valid BraceKit backup
- Verify the decryption password is correct
- Ensure the file wasn't corrupted during download
- For API key errors: password is required when backup contains API keys

---

## Reset All Data

The **Danger Zone** section allows you to permanently delete all BraceKit data and return to factory defaults.

### What Gets Deleted

- All conversations and chat history
- All AI provider configurations and API keys
- All memories and personalization data
- All MCP server configurations
- All settings and preferences

### Resetting

1. Click **Reset All** in the Danger Zone
2. A confirmation dialog will appear — read it carefully
3. Click **Reset All Data** to confirm
4. The extension reloads with factory default settings

> **Warning**: This action **cannot be undone**. Export your data first if you want to preserve anything.

---

## Best Practices

### Regular Backups

Export your data regularly to prevent loss:
- After important conversations
- When changing settings significantly
- Before updating or reinstalling

### Before Major Changes

Always export before:
- Reinstalling BraceKit
- Switching browsers
- Making significant setting changes

### Secure Storage

- Store backups in a secure location
- Use encryption for sensitive data
- Keep track of encryption passwords

---

## Related

- [Memory Settings](../memory/)
- [Safety Settings](../safety/)
- [Troubleshooting](/guide/reference/troubleshooting/)
