import { getAllImages, clearAllImages, importImages } from './imageDB.ts';
import type { StoredImageRecord } from '../types';

export interface BackupData {
  version: number;
  timestamp: number;
  storage: Record<string, any>;
  images: StoredImageRecord[];
}

export interface BackupPayload {
  encrypted: boolean;
  data: string | BackupData;
}

export async function exportData(password?: string): Promise<void> {
  // Get all local storage data
  const storage = await chrome.storage.local.get(null);
  
  // Get all images from IndexedDB
  const images = await getAllImages();

  const backup: BackupData = {
    version: 1,
    timestamp: Date.now(),
    storage,
    images
  };

  const jsonString = JSON.stringify(backup);
  let finalData: string | BackupData;
  let isEncrypted = false;

  if (password && password.trim().length > 0) {
    const { encryptData } = await import('./crypto.ts');
    finalData = await encryptData(jsonString, password);
    isEncrypted = true;
  } else {
    finalData = backup;
  }

  const payload: BackupPayload = {
    encrypted: isEncrypted,
    data: finalData
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  a.download = `ai-sidebar-backup-${date}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}

export async function importData(file: File, password?: string): Promise<void> {
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
          if (!password || password.trim().length === 0) {
            throw new Error('Password required to decrypt this backup.');
          }
          const { decryptData } = await import('./crypto.ts');
          try {
            const decryptedJson = await decryptData(payload.data as string, password);
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

        // 1. Clear existing storage and set new one
        await chrome.storage.local.clear();
        await chrome.storage.local.set(backupData.storage);

        // 2. Restore images to IndexedDB
        if (backupData.images && Array.isArray(backupData.images)) {
          await clearAllImages();
          await importImages(backupData.images);
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
