import type { SlideFile, SlideProject } from '../types/index.ts';

// ==================== Slide Project IndexedDB ====================
// Dedicated database for Slide Creator projects — separate from the main chat
// conversation/image DBs. Persists project metadata, main transcript, VFS files,
// phase, canvas, and pending ask so the workspace survives extension reloads.

const DB_NAME = 'ai-sidebar-slide-projects';
const DB_VERSION = 1;

const STORE_PROJECTS = 'slide_projects'; // keyPath: project id
const STORE_MESSAGES = 'slide_messages'; // keyPath: project id -> { messages }
const STORE_FILES = 'slide_files'; // keyPath: project id -> { files }
const STORE_LAST_ACTIVE = 'slide_last_active'; // keyPath: 'key'

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('by_updated', 'updatedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
        db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_LAST_ACTIVE)) {
        db.createObjectStore(STORE_LAST_ACTIVE, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      console.error('[SlideDB] Failed to open database:', err);
      dbPromise = null;
      reject(err);
    };

    request.onblocked = () => {
      console.warn('[SlideDB] Database upgrade blocked by an open connection.');
      dbPromise = null;
      reject(new Error('[SlideDB] Database upgrade blocked'));
    };
  });

  return dbPromise;
}

export function _closeSlideDB(): void {
  if (dbPromise) {
    dbPromise.then((db) => {
      db.close();
      dbPromise = null;
    });
  }
}

// --- project metadata ---

export interface StoredSlideProject {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  phase: SlideProject['phase'];
  canvas: SlideProject['canvas'];
  pendingAsk?: SlideProject['pendingAsk'];
  stopped?: boolean;
}

/** The full project as persisted across the three stores. */
export interface FullSlideProject extends SlideProject {}

function toMetadata(project: SlideProject): StoredSlideProject {
  return {
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    phase: project.phase,
    canvas: project.canvas,
    pendingAsk: project.pendingAsk,
    stopped: project.stopped,
  };
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<any>,
  label: string
): Promise<T> {
  return new Promise<T>(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = op(store);
      if (mode !== 'readonly') {
        // Writes resolve on commit, never on the request event, so a read opened
        // right after (e.g. getSlideProject) sees the durable record.
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        return;
      }
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } catch (e) {
      console.warn(`[SlideDB] ${label} error:`, e);
      reject(e);
    }
  });
}

/**
 * Persist a project. Stores metadata, main transcript, and VFS files each in
 * their own store so they can be loaded/cleared independently. The project's
 * `updatedAt` is refreshed to `now` unless already newer (keeps the list sorted).
 */
export async function saveSlideProject(project: SlideProject): Promise<void> {
  const metadata = toMetadata({ ...project, updatedAt: Date.now() });

  await runRequest<void>(
    STORE_PROJECTS,
    'readwrite',
    (store) => store.put(metadata),
    'saveSlideProject (metadata)'
  );
  await runRequest<void>(
    STORE_MESSAGES,
    'readwrite',
    (store) => store.put({ id: project.id, messages: project.messages }),
    'saveSlideProject (messages)'
  );
  await runRequest<void>(
    STORE_FILES,
    'readwrite',
    (store) => store.put({ id: project.id, files: project.files }),
    'saveSlideProject (files)'
  );
}

/**
 * Reassemble a full project from metadata + messages + files, or `null` if the
 * project (or its metadata) does not exist.
 */
export async function getSlideProject(id: string): Promise<FullSlideProject | null> {
  try {
    const metadata = await runRequest<StoredSlideProject | undefined>(
      STORE_PROJECTS,
      'readonly',
      (store) => store.get(id),
      'getSlideProject (metadata)'
    );
    if (!metadata) return null;

    const [messagesRec, filesRec] = await Promise.all([
      runRequest<{ messages: SlideProject['messages'] } | undefined>(
        STORE_MESSAGES,
        'readonly',
        (store) => store.get(id),
        'getSlideProject (messages)'
      ),
      runRequest<{ files: SlideFile[] } | undefined>(
        STORE_FILES,
        'readonly',
        (store) => store.get(id),
        'getSlideProject (files)'
      ),
    ]);

    return {
      id: metadata.id,
      title: metadata.title,
      createdAt: metadata.createdAt,
      updatedAt: metadata.updatedAt,
      phase: metadata.phase,
      canvas: metadata.canvas,
      pendingAsk: metadata.pendingAsk,
      stopped: metadata.stopped,
      messages: messagesRec?.messages ?? [],
      files: filesRec?.files ?? [],
    };
  } catch (e) {
    console.warn('[SlideDB] getSlideProject error:', e);
    return null;
  }
}

/** List all projects', sorted by most-recently updated first. */
export async function listSlideProjects(): Promise<StoredSlideProject[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      const index = store.index('by_updated');
      const request = index.getAll();

      request.onsuccess = () => {
        const results: StoredSlideProject[] = request.result ?? [];
        resolve(results.reverse());
      };
      request.onerror = (e) => {
        console.warn('[SlideDB] listSlideProjects error:', (e.target as IDBRequest).error);
        resolve([]);
      };
    });
  } catch (e) {
    console.warn('[SlideDB] listSlideProjects error:', e);
    return [];
  }
}

/** Delete a project and all of its related data (messages + files + last-active). */
export async function deleteSlideProject(id: string): Promise<void> {
  const isLastActive = (await getLastActiveSlideProject()) === id;
  const db = await openDB();
  const tx = db.transaction(
    [STORE_PROJECTS, STORE_MESSAGES, STORE_FILES, STORE_LAST_ACTIVE],
    'readwrite'
  );
  tx.objectStore(STORE_PROJECTS).delete(id);
  tx.objectStore(STORE_MESSAGES).delete(id);
  tx.objectStore(STORE_FILES).delete(id);
  if (isLastActive) {
    tx.objectStore(STORE_LAST_ACTIVE).delete('active');
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Persist the id of the project to restore as active after reload. */
export async function setLastActiveSlideProject(id: string): Promise<void> {
  await runRequest<void>(
    STORE_LAST_ACTIVE,
    'readwrite',
    (store) => store.put({ key: 'active', projectId: id }),
    'setLastActiveSlideProject'
  );
}

/** The id of the last-active slide project, or `null` if none. */
export async function getLastActiveSlideProject(): Promise<string | null> {
  try {
    const rec = await runRequest<{ projectId: string } | undefined>(
      STORE_LAST_ACTIVE,
      'readonly',
      (store) => store.get('active'),
      'getLastActiveSlideProject'
    );
    return rec?.projectId ?? null;
  } catch (e) {
    console.warn('[SlideDB] getLastActiveSlideProject error:', e);
    return null;
  }
}

/** Remove every slide project (metadata, messages, files, last-active). */
export async function clearAllSlideProjects(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(
    [STORE_PROJECTS, STORE_MESSAGES, STORE_FILES, STORE_LAST_ACTIVE],
    'readwrite'
  );
  tx.objectStore(STORE_PROJECTS).clear();
  tx.objectStore(STORE_MESSAGES).clear();
  tx.objectStore(STORE_FILES).clear();
  tx.objectStore(STORE_LAST_ACTIVE).clear();

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
