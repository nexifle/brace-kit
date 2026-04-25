import {
  getAllImages,
  clearAllImages,
  importImages,
} from './imageDB.ts';
import {
  clearAllConversationMessages,
  saveConversationMessages,
  _getAllConversationData,
  getAllConversationMetadata,
  clearAllConversationMetadata,
  saveConversationMetadata,
} from './conversationDB.ts';
import type { Conversation, Message, StoredImageRecord } from '../types';
import type {
  BackupData,
  BackupPayload,
  BackupChunk,
  ChunkedBackupPayload,
  ExportOptions,
  ImportOptions,
  ApiKeyBundle,
} from './backup.types.ts';
import {
  deriveKey,
  generateSalt,
  decryptChunk,
  compressAndEncrypt,
  decryptAndDecompress,
  decryptData,
} from './crypto.ts';
import {
  extractApiKeys,
  encryptApiKeysForBackup,
  decryptApiKeysFromBackup,
  restoreApiKeysToStorage,
  hasAnyKeys,
} from './backupApiKeys.ts';

// Re-export types
export type {
  BackupData, BackupPayload, BackupInspection,
  ExportOptions, ImportOptions, ApiKeyBundle,
  ExportPhase, ImportPhase, ChunkedBackupPayload, BackupChunk,
} from './backup.types.ts';

// ── Helpers ──────────────────────────────────────────────────────────────

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Inspect ──────────────────────────────────────────────────────────────

/**
 * Inspect a backup file to show metadata without full import.
 * Supports v1/v2 legacy and v3 chunked formats.
 */
export async function inspectBackup(file: File): Promise<import('./backup.types.ts').BackupInspection> {
  const text = await file.text();
  const payload = JSON.parse(text);

  // v3 chunked format
  if (payload.format === 'chunked' && payload.version === 3) {
    const chunked = payload as ChunkedBackupPayload;
    return {
      version: 3,
      timestamp: chunked.meta.timestamp,
      encrypted: chunked.encrypted,
      hasApiKeys: chunked.hasApiKeys ?? false,
      meta: chunked.meta,
    };
  }

  // v2 BackupPayload wrapper
  if ('encrypted' in payload) {
    if (payload.encrypted) {
      return {
        version: 2,
        timestamp: 0,
        encrypted: true,
        hasApiKeys: payload.hasApiKeys ?? false,
      };
    }
    const data = payload.data as BackupData;
    return {
      version: data.version,
      timestamp: data.timestamp,
      encrypted: false,
      hasApiKeys: payload.hasApiKeys ?? false,
    };
  }

  // v1 legacy flat format
  if ('version' in payload) {
    const legacy = payload as BackupData;
    return {
      version: legacy.version,
      timestamp: legacy.timestamp,
      encrypted: false,
      hasApiKeys: false,
    };
  }

  throw new Error('Invalid backup file format');
}

// ── Export ───────────────────────────────────────────────────────────────

/**
 * Export application data to a chunked backup file (v3).
 * Each section is encrypted independently for memory safety.
 * Falls back to v2 monolithic format when no password is provided and no API keys.
 */
