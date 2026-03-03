import { getAllImages, clearAllImages, importImages } from './imageDB.ts';
import {
  clearAllConversationMessages,
  saveConversationMessages,
  _getAllConversationData,
  getAllConversationMetadata,
  clearAllConversationMetadata,
  saveConversationMetadata,
} from './conversationDB.ts';
import type { Conversation } from '../types';
import type { BackupData, BackupPayload, ExportOptions, ImportOptions } from './backup.types.ts';
import { encryptData, decryptData } from './crypto.ts';
import {
  extractApiKeys,
  encryptApiKeysForBackup,
  decryptApiKeysFromBackup,
  restoreApiKeysToStorage,
  hasAnyKeys,
} from './backupApiKeys.ts';

// Re-export types for backward compatibility
export type { BackupData, BackupPayload, BackupInspection, ExportOptions, ImportOptions, ApiKeyBundle } from './backup.types.ts';

/**
 * Inspect a backup file to show metadata without full import.
 * Useful for UI to display backup info before restore.
 */
export async function inspectBackup(file: File): Promise<import('./backup.types.ts').BackupInspection> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        const payload = JSON.parse(text) as BackupPayload;

        // Handle legacy format (before BackupPayload wrapper)
        if (!('encrypted' in payload) && ('version' in payload)) {
          const legacy = payload as unknown as BackupData;
          resolve({
            version: legacy.version,
            timestamp: legacy.timestamp,
            encrypted: false,
            hasApiKeys: false,
          });
          return;
        }

        // For encrypted backups, we can't peek at the data without password
        // Return what we can from the payload wrapper
        if (payload.encrypted) {
          resolve({
            version: 2, // Assume v2 for encrypted payloads
            timestamp: 0, // Would need to decrypt to get this
            encrypted: true,
            hasApiKeys: payload.hasApiKeys ?? false,
          });
          return;
        }

        // Unencrypted format - can inspect the data
        const data = payload.data as BackupData;
        resolve({
          version: data.version,
          timestamp: data.timestamp,
          encrypted: false,
          hasApiKeys: payload.hasApiKeys ?? false,
        });
      } catch (err) {
        reject(new Error('Invalid backup file format'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Export application data to a backup file.
 *
 * @param optionsOrPassword - Export options object or password string (legacy)
 */
export async function exportData(optionsOrPassword?: string | ExportOptions): Promise<void> {
  // Normalize arguments for backward compatibility
  const options: ExportOptions = typeof optionsOrPassword === 'string'
    ? { password: optionsOrPassword, includeApiKeys: false }
    : { password: undefined, includeApiKeys: false, ...optionsOrPassword };

  // Validate: API keys require password
  if (options.includeApiKeys && !options.password?.trim()) {
    throw new Error('Password is required when including API keys in backup.');
  }

  // Get all local storage data
  const storage = await chrome.storage.local.get(null);

  // Get all images from IndexedDB
  const images = await getAllImages();

  // Get all conversations from IndexedDB
  const conversations = await _getAllConversationData();
  const conversationMetadata = await getAllConversationMetadata();

  // Prepare storage for backup
  let encryptedApiKeys: string | undefined;

  if (options.includeApiKeys && options.password) {
    // Extract and encrypt API keys separately
    const apiKeysBundle = await extractApiKeys(storage);

    // Check if any keys failed to decrypt - abort export with clear error
    if (apiKeysBundle._failedKeys && apiKeysBundle._failedKeys.length > 0) {
      throw new Error(`Some API keys could not be decrypted and were not included: ${apiKeysBundle._failedKeys.join(', ')}. Please re-enter your API keys and try again.`);
    }

    if (hasAnyKeys(apiKeysBundle)) {
      encryptedApiKeys = await encryptApiKeysForBackup(apiKeysBundle, options.password);
    }
  }

  const backup: BackupData = {
    version: 2, // Bump version for hasApiKeys support
    timestamp: Date.now(),
    storage,
    images,
    conversations,
    conversationMetadata,
  };

  const jsonString = JSON.stringify(backup);
  let finalData: string | BackupData;
  let isEncrypted = false;

  if (options.password && options.password.trim().length > 0) {
    finalData = await encryptData(jsonString, options.password);
    isEncrypted = true;
  } else {
    finalData = backup;
  }

  const payload: BackupPayload = {
    encrypted: isEncrypted,
    hasApiKeys: !!encryptedApiKeys,
    data: finalData,
    apiKeys: encryptedApiKeys,
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  const suffix = options.includeApiKeys ? '-with-keys' : '';
  a.download = `brace-kit-backup-${date}${suffix}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * Import data from a backup file.
 *
 * @param file - Backup file to import
 * @param optionsOrPassword - Import options object or password string (legacy)
 */
export async function importData(file: File, optionsOrPassword?: string | ImportOptions): Promise<void> {
  // Normalize arguments
  const options: ImportOptions = typeof optionsOrPassword === 'string'
    ? { password: optionsOrPassword }
    : { password: undefined, ...optionsOrPassword };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        let payload: BackupPayload;
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error('Invalid backup file format (Not valid JSON)');
        }

        let backupData: BackupData;

        // Legacy format fallback (before BackupPayload wrapper)
        if (!('encrypted' in payload) && ('version' in payload)) {
          backupData = payload as unknown as BackupData;
        }
        // Encrypted format
        else if (payload.encrypted) {
          if (!options.password || options.password.trim().length === 0) {
            throw new Error('Password required to decrypt this backup.');
          }
          try {
            const decryptedJson = await decryptData(payload.data as string, options.password);
            backupData = JSON.parse(decryptedJson);
          } catch (decryptErr) {
            throw new Error('Incorrect password or corrupted data.');
          }
        }
        // Unencrypted unwrapped format
        else {
          backupData = payload.data as BackupData;
        }

        if (!backupData || !backupData.version || !backupData.storage) {
          throw new Error('Invalid backup file structure.');
        }

        // Handle API keys restoration
        let finalStorage = { ...backupData.storage };
        if (payload.hasApiKeys && payload.apiKeys) {
          if (!options.password?.trim()) {
            throw new Error('Password required to restore API keys from this backup.');
          }
          try {
            const apiKeyBundle = await decryptApiKeysFromBackup(payload.apiKeys, options.password);
            finalStorage = await restoreApiKeysToStorage(apiKeyBundle, finalStorage);
          } catch (err) {
            throw new Error('Failed to decrypt API keys. Incorrect password.');
          }
        }

        // 1. Clear existing storage and set new one
        // IMPORTANT: Preserve the device encryption key to avoid decryption failures
        const existingData = await chrome.storage.local.get('_deviceEncryptionKey');
        await chrome.storage.local.clear();
        await chrome.storage.local.set({
          ...finalStorage,
          // Preserve the device encryption key that was used to encrypt the restored API keys
          _deviceEncryptionKey: existingData._deviceEncryptionKey,
        });

        // 2. Restore images to IndexedDB
        if (backupData.images && Array.isArray(backupData.images)) {
          await clearAllImages();
          await importImages(backupData.images);
        }

        // 3. Restore conversation messages to IndexedDB (parallel)
        if (backupData.conversations && Array.isArray(backupData.conversations)) {
          await clearAllConversationMessages();
          await Promise.all(
            backupData.conversations.map(conv => saveConversationMessages(conv.id, conv.messages))
          );
        }

        // 4. Restore conversation metadata to IndexedDB (parallel)
        await clearAllConversationMetadata();
        if (backupData.conversationMetadata && Array.isArray(backupData.conversationMetadata)) {
          await Promise.all(
            backupData.conversationMetadata.map(meta => saveConversationMetadata(meta))
          );
        } else if (backupData.conversations && Array.isArray(backupData.conversations)) {
          // Old format fallback - reconstruct and save in parallel
          await Promise.all(
            backupData.conversations.map(conv => {
              const firstUserMsg = conv.messages.find((m) => m.role === 'user');
              const rawTitle = firstUserMsg
                ? (firstUserMsg.displayContent || firstUserMsg.content || '')
                : '';
              const title = rawTitle.slice(0, 50) || 'Imported Chat';
              const now = Date.now();
              const meta: Conversation = { id: conv.id, title, createdAt: now, updatedAt: now };
              return saveConversationMetadata(meta);
            })
          );
        }

        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/**
 * Reset all extension data to factory defaults.
 * Clears chrome.storage.local, chrome.storage.session, and all IndexedDB stores.
 */
export async function resetAllData(): Promise<void> {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  await Promise.all([
    clearAllImages(),
    clearAllConversationMessages(),
    clearAllConversationMetadata(),
  ]);
}
