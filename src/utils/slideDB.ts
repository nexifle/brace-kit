import type { SlideActivityEvent, SlideFile, SlideProject, SlideRound } from '../types/index.ts';

// ==================== Slide Project IndexedDB ====================
// Dedicated database for Slide Creator projects — separate from the main chat
// conversation/image DBs. Persists project metadata, main transcript, VFS files,
// phase, canvas, and pending ask so the workspace survives extension reloads.

const DB_NAME = 'ai-sidebar-slide-projects';
const DB_VERSION = 4;

const STORE_PROJECTS = 'slide_projects'; // keyPath: project id
const STORE_MESSAGES = 'slide_messages'; // keyPath: project id -> { messages }
const STORE_FILES = 'slide_files'; // keyPath: project id -> { files }
const STORE_ACTIVITY = 'slide_activity'; // keyPath: project id -> { activity }
const STORE_ROUNDS = 'slide_rounds'; // keyPath: project id -> { id, rounds, roundIndex }
const STORE_PLAN_TRANSCRIPT = 'slide_plan_transcript'; // keyPath: project id -> { planTranscript }
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
      if (!db.objectStoreNames.contains(STORE_ACTIVITY)) {
        db.createObjectStore(STORE_ACTIVITY, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ROUNDS)) {
        db.createObjectStore(STORE_ROUNDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PLAN_TRANSCRIPT)) {
        db.createObjectStore(STORE_PLAN_TRANSCRIPT, { keyPath: 'id' });
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

/** The full project as persisted across the stores. */
export interface FullSlideProject extends SlideProject {
  /** Capped activity feed persisted alongside the project (US-047). */
  activity: SlideActivityEvent[];
  /** Deck-generation checkpoints (oldest → newest); may be empty for legacy projects. */
  rounds: SlideRound[];
  /** Index into `rounds` currently active; -1 when no rounds exist. */
  roundIndex: number;
}

/** Cap for a persisted activity feed (Amendment A.14): drop the OLDEST beyond this. */
export const MAX_SLIDE_ACTIVITY_EVENTS = 200;

/**
 * Cap an activity feed at `max` events, keeping the most recent `max` and
 * dropping the oldest (front). The feed is append-only in order, so the tail
 * is the freshest run(s). Returns a copy only when trimming is needed.
 */
export function capSlideActivity(
  events: SlideActivityEvent[],
  max: number = MAX_SLIDE_ACTIVITY_EVENTS,
): SlideActivityEvent[] {
  if (events.length <= max) return events;
  return events.slice(events.length - max);
}

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
  if (project.planTranscript) {
    await runRequest<void>(
      STORE_PLAN_TRANSCRIPT,
      'readwrite',
      (store) => store.put({ id: project.id, planTranscript: project.planTranscript }),
      'saveSlideProject (planTranscript)'
    );
  } else {
    // Remove any previously-persisted transcript so a cleared one (e.g. after a
    // manual plan-doc edit invalidates it) doesn't linger and get rehydrated.
    await runRequest<void>(
      STORE_PLAN_TRANSCRIPT,
      'readwrite',
      (store) => store.delete(project.id),
      'saveSlideProject (planTranscript clear)'
    );
  }
}

/**
 * Persist a project's activity feed, capped at `MAX_SLIDE_ACTIVITY_EVENTS`
 * (Amendment A.14): the oldest events are dropped when the cap is exceeded, so
 * at least the last run survives a reload. `streamingText`/`streamingReasoning`
 * are deliberately NOT part of the feed and are never persisted.
 */
export async function saveSlideActivity(
  id: string,
  activity: SlideActivityEvent[],
): Promise<void> {
  await runRequest<void>(
    STORE_ACTIVITY,
    'readwrite',
    (store) => store.put({ id, activity: capSlideActivity(activity) }),
    'saveSlideActivity'
  );
}

