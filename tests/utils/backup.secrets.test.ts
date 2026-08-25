import { beforeEach, describe, expect, test } from 'bun:test';
import { setupChromeMock } from '../helpers/index.ts';
import {
  buildChunkedBackupPayload,
  importData,
} from '../../src/utils/backup.ts';
import { loadTokens, saveTokens } from '../../src/utils/grokOAuth.ts';

const tokens = {
  accessToken: 'ACCESS-1',
  refreshToken: 'REFRESH-1',
  tokenEndpoint: 'https://auth.x.ai/oauth2/token',
  email: 'user@x.ai',
};

describe('backup device-bound secrets', () => {
  beforeEach(() => {
    setupChromeMock({ storageData: { theme: 'dark' } });
  });

  test('storage chunk omits device key and grok tokens', async () => {
    await saveTokens(tokens);
    const payload = await buildChunkedBackupPayload({ includeApiKeys: false });
    const storageChunk = payload.chunks.find((c) => c.type === 'storage')!;
    const stored = JSON.parse(storageChunk.data) as Record<string, unknown>;
    expect(stored._deviceEncryptionKey).toBeUndefined();
    expect(stored.grokOAuthTokens).toBeUndefined();
    expect(stored.theme).toBe('dark');
  });

  test('restore without API keys does not write grok tokens from the dump', async () => {
    await saveTokens(tokens);
    const payload = await buildChunkedBackupPayload({ includeApiKeys: false });
    await chrome.storage.local.clear();
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    await importData(file);
    expect(await loadTokens()).toBeNull();
  });

  test('restore with API keys re-encrypts grok tokens under the destination device key', async () => {
    await saveTokens(tokens);
    const payload = await buildChunkedBackupPayload({
      includeApiKeys: true,
      password: 'secret-pass',
    });
    expect(payload.hasApiKeys).toBe(true);

    await chrome.storage.local.clear();
    const file = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    await importData(file, { password: 'secret-pass' });

    const loaded = await loadTokens();
    expect(loaded?.accessToken).toBe('ACCESS-1');
    expect(loaded?.refreshToken).toBe('REFRESH-1');
    expect(loaded?.email).toBe('user@x.ai');
  });
});
