import type { Message, Conversation } from '../types';

const DB_NAME = 'ai-sidebar-conversations';
const DB_VERSION = 2; // Upgraded version for metadata store
const STORE_MESSAGES = 'conversation_messages';
const STORE_METADATA = 'conversation_metadata';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        const metaStore = db.createObjectStore(STORE_METADATA, { keyPath: 'id' });
        metaStore.createIndex('by_updated', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      console.error('[ConversationDB] Failed to open database:', err);
      dbPromise = null;
      reject(err);
    };
  });

  return dbPromise;
}

export async function saveConversationMessages(id: string, messages: Message[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_MESSAGES, 'readwrite');
    const store = tx.objectStore(STORE_MESSAGES);

    const request = store.put({ id, messages });
    request.onsuccess = () => resolve();
    request.onerror = (e) => {
      console.error('[ConversationDB] Failed to save conversation messages:', (e.target as IDBRequest).error);
      reject((e.target as IDBRequest).error);
    };
  });
}

export async function getConversationMessages(id: string): Promise<Message[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result) {
          resolve(request.result.messages);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = (e) => {
        console.warn('[ConversationDB] Failed to get conversation messages:', (e.target as IDBRequest).error);
        resolve(null);
      };
    });
  } catch (e) {
    console.warn('[ConversationDB] getConversationMessages error:', e);
    return null;
  }
}

export async function deleteConversationMessages(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (e) => {
        console.warn('[ConversationDB] Failed to delete conversation messages:', (e.target as IDBRequest).error);
        reject((e.target as IDBRequest).error);
      };
    });
  } catch (e) {
    console.warn('[ConversationDB] deleteConversationMessages error:', e);
  }
}

export async function clearAllConversationMessages(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readwrite');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[ConversationDB] clearAllConversationMessages error:', e);
  }
}

export async function _getAllConversationData(): Promise<{ id: string; messages: Message[] }[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MESSAGES, 'readonly');
      const store = tx.objectStore(STORE_MESSAGES);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[ConversationDB] _getAllConversationData error:', e);
    return [];
  }
}

export async function migrateOldConversations(): Promise<void> {
  try {
    const allData = await chrome.storage.local.get(null);
    const keysToRemove: string[] = [];

    // Gather markdown images during message migration to save to their respective metadata
    const metadataUpdates = new Map<string, string[]>();
    const MD_IMAGE_REGEX = /!\[.*?\]\((https?:\/\/[^)\s]+)\)/g;

    for (const key of Object.keys(allData)) {
      if (key.startsWith('conv_')) {
        const id = key.replace('conv_', '');
        const messages = allData[key];

        if (Array.isArray(messages) && messages.length > 0) {
          await saveConversationMessages(id, messages);
          
          // Legacy check for markdown images on those lost messages
          const mdImages = new Set<string>();
          messages.forEach((m: any) => {
            if (m.content) {
              let match;
              MD_IMAGE_REGEX.lastIndex = 0;
              while ((match = MD_IMAGE_REGEX.exec(m.content)) !== null) {
                mdImages.add(match[1]);
              }
            }
          });
          if (mdImages.size > 0) {
            metadataUpdates.set(id, Array.from(mdImages));
          }
        }
        keysToRemove.push(key);
      }
    }

    // Migrate old metadata array
    if (allData.conversations && Array.isArray(allData.conversations)) {
      for (const conv of allData.conversations) {
        if (metadataUpdates.has(conv.id)) {
           conv.markdownImages = metadataUpdates.get(conv.id);
        }
        await saveConversationMetadata(conv);
      }
      keysToRemove.push('conversations');
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`[ConversationDB] Migrated past conversations to IndexedDB.`);
    }
  } catch (e) {
    console.warn('[ConversationDB] Migration failed:', e);
  }
}

// --- METADATA OPERATIONS ---

export async function saveConversationMetadata(conv: Conversation): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_METADATA, 'readwrite');
    const store = tx.objectStore(STORE_METADATA);
    const request = store.put(conv);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => {
      console.error('[ConversationDB] Failed to save metadata:', (e.target as IDBRequest).error);
      reject((e.target as IDBRequest).error);
    };
  });
}

export async function deleteConversationMetadata(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_METADATA, 'readwrite');
      const store = tx.objectStore(STORE_METADATA);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[ConversationDB] deleteConversationMetadata error:', e);
  }
}

export async function getAllConversationMetadata(): Promise<Conversation[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_METADATA, 'readonly');
      const store = tx.objectStore(STORE_METADATA);
      const index = store.index('by_updated');
      const request = index.getAll();
      
      request.onsuccess = () => {
        const results: Conversation[] = request.result || [];
        // Sort descending by updatedAt
        resolve(results.reverse());
      };
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[ConversationDB] getAllConversationMetadata error:', e);
    return [];
  }
}

export async function clearAllConversationMetadata(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_METADATA, 'readwrite');
      const store = tx.objectStore(STORE_METADATA);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[ConversationDB] clearAllConversationMetadata error:', e);
  }
}