/** A project's last-persisted (capped) activity feed, or `[]` if none. */
export async function getSlideActivity(id: string): Promise<SlideActivityEvent[]> {
  try {
    const rec = await runRequest<{ activity: SlideActivityEvent[] } | undefined>(
      STORE_ACTIVITY,
      'readonly',
      (store) => store.get(id),
      'getSlideActivity'
    );
    return rec?.activity ?? [];
  } catch (e) {
    console.warn('[SlideDB] getSlideActivity error:', e);
    return [];
  }
}

/**
 * Persist a project's deck-generation rounds (undo/redo history) together with
 * the active round pointer. Rounds are snapshots of the VFS taken at each
 * completed build/edit land; restoring moves the pointer and re-persists the
 * pointed-to files via `saveSlideProject`.
 */
export async function saveSlideRounds(
  id: string,
  rounds: SlideRound[],
  roundIndex: number,
): Promise<void> {
  await runRequest<void>(
    STORE_ROUNDS,
    'readwrite',
    (store) => store.put({ id, rounds, roundIndex }),
    'saveSlideRounds'
  );
}

/** A project's persisted rounds + active pointer, or `{ [], -1 }` if none. */
export async function getSlideRounds(id: string): Promise<{
  rounds: SlideRound[];
  roundIndex: number;
}> {
  try {
    const rec = await runRequest<{ rounds: SlideRound[]; roundIndex: number } | undefined>(
      STORE_ROUNDS,
      'readonly',
      (store) => store.get(id),
      'getSlideRounds'
    );
    return { rounds: rec?.rounds ?? [], roundIndex: rec?.roundIndex ?? -1 };
  } catch (e) {
    console.warn('[SlideDB] getSlideRounds error:', e);
    return { rounds: [], roundIndex: -1 };
  }
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

    const [messagesRec, filesRec, activityRec, roundsRec, planTranscriptRec] = await Promise.all([
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
      runRequest<{ activity: SlideActivityEvent[] } | undefined>(
        STORE_ACTIVITY,
        'readonly',
        (store) => store.get(id),
        'getSlideProject (activity)'
      ),
      runRequest<{ rounds: SlideRound[]; roundIndex: number } | undefined>(
        STORE_ROUNDS,
        'readonly',
        (store) => store.get(id),
        'getSlideProject (rounds)'
      ),
      runRequest<{ planTranscript: SlideProject['planTranscript'] } | undefined>(
        STORE_PLAN_TRANSCRIPT,
        'readonly',
        (store) => store.get(id),
        'getSlideProject (planTranscript)'
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
      activity: activityRec?.activity ?? [],
      rounds: roundsRec?.rounds ?? [],
      roundIndex: roundsRec?.roundIndex ?? -1,
      planTranscript: planTranscriptRec?.planTranscript,
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
    [STORE_PROJECTS, STORE_MESSAGES, STORE_FILES, STORE_ACTIVITY, STORE_ROUNDS, STORE_PLAN_TRANSCRIPT, STORE_LAST_ACTIVE],
    'readwrite'
  );
  tx.objectStore(STORE_PROJECTS).delete(id);
  tx.objectStore(STORE_MESSAGES).delete(id);
  tx.objectStore(STORE_FILES).delete(id);
  tx.objectStore(STORE_ACTIVITY).delete(id);
  tx.objectStore(STORE_ROUNDS).delete(id);
  tx.objectStore(STORE_PLAN_TRANSCRIPT).delete(id);
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
    [STORE_PROJECTS, STORE_MESSAGES, STORE_FILES, STORE_ACTIVITY, STORE_ROUNDS, STORE_PLAN_TRANSCRIPT, STORE_LAST_ACTIVE],
    'readwrite'
  );
  tx.objectStore(STORE_PROJECTS).clear();
  tx.objectStore(STORE_MESSAGES).clear();
  tx.objectStore(STORE_FILES).clear();
  tx.objectStore(STORE_ACTIVITY).clear();
  tx.objectStore(STORE_ROUNDS).clear();
  tx.objectStore(STORE_PLAN_TRANSCRIPT).clear();
  tx.objectStore(STORE_LAST_ACTIVE).clear();

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