export async function exportData(optionsOrPassword?: string | ExportOptions): Promise<void> {
  const options: ExportOptions = typeof optionsOrPassword === 'string'
    ? { password: optionsOrPassword, includeApiKeys: false }
    : { password: undefined, includeApiKeys: false, ...optionsOrPassword };

  const { onProgress } = options;

  if (options.includeApiKeys && !options.password?.trim()) {
    throw new Error('Password is required when including API keys in backup.');
  }

  const hasPassword = !!options.password?.trim();

  // Collect lightweight metadata first to estimate progress
  const storage = await chrome.storage.local.get(null);
  const allConversations = await _getAllConversationData();
  const conversationMetadata = await getAllConversationMetadata();

  const totalConvs = allConversations.length;
  const totalSteps = 2 + totalConvs + 1; // storage + conversations + images/metadata
  let step = 0;

  // ── Phase 1: Derive key (if password provided) ────────────────────────
  let key: CryptoKey | undefined;
  let salt: Uint8Array | undefined;

  if (hasPassword) {
    salt = generateSalt();
    key = await deriveKey(options.password!, salt);
  }

  // ── Phase 2: Build chunks ─────────────────────────────────────────────
  const chunks: BackupChunk[] = [];

  // 2a. Storage chunk (settings — typically small)
  onProgress?.('storage', ++step, totalSteps);
  {
    const storageJson = JSON.stringify(storage);
    const encrypted = key
      ? await compressAndEncrypt(storageJson, key)
      : { iv: '', data: storageJson, compressed: false as const };
    chunks.push({ type: 'storage', ...encrypted });
  }

  // 2b. Conversation chunks (one per conversation — bounded memory)
  for (let i = 0; i < allConversations.length; i++) {
    onProgress?.('conversations', ++step, totalSteps);
    const conv = allConversations[i];
    const convJson = JSON.stringify({ id: conv.id, messages: conv.messages });
    const encrypted = key
      ? await compressAndEncrypt(convJson, key)
      : { iv: '', data: convJson, compressed: false as const };
    chunks.push({ type: 'conversation', id: conv.id, ...encrypted });
    // Release reference early for GC
    (allConversations as any)[i] = null;
  }

  // 2c. Images chunk
  onProgress?.('images', ++step, totalSteps);
  {
    const images = await getAllImages();
    // Split into batches of 50 to bound memory during serialization
    const BATCH_SIZE = 50;
    for (let i = 0; i < images.length; i += BATCH_SIZE) {
      const batch = images.slice(i, i + BATCH_SIZE);
      const batchJson = JSON.stringify(batch);
      const encrypted = key
        ? await compressAndEncrypt(batchJson, key)
        : { iv: '', data: batchJson, compressed: false as const };
      chunks.push({ type: 'images', ...encrypted });
    }
  }

  // 2d. Conversation metadata chunk
  onProgress?.('metadata', ++step, totalSteps);
  {
    const metaJson = JSON.stringify(conversationMetadata);
    const encrypted = key
      ? await compressAndEncrypt(metaJson, key)
      : { iv: '', data: metaJson, compressed: false as const };
    chunks.push({ type: 'conversation_metadata', ...encrypted });
  }

  // 2e. API keys chunk (if requested)
  let encryptedApiKeys: string | undefined;
  if (options.includeApiKeys && options.password) {
    const apiKeysBundle = await extractApiKeys(storage);
    if (apiKeysBundle._failedKeys && apiKeysBundle._failedKeys.length > 0) {
      throw new Error(`Some API keys could not be decrypted and were not included: ${apiKeysBundle._failedKeys.join(', ')}. Please re-enter your API keys and try again.`);
    }
    if (hasAnyKeys(apiKeysBundle)) {
      encryptedApiKeys = await encryptApiKeysForBackup(apiKeysBundle, options.password);
      const keysJson = JSON.stringify(apiKeysBundle);
      const encrypted = await compressAndEncrypt(keysJson, key!);
      chunks.push({ type: 'api_keys', ...encrypted });
    }
  }

  // ── Phase 3: Assemble payload and download ────────────────────────────
  onProgress?.('encrypting', step, totalSteps);

  const payload: ChunkedBackupPayload = {
    version: 3,
    format: 'chunked',
    encrypted: hasPassword,
    salt: salt ? btoa(String.fromCharCode(...salt)) : undefined,
    hasApiKeys: !!encryptedApiKeys,
    meta: {
      timestamp: Date.now(),
      conversationCount: totalConvs,
      imageCount: chunks.filter(c => c.type === 'images').length,
    },
    chunks,
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

// ── Import ───────────────────────────────────────────────────────────────

/**
 * Import data from a backup file.
 * Supports v1 (legacy flat), v2 (BackupPayload wrapper), and v3 (chunked).
 */
export async function importData(file: File, optionsOrPassword?: string | ImportOptions): Promise<void> {
  const options: ImportOptions = typeof optionsOrPassword === 'string'
    ? { password: optionsOrPassword }
    : { password: undefined, ...optionsOrPassword };

  const { onProgress } = options;
  onProgress?.('reading', 0, 1);

  const text = await file.text();
  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Invalid backup file format (Not valid JSON)');
  }

  // ── Route to appropriate handler ──────────────────────────────────────

  // v3 chunked format
  if (payload.format === 'chunked' && payload.version === 3) {
    return importChunked(payload as ChunkedBackupPayload, options);
  }

  // v2 BackupPayload wrapper
  if ('encrypted' in payload && !('format' in payload)) {
    return importV2(payload as BackupPayload, options);
  }

  // v1 legacy flat format
  if ('version' in payload && !('encrypted' in payload)) {
    return importV1(payload as BackupData);
  }

  throw new Error('Invalid backup file structure.');
}

// ── v3 Chunked Import ────────────────────────────────────────────────────

async function importChunked(payload: ChunkedBackupPayload, options: ImportOptions): Promise<void> {
  const { onProgress } = options;

  if (payload.encrypted && !options.password?.trim()) {
    throw new Error('Password required to decrypt this backup.');
  }

  // Derive key once
  let key: CryptoKey | undefined;
  if (payload.encrypted && options.password && payload.salt) {
    onProgress?.('decrypting', 0, 1);
    const salt = base64ToUint8(payload.salt);
    key = await deriveKey(options.password, salt);
  }

  const chunks = payload.chunks;
  const totalChunks = chunks.length;
  let processedChunks = 0;

  // Collect data as we process chunks
  let storageData: Record<string, unknown> | undefined;
  const conversations: { id: string; messages: Message[] }[] = [];
  const allImages: StoredImageRecord[] = [];
  let conversationMetadata: Conversation[] | undefined;
  let apiKeyBundle: ApiKeyBundle | undefined;

  for (const chunk of chunks) {
    processedChunks++;

    const decryptedStr = key
      ? (chunk.compressed
        ? await decryptAndDecompress(chunk.data, chunk.iv, key)
        : await decryptChunk(chunk.data, chunk.iv, key))
      : chunk.data; // Unencrypted

    switch (chunk.type) {
      case 'storage':
        onProgress?.('storage', processedChunks, totalChunks);
        storageData = JSON.parse(decryptedStr) as Record<string, unknown>;
        break;

      case 'conversation':
        onProgress?.('conversations', processedChunks, totalChunks);
        conversations.push(JSON.parse(decryptedStr));
        break;

      case 'images':
        onProgress?.('images', processedChunks, totalChunks);
        const imageBatch = JSON.parse(decryptedStr) as StoredImageRecord[];
        allImages.push(...imageBatch);
        break;

      case 'conversation_metadata':
        onProgress?.('metadata', processedChunks, totalChunks);
        conversationMetadata = JSON.parse(decryptedStr) as Conversation[];
        break;

      case 'api_keys':
        onProgress?.('api_keys', processedChunks, totalChunks);
        if (options.password) {
          // For v3, API keys are embedded in chunks, but we also check
          // the separate encrypted field for backward compat during export
          apiKeyBundle = JSON.parse(decryptedStr) as ApiKeyBundle;
        }
        break;
    }
  }

  if (!storageData) {
    throw new Error('Invalid backup: missing storage section.');
  }

  // ── Handle API keys from v2-style separate field (if present) ───────
  let finalStorage = { ...storageData };
  if (payload.hasApiKeys && !apiKeyBundle && payload.encrypted) {
    // This shouldn't happen for v3 chunked, but handle gracefully
    throw new Error('Password required to restore API keys from this backup.');
  }

  if (apiKeyBundle) {
    finalStorage = await restoreApiKeysToStorage(apiKeyBundle, finalStorage);
  }

  // ── Write to storage ─────────────────────────────────────────────────
  const existingData = await chrome.storage.local.get('_deviceEncryptionKey');
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    ...finalStorage,
    _deviceEncryptionKey: existingData._deviceEncryptionKey,
  });

  // ── Restore images (batched) ─────────────────────────────────────────
  if (allImages.length > 0) {
    await clearAllImages();
    await importImages(allImages);
  }

  // ── Restore conversations (parallel) ─────────────────────────────────
  if (conversations.length > 0) {
    await clearAllConversationMessages();
    await Promise.all(
      conversations.map(conv => saveConversationMessages(conv.id, conv.messages)),
    );
  }

  // ── Restore metadata (parallel) ──────────────────────────────────────
  await clearAllConversationMetadata();
  if (conversationMetadata && conversationMetadata.length > 0) {
    await Promise.all(
      conversationMetadata.map(meta => saveConversationMetadata(meta)),
    );
  } else if (conversations.length > 0) {
    // Fallback: reconstruct metadata from messages
    await Promise.all(
      conversations.map(conv => {
        const firstUserMsg = conv.messages.find(m => m.role === 'user');
        const rawTitle = firstUserMsg
          ? (firstUserMsg.displayContent || firstUserMsg.content || '')
          : '';
        const title = rawTitle.slice(0, 50) || 'Imported Chat';
        const now = Date.now();
        const meta: Conversation = { id: conv.id, title, createdAt: now, updatedAt: now };
        return saveConversationMetadata(meta);
      }),
    );
  }
}

