import type { GeneratedImage, Message, StoredImageRecord } from '../types';

const DB_NAME = 'ai-sidebar-images';
const DB_VERSION = 1;
const STORE_NAME = 'generated_images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      store.createIndex('by_conversation', 'conversationId', { unique: false });
      store.createIndex('by_created', 'createdAt', { unique: false });
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      console.error('[ImageDB] Failed to open database:', err);
      dbPromise = null;
      reject(err);
    };
  });

  return dbPromise;
}

export function makeImageKey(
  conversationId: string,
  messageIndex: number,
  imageIndex: number
): string {
  return `img_${conversationId}_${messageIndex}_${imageIndex}`;
}

export async function saveImage(
  key: string,
  conversationId: string,
  messageIndex: number,
  imageIndex: number,
  mimeType: string,
  data: string
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record: StoredImageRecord = {
      key,
      conversationId,
      messageIndex,
      imageIndex,
      mimeType,
      data,
      createdAt: Date.now(),
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = (e) => {
      console.error('[ImageDB] Failed to save image:', (e.target as IDBRequest).error);
      reject((e.target as IDBRequest).error);
    };
  });
}

export async function getImage(key: string): Promise<StoredImageRecord | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = (e) => {
        console.warn('[ImageDB] Failed to get image:', (e.target as IDBRequest).error);
        resolve(null);
      };
    });
  } catch (e) {
    console.warn('[ImageDB] getImage error:', e);
    return null;
  }
}

export async function deleteImagesByConversation(conversationId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_conversation');
      const request = index.openCursor(IDBKeyRange.only(conversationId));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = (e) => {
        console.warn('[ImageDB] Failed to delete images for conversation:', (e.target as IDBRequest).error);
        resolve();
      };
    });
  } catch (e) {
    console.warn('[ImageDB] deleteImagesByConversation error:', e);
  }
}

export async function saveImagesForConversation(
  conversationId: string,
  messages: Message[]
): Promise<string[][]> {
  const keys: string[][] = [];

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const msg = messages[msgIdx];
    const msgKeys: string[] = [];

    if (msg.generatedImages && msg.generatedImages.length > 0) {
      for (let imgIdx = 0; imgIdx < msg.generatedImages.length; imgIdx++) {
        const img = msg.generatedImages[imgIdx];

        if (!img.data || img.data === '[IMAGE_DATA_NOT_SAVED]') {
          msgKeys.push('');
          continue;
        }

        const key = makeImageKey(conversationId, msgIdx, imgIdx);
        try {
          await saveImage(key, conversationId, msgIdx, imgIdx, img.mimeType, img.data);
          msgKeys.push(key);
        } catch (e) {
          console.warn('[ImageDB] Failed to save image, skipping:', e);
          msgKeys.push('');
        }
      }
    }

    keys.push(msgKeys);
  }

  return keys;
}

export interface ImagePage {
  images: StoredImageRecord[];
  hasMore: boolean;
}

export async function getImagePage(offset: number, limit: number): Promise<ImagePage> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const index = tx.objectStore(STORE_NAME).index('by_created');
      const images: StoredImageRecord[] = [];
      let skipped = 0;
      let request: IDBRequest<IDBCursorWithValue | null>;

      request = index.openCursor(null, 'prev');
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (!cursor) {
          resolve({ images, hasMore: false });
          return;
        }
        if (skipped < offset) {
          skipped += 1;
          cursor.continue();
          return;
        }
        if (images.length < limit) {
          images.push(cursor.value as StoredImageRecord);
          cursor.continue();
          return;
        }
        resolve({ images, hasMore: true });
      };
      request.onerror = (e) => {
        console.warn('[ImageDB] Failed to get image page:', (e.target as IDBRequest).error);
        resolve({ images: [], hasMore: false });
      };
    });
  } catch (e) {
    console.warn('[ImageDB] getImagePage error:', e);
    return { images: [], hasMore: false };
  }
}

export async function getImages(keys: string[]): Promise<StoredImageRecord[]> {
  if (keys.length === 0) return [];
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const results: StoredImageRecord[] = [];
      let pending = keys.length;
      let failed = false;

      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result) results.push(request.result as StoredImageRecord);
          if (--pending === 0) resolve(failed ? [] : results);
        };
        request.onerror = (e) => {
          failed = true;
          console.warn('[ImageDB] Failed to get image:', (e.target as IDBRequest).error);
          if (--pending === 0) resolve([]);
        };
      }
    });
  } catch (e) {
    console.warn('[ImageDB] getImages error:', e);
    return [];
  }
}

export async function getImageCount(): Promise<number> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  } catch (e) {
    console.warn('[ImageDB] getImageCount error:', e);
    return 0;
  }
}

export async function getAllImages(): Promise<StoredImageRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('by_created');
      const request = index.getAll();

      request.onsuccess = () => {
        const results: StoredImageRecord[] = request.result ?? [];
        resolve(results.reverse());
      };
      request.onerror = (e) => {
        console.warn('[ImageDB] Failed to get all images:', (e.target as IDBRequest).error);
        resolve([]);
      };
    });
  } catch (e) {
    console.warn('[ImageDB] getAllImages error:', e);
    return [];
  }
}

export async function hydrateMessages(messages: Message[]): Promise<Message[]> {
  return Promise.all(
    messages.map(async (msg) => {
      if (!msg.generatedImages || msg.generatedImages.length === 0) {
        return msg;
      }

      const hydratedImages: GeneratedImage[] = await Promise.all(
        msg.generatedImages.map(async (img) => {
          if (img.data && img.data !== '[IMAGE_DATA_NOT_SAVED]' && !img.imageRef) {
            return img;
          }

          if (img.imageRef) {
            const record = await getImage(img.imageRef);
            if (record) {
              return { mimeType: record.mimeType, data: record.data };
            }
          }

          return { mimeType: img.mimeType, data: '' };
        })
      );

      return { ...msg, generatedImages: hydratedImages };
    })
  );
}

export async function clearAllImages(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject((e.target as IDBRequest).error);
    });
  } catch (e) {
    console.warn('[ImageDB] clearAllImages error:', e);
  }
}

export async function importImages(records: StoredImageRecord[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Save each record preserving its original data including createdAt
    records.forEach((record) => {
      store.put(record);
    });

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject((e.target as IDBRequest).error);
  });
}
