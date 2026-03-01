+++
title = "Data Settings"
description = "Export, import, and backup your BraceKit data."
weight = 6
template = "page.html"

[extra]
category = "Configuration"
+++

# Data Settings

Manage your BraceKit data with export and import functionality.

---

## Export Backup

Download a complete backup of your BraceKit data.

### What's Included

- **Conversations**: All chat history
- **Settings**: All configuration options
- **API Keys**: Your provider keys
- **Memories**: Stored personalization data
- **Custom Providers**: Your added providers

### Exporting Data

1. (Optional) Enter an **Encryption Password** to secure your backup
2. Click **Export Data** or **Export Encrypted Data**
3. A JSON file will be downloaded to your computer

> **Note**: The export process may temporarily freeze the interface. Please wait until the download completes.

### Encryption

If you set an encryption password:
- Your data is encrypted before export
- You'll need the same password to import
- **Do not lose this password** — it cannot be recovered

---

## Import Backup

Restore your data from a previously exported backup file.

### Importing Data

1. (If encrypted) Enter the **Decryption Password**
2. Click **Select file & Import Data**
3. Choose your backup JSON file
4. Wait for the import to complete
5. The page will reload with your restored data

> **Warning**: Importing will **completely overwrite** your current data. Make sure to export your current data first if you want to preserve it.

### Import Errors

If import fails:
- Check that the file is a valid BraceKit backup
- Verify the decryption password is correct
- Ensure the file wasn't corrupted during download

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