// ── v2 Legacy Import ─────────────────────────────────────────────────────

async function importV2(payload: BackupPayload, options: ImportOptions): Promise<void> {
  const { onProgress } = options;
  let backupData: BackupData;

  if (payload.encrypted) {
    if (!options.password?.trim()) {
      throw new Error('Password required to decrypt this backup.');
    }
    onProgress?.('decrypting', 0, 1);
    try {
      const decryptedJson = await decryptData(payload.data as string, options.password);
      backupData = JSON.parse(decryptedJson);
    } catch {
      throw new Error('Incorrect password or corrupted data.');
    }
  } else {
    backupData = payload.data as BackupData;
  }

  if (!backupData?.version || !backupData.storage) {
    throw new Error('Invalid backup file structure.');
  }

  // Handle API keys restoration
  let finalStorage = { ...backupData.storage };
  if (payload.hasApiKeys && payload.apiKeys) {
    if (!options.password?.trim()) {
      throw new Error('Password required to restore API keys from this backup.');
    }
    onProgress?.('api_keys', 0, 1);
    try {
      const apiKeyBundle = await decryptApiKeysFromBackup(payload.apiKeys, options.password);
      finalStorage = await restoreApiKeysToStorage(apiKeyBundle, finalStorage);
    } catch {
      throw new Error('Failed to decrypt API keys. Incorrect password.');
    }
  }

  await writeToStorage(finalStorage, backupData, onProgress);
}

