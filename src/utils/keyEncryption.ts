/**
 * Key Encryption Module
 * Provides transparent encryption/decryption for API keys using a device-bound key.
 *
 * Encryption format: "enc:" + base64(salt + iv + ciphertext)
 * Compatible with existing crypto.ts functions
 */

import { encryptData, decryptData } from './crypto.ts';

/** Storage key for the device encryption key */
const ENCRYPTION_KEY_NAME = '_deviceEncryptionKey';

/** Prefix for encrypted values */
const ENCRYPTED_PREFIX = 'enc:';

/** Mutex for key creation to prevent race conditions */
let keyCreationPromise: Promise<string> | null = null;

async function withDeviceKeyLock<T>(fn: () => Promise<T>): Promise<T> {
  const request = globalThis.navigator?.locks?.request?.bind(globalThis.navigator.locks);
  if (request) {
    return request(ENCRYPTION_KEY_NAME, fn);
  }
  return fn();
}

/**
 * Get or create the device-bound encryption key
 * Uses a random 32-byte key stored in chrome.storage.local
 * Thread-safe across the service worker and UI via Web Locks + re-read.
 */
async function getOrCreateEncryptionKey(): Promise<string> {
  if (keyCreationPromise) return keyCreationPromise;

  keyCreationPromise = withDeviceKeyLock(async () => {
    const existing = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);
    if (typeof existing[ENCRYPTION_KEY_NAME] === 'string' && existing[ENCRYPTION_KEY_NAME]) {
      return existing[ENCRYPTION_KEY_NAME] as string;
    }

    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const key = btoa(String.fromCharCode(...keyBytes));

    // Another context may have won while we generated a candidate — never overwrite.
    const raced = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);
    if (typeof raced[ENCRYPTION_KEY_NAME] === 'string' && raced[ENCRYPTION_KEY_NAME]) {
      return raced[ENCRYPTION_KEY_NAME] as string;
    }

    await chrome.storage.local.set({ [ENCRYPTION_KEY_NAME]: key });
    const winner = await chrome.storage.local.get(ENCRYPTION_KEY_NAME);
    return (typeof winner[ENCRYPTION_KEY_NAME] === 'string' && winner[ENCRYPTION_KEY_NAME])
      ? (winner[ENCRYPTION_KEY_NAME] as string)
      : key;
  }).finally(() => {
    keyCreationPromise = null;
  });

  return keyCreationPromise;
}

/**
 * Check if a value is already encrypted
 * Validates both prefix and base64 structure
 */
export function isEncrypted(value: string | undefined | null): boolean {
  if (typeof value !== 'string' || !value.startsWith(ENCRYPTED_PREFIX)) {
    return false;
  }

  const payload = value.slice(ENCRYPTED_PREFIX.length);

  // Minimum length check: encrypted data contains:
  // 16 (salt) + 12 (iv) + ciphertext + 16 (auth tag) = 44+ bytes
  // Base64 encoded minimum ~60 chars
  if (payload.length < 60) {
    return false;
  }

  // Validate base64 format
  try {
    atob(payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt an API key
 * Returns encrypted value with prefix, or original value if empty/already encrypted
 * On encryption error, returns empty string (silent fail)
 */
export async function encryptApiKey(plaintext: string): Promise<string> {
  if (!plaintext) return '';
  if (isEncrypted(plaintext)) return plaintext;

  try {
    const key = await getOrCreateEncryptionKey();
    const encrypted = await encryptData(plaintext, key);
    return ENCRYPTED_PREFIX + encrypted;
  } catch (e) {
    console.error('[KeyEncryption] Encryption failed:', e);
    return '';
  }
}

/**
 * Decrypt an API key
 * Returns decrypted value, or empty string on error (silent fail)
 * Handles both encrypted (prefixed) and plaintext values for migration
 */
export async function decryptApiKey(ciphertext: string | undefined | null): Promise<string> {
  if (!ciphertext) return '';

  // Not encrypted - return as-is (migration case)
  if (!isEncrypted(ciphertext)) {
    return ciphertext;
  }

  try {
    const key = await getOrCreateEncryptionKey();
    const encrypted = ciphertext.slice(ENCRYPTED_PREFIX.length);
    return await decryptData(encrypted, key);
  } catch (e) {
    console.warn('[KeyEncryption] Stale ciphertext; treating as empty:', e);
    return '';
  }
}

/**
 * Encrypt API key if not already encrypted (for migration)
 */
export async function ensureEncrypted(value: string): Promise<string> {
  if (!value || isEncrypted(value)) return value;
  return encryptApiKey(value);
}
