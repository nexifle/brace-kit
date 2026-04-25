/**
 * Backup System Types
 *
 * Type definitions for the backup/restore system with API key portability.
 *
 * v1: Legacy flat format
 * v2: BackupPayload wrapper with encryption + API key support
 * v3: Chunked format — per-section encryption for memory safety
 */

import type { StoredImageRecord, Message, Conversation } from '../types';

// ── v1/v2 Legacy Types (kept for backward-compatible import) ─────────────

/** Non-sensitive backup content (settings, conversations, images) */
export interface BackupData {
  version: number;
  timestamp: number;
  storage: Record<string, unknown>;
  images: StoredImageRecord[];
  conversations?: { id: string; messages: Message[] }[];
  conversationMetadata?: Conversation[];
}

/** Wrapper for backup payload with encryption metadata */
export interface BackupPayload {
  encrypted: boolean;
  /** Version 2+ includes hasApiKeys flag */
  hasApiKeys?: boolean;
  data: string | BackupData;
  /** Encrypted API keys section (only present when hasApiKeys=true) */
  apiKeys?: string;
}

// ── v3 Chunked Types ─────────────────────────────────────────────────────

/** Section types that can appear as a chunk */
export type ChunkType = 'storage' | 'conversation' | 'conversation_metadata' | 'images' | 'api_keys';

/** A single encrypted section within a chunked backup */
export interface BackupChunk {
  type: ChunkType;
  /** Conversation ID (only for type='conversation') */
  id?: string;
  /** Unique IV per chunk (base64) */
  iv: string;
  /** AES-GCM encrypted payload (base64) */
  data: string;
  /** Whether gzip compression was applied before encryption */
  compressed?: boolean;
}

/** Metadata about backup contents, always unencrypted for inspection */
export interface ChunkedBackupMeta {
  timestamp: number;
  conversationCount: number;
  imageCount: number;
}

/** v3 chunked backup payload */
export interface ChunkedBackupPayload {
  version: 3;
  format: 'chunked';
  encrypted: boolean;
  /** PBKDF2 salt (base64) — shared across all chunks */
  salt?: string;
  hasApiKeys?: boolean;
  /** Unencrypted metadata for pre-import inspection */
  meta: ChunkedBackupMeta;
  /** Each chunk encrypted independently with derived key + unique IV */
  chunks: BackupChunk[];
}

// ── Shared Types ─────────────────────────────────────────────────────────

/**
 * Structure of decrypted API keys for backup.
 * All keys are plaintext (will be encrypted with backup password).
 */
export interface ApiKeyBundle {
  /** Primary provider config */
  providerConfig?: {
    apiKey?: string;
  };
  /** Per-provider keys */
  providerKeys?: Record<string, { apiKey: string; model?: string }>;
  /** Custom providers with their keys */
  customProviders?: Array<{ id: string; apiKey?: string }>;
  /** Google Search API key */
  googleSearchApiKey?: string;
  /** Keys that failed to decrypt (for UI warning) */
  _failedKeys?: string[];
}

/** Options for export operation */
export interface ExportOptions {
  /** User password for encryption (required if includeApiKeys=true) */
  password?: string;
  /** Whether to include API keys in backup */
  includeApiKeys: boolean;
  /** Progress callback: (phase, current, total) */
  onProgress?: (phase: ExportPhase, current: number, total: number) => void;
}

/** Phases during export for progress reporting */
export type ExportPhase = 'storage' | 'conversations' | 'images' | 'metadata' | 'encrypting';

/** Options for import operation */
export interface ImportOptions {
  /** Password for decryption (required if backup hasApiKeys=true) */
  password?: string;
  /** Progress callback: (phase, current, total) */
  onProgress?: (phase: ImportPhase, current: number, total: number) => void;
}

/** Phases during import for progress reporting */
export type ImportPhase = 'reading' | 'decrypting' | 'storage' | 'conversations' | 'images' | 'metadata' | 'api_keys';

/** Result of backup inspection (for UI display) */
export interface BackupInspection {
  /** Backup format version */
  version: number;
  /** When backup was created */
  timestamp: number;
  /** Whether backup is password-encrypted */
  encrypted: boolean;
  /** Whether backup contains API keys */
  hasApiKeys: boolean;
  /** Counts (v3 chunked format only) */
  meta?: ChunkedBackupMeta;
}