// ── v1 Legacy Import ─────────────────────────────────────────────────────

async function importV1(backupData: BackupData): Promise<void> {
  if (!backupData.version || !backupData.storage) {
    throw new Error('Invalid backup file structure.');
  }
  await writeToStorage(backupData.storage, backupData);
}

// ── Shared: Write imported data to storage ───────────────────────────────

async function writeToStorage(
  storage: Record<string, unknown>,
  backupData: BackupData,
  onProgress?: ImportOptions['onProgress'],
): Promise<void> {
  // 1. Restore chrome.storage
  const existingData = await chrome.storage.local.get('_deviceEncryptionKey');
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    ...storage,
    _deviceEncryptionKey: existingData._deviceEncryptionKey,
  });

  // 2. Restore images
  if (backupData.images?.length) {
    onProgress?.('images', 0, 1);
    await clearAllImages();
    await importImages(backupData.images);
  }

  // 3. Restore conversations (parallel)
  if (backupData.conversations?.length) {
    onProgress?.('conversations', 0, backupData.conversations.length);
    await clearAllConversationMessages();
    await Promise.all(
      backupData.conversations.map(conv => saveConversationMessages(conv.id, conv.messages)),
    );
  }

  // 4. Restore metadata (parallel)
  await clearAllConversationMetadata();
  if (backupData.conversationMetadata?.length) {
    await Promise.all(
      backupData.conversationMetadata.map(meta => saveConversationMetadata(meta)),
    );
  } else if (backupData.conversations?.length) {
    await Promise.all(
      backupData.conversations.map(conv => {
        const firstUserMsg = conv.messages.find(m => m.role === 'user');
        const rawTitle = firstUserMsg
          ? (firstUserMsg.displayContent || firstUserMsg.content || '')
          : '';
        const title = rawTitle.slice(0, 50) || 'Imported Chat';
        const now = Date.now();
        const meta: Conversation = { id: conv.id, title, createdAt: now, updatedAt: now };
        return saveConversationMetadata(meta);
      }),
    );
  }
}

// ── Reset ────────────────────────────────────────────────────────────────

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
