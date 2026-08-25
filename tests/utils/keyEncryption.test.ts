import { beforeEach, describe, expect, it } from 'bun:test';
import { setupChromeMock } from '../helpers/index.ts';
import { decryptApiKey, encryptApiKey } from '../../src/utils/keyEncryption.ts';

describe('keyEncryption', () => {
  beforeEach(() => {
    setupChromeMock();
  });

  it('round-trips plaintext through the device key', async () => {
    const encrypted = await encryptApiKey('sk-secret');
    expect(encrypted.startsWith('enc:')).toBe(true);
    expect(await decryptApiKey(encrypted)).toBe('sk-secret');
  });

  it('returns empty string when ciphertext was encrypted under a different key', async () => {
    const encrypted = await encryptApiKey('sk-secret');
    await chrome.storage.local.set({ _deviceEncryptionKey: btoa('totally-different-32-byte-key!!') });
    expect(await decryptApiKey(encrypted)).toBe('');
  });

  it('reuses a single device key across concurrent encrypts', async () => {
    const [a, b] = await Promise.all([encryptApiKey('one'), encryptApiKey('two')]);
    const stored = await chrome.storage.local.get('_deviceEncryptionKey');
    expect(typeof stored._deviceEncryptionKey).toBe('string');
    expect(await decryptApiKey(a)).toBe('one');
    expect(await decryptApiKey(b)).toBe('two');
  });
});
