/**
 * Backup System Types
 *
 * Type definitions for the backup/restore system with API key portability.
 *
 * Design principle: BackupData contains non-sensitive settings.
 * ApiKeyBundle contains secrets that are encrypted with user password.
 */

import type { StoredImageRecord, Message, Conversation } from '../types';

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
}

/** Options for import operation */
export interface ImportOptions {
  /** Password for decryption (required if backup hasApiKeys=true) */
  password?: string;
}

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
}
