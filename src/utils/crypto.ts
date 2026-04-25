// ── Primitives ────────────────────────────────────────────────────────────

export async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  let binary = '';
  const bytes = new Uint8Array(buffer instanceof ArrayBuffer ? buffer : buffer.buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/** Wrap Uint8Array so it satisfies BufferSource for strict TS. */
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer as ArrayBuffer;
}

// ── Key Derivation ───────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/** Derive an AES-256-GCM key from password + salt. Reuse across chunks. */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    toBuffer(encoder.encode(password)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Generate a random salt for key derivation. */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

// ── Chunked Encryption ───────────────────────────────────────────────────

export interface EncryptedChunk {
  iv: string;   // base64
  data: string; // base64
}

/** Encrypt a string with a pre-derived key. Unique IV per call. */
export async function encryptChunk(plaintext: string, key: CryptoKey): Promise<EncryptedChunk> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(encoded),
  );

  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
  };
}

/** Decrypt a chunk with a pre-derived key. */
export async function decryptChunk(
  encryptedData: string,
  ivBase64: string,
  key: CryptoKey,
): Promise<string> {
  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(encryptedData);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(ciphertext),
  );

  return new TextDecoder().decode(decrypted);
}

// ── Compression ──────────────────────────────────────────────────────────

/** Gzip-compress a string using native CompressionStream. */
export async function compressData(data: string): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decompress gzip data back to a string. */
export async function decompressData(data: Uint8Array): Promise<string> {
  const stream = new Blob([toBuffer(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

/** Compress then encrypt a chunk. Returns base64 payload + iv. */
export async function compressAndEncrypt(data: string, key: CryptoKey): Promise<EncryptedChunk & { compressed: true }> {
  const compressed = await compressData(data);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(compressed),
  );
  return {
    iv: arrayBufferToBase64(iv),
    data: arrayBufferToBase64(ciphertext),
    compressed: true,
  };
}

/** Decrypt then decompress a chunk. */
export async function decryptAndDecompress(
  encryptedData: string,
  ivBase64: string,
  key: CryptoKey,
): Promise<string> {
  const iv = base64ToArrayBuffer(ivBase64);
  const ciphertext = base64ToArrayBuffer(encryptedData);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(ciphertext),
  );

  return decompressData(new Uint8Array(decrypted));
}

// ── Legacy Monolithic Encryption (v1/v2 backward compat) ─────────────────

export async function encryptData(data: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const key = await deriveKey(password, salt);

  const encoded = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(encoded),
  );

  const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(encrypted), salt.length + iv.length);

  return arrayBufferToBase64(result);
}

export async function decryptData(encryptedBase64: string, password: string): Promise<string> {
  const data = base64ToArrayBuffer(encryptedBase64);

  const salt = data.slice(0, SALT_LENGTH);
  const iv = data.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const encrypted = data.slice(SALT_LENGTH + IV_LENGTH);

  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuffer(iv) },
    key,
    toBuffer(encrypted),
  );

  return new TextDecoder().decode(decrypted);
}
