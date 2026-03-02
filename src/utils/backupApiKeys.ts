/**
 * API Key Backup Service
 *
 * Handles extraction, encryption, and restoration of API keys
 * for the backup/restore workflow.
 *
 * Security model:
 * - Keys are stored encrypted with device key at rest
 * - For backup, keys are decrypted then re-encrypted with user password
 * - On restore, keys are decrypted from password then re-encrypted with new device key
 */

import { decryptApiKey, encryptApiKey } from './keyEncryption.ts';
import { encryptData, decryptData } from './crypto.ts';
import type { ApiKeyBundle } from './backup.types.ts';

/**
 * Extract API keys from storage data into a portable bundle.
 * Decrypts device-encrypted keys to plaintext for password encryption.
 *
 * @throws Error if any API key fails to decrypt (to alert user of incomplete backup)
 */
export async function extractApiKeys(
  storage: Record<string, unknown>
): Promise<ApiKeyBundle> {
  const bundle: ApiKeyBundle = {};
  const failedKeys: string[] = [];

  // Extract providerConfig.apiKey
  const providerConfig = storage.providerConfig as { apiKey?: string } | undefined;
  if (providerConfig?.apiKey) {
    const decrypted = await decryptApiKey(providerConfig.apiKey);
    if (decrypted) {
      bundle.providerConfig = { apiKey: decrypted };
    } else {
      failedKeys.push('providerConfig.apiKey');
    }
  }

  // Extract providerKeys (parallel decryption)
  const providerKeys = storage.providerKeys as Record<string, { apiKey?: string; model?: string }> | undefined;
  if (providerKeys && Object.keys(providerKeys).length > 0) {
    const entries = Object.entries(providerKeys).filter(([, data]) => data.apiKey);
    const decryptedEntries = await Promise.all(
      entries.map(async ([id, data]) => ({
        id,
        model: data.model,
        decrypted: await decryptApiKey(data.apiKey!),
      }))
    );
    bundle.providerKeys = {};
    for (const { id, model, decrypted } of decryptedEntries) {
      if (decrypted) {
        bundle.providerKeys[id] = { apiKey: decrypted, model };
      } else {
        failedKeys.push(`providerKeys.${id}`);
      }
    }
  }

  // Extract customProviders API keys (parallel decryption)
  const customProviders = storage.customProviders as Array<{ id: string; apiKey?: string }> | undefined;
  if (customProviders && customProviders.length > 0) {
    const decryptedProviders = await Promise.all(
      customProviders.map(async (provider) => {
        if (!provider.apiKey) {
          return { id: provider.id, apiKey: undefined, success: true };
        }
        const decrypted = await decryptApiKey(provider.apiKey);
        return {
          id: provider.id,
          apiKey: decrypted,
          success: !!decrypted,
        };
      })
    );
    bundle.customProviders = [];
    for (const { id, apiKey, success } of decryptedProviders) {
      if (apiKey) {
        bundle.customProviders.push({ id, apiKey });
      } else if (!success && customProviders.find(p => p.id === id)?.apiKey) {
        failedKeys.push(`customProviders.${id}`);
        bundle.customProviders.push({ id });
      } else {
        bundle.customProviders.push({ id });
      }
    }
  }

  // Extract googleSearchApiKey
  const googleSearchApiKey = storage.googleSearchApiKey as string | undefined;
  if (googleSearchApiKey) {
    const decrypted = await decryptApiKey(googleSearchApiKey);
    if (decrypted) {
      bundle.googleSearchApiKey = decrypted;
    } else {
      failedKeys.push('googleSearchApiKey');
    }
  }

  // Include failed keys info for UI warning
  if (failedKeys.length > 0) {
    bundle._failedKeys = failedKeys;
  }

  return bundle;
}

/**
 * Encrypt API key bundle with backup password.
 * Returns base64-encoded encrypted string.
 */
export async function encryptApiKeysForBackup(
  bundle: ApiKeyBundle,
  password: string
): Promise<string> {
  const jsonString = JSON.stringify(bundle);
  return encryptData(jsonString, password);
}

/**
 * Decrypt API key bundle from backup.
 * Returns plaintext ApiKeyBundle.
 */
export async function decryptApiKeysFromBackup(
  encryptedData: string,
  password: string
): Promise<ApiKeyBundle> {
  const jsonString = await decryptData(encryptedData, password);
  return JSON.parse(jsonString) as ApiKeyBundle;
}

/**
 * Restore API keys to storage, encrypting with new device key.
 * Returns updated storage object with device-encrypted keys.
 */
export async function restoreApiKeysToStorage(
  bundle: ApiKeyBundle,
  storage: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const updated = { ...storage };

  // Restore providerConfig.apiKey
  if (bundle.providerConfig?.apiKey) {
    const existing = updated.providerConfig as Record<string, unknown> | undefined;
    updated.providerConfig = {
      ...existing,
      apiKey: await encryptApiKey(bundle.providerConfig.apiKey),
    };
  }

  // Restore providerKeys (parallel encryption)
  if (bundle.providerKeys) {
    const entries = Object.entries(bundle.providerKeys).filter(([, data]) => data.apiKey);
    const encryptedEntries = await Promise.all(
      entries.map(async ([id, data]) => ({
        id,
        apiKey: await encryptApiKey(data.apiKey!),
        model: data.model,
      }))
    );
    if (encryptedEntries.length > 0) {
      updated.providerKeys = Object.fromEntries(
        encryptedEntries.map(({ id, apiKey, model }) => [id, { apiKey, model }])
      );
    }
  }

  // Restore customProviders
  if (bundle.customProviders && bundle.customProviders.length > 0) {
    const existing = (updated.customProviders as Array<Record<string, unknown>>) || [];

    // Start with existing providers and update/add API keys
    const encrypted = await Promise.all(
      existing.map(async (provider) => {
        const backupProvider = bundle.customProviders!.find((p) => p.id === provider.id);
        if (backupProvider?.apiKey) {
          return {
            ...provider,
            apiKey: await encryptApiKey(backupProvider.apiKey),
          };
        }
        return provider;
      })
    );

    // Add any providers from bundle that don't exist in storage
    for (const bundleProvider of bundle.customProviders) {
      if (bundleProvider.apiKey && !encrypted.find(p => p.id === bundleProvider.id)) {
        encrypted.push({
          id: bundleProvider.id,
          apiKey: await encryptApiKey(bundleProvider.apiKey),
        });
      }
    }

    updated.customProviders = encrypted;
  }

  // Restore googleSearchApiKey
  if (bundle.googleSearchApiKey) {
    updated.googleSearchApiKey = await encryptApiKey(bundle.googleSearchApiKey);
  }

  return updated;
}

/**
 * Check if bundle has any actual keys.
 */
export function hasAnyKeys(bundle: ApiKeyBundle): boolean {
  return (
    !!(bundle.providerConfig?.apiKey) ||
    !!(bundle.providerKeys && Object.keys(bundle.providerKeys).length > 0) ||
    !!(bundle.customProviders?.some((p) => p.apiKey)) ||
    !!bundle.googleSearchApiKey
  );
}
