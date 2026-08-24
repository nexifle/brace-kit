/**
 * Tests for the Grok OAuth Module
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { setupChromeMock } from '../helpers/index.ts';
import {
  GROK_DEVICE_GRANT_TYPE,
  GROK_REFRESH_LEAD_MS,
  GROK_SCOPE,
  GrokAuthError,
  discoverEndpoints,
  getGrokAccessToken,
  getGrokAuthStatus,
  loadTokens,
  pollDeviceToken,
  refreshTokens,
  requestDeviceCode,
  saveTokens,
  type GrokTokenSet,
} from '../../src/utils/grokOAuth.ts';

const DISCOVERY = {
  device_authorization_endpoint: 'https://auth.x.ai/oauth2/device_authorize',
  token_endpoint: 'https://auth.x.ai/oauth2/token',
};

const deviceCode = {
  deviceCode: 'DEVICE-1',
  userCode: 'ABCD-EFGH',
  verificationUri: 'https://auth.x.ai/activate',
  verificationUriComplete: 'https://auth.x.ai/activate?code=ABCD-EFGH',
  expiresIn: 600,
  interval: 5,
  tokenEndpoint: DISCOVERY.token_endpoint,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Grok OAuth', () => {
  beforeEach(() => {
    setupChromeMock();
  });

  describe('discoverEndpoints', () => {
    it('should parse endpoints and validate them as x.ai https URLs', async () => {
      globalThis.fetch = mock(async () => jsonResponse(DISCOVERY));
      const endpoints = await discoverEndpoints();
      expect(endpoints.deviceAuthorizationEndpoint).toBe(DISCOVERY.device_authorization_endpoint);
      expect(endpoints.tokenEndpoint).toBe(DISCOVERY.token_endpoint);
    });

    it('should throw when an endpoint is not on x.ai', async () => {
      globalThis.fetch = mock(async () =>
        jsonResponse({
          device_authorization_endpoint: 'https://evil.example.com/device',
          token_endpoint: DISCOVERY.token_endpoint,
        })
      );
      await expect(discoverEndpoints()).rejects.toThrow(GrokAuthError);
    });
  });

  describe('requestDeviceCode', () => {
    it('should POST client_id and scope and parse the device code', async () => {
      const fetchMock = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://auth.x.ai/.well-known/openid-configuration') {
          return jsonResponse(DISCOVERY);
        }
        if (url.includes('device_authorize')) {
          const body = init?.body?.toString() ?? '';
          expect(body).toContain(`client_id=`);
          expect(body).toContain('scope=openid');
          expect(body).toContain('grok-cli%3Aaccess'); // URL-encoded scope
          expect(GROK_SCOPE).toContain('offline_access');
          return jsonResponse({
            device_code: 'DEVICE-1',
            user_code: 'ABCD-EFGH',
            verification_uri: 'https://auth.x.ai/activate',
            verification_uri_complete: 'https://auth.x.ai/activate?code=ABCD-EFGH',
            expires_in: 600,
            interval: 5,
          });
        }
        throw new Error(`unexpected url ${url}`);
      });
      globalThis.fetch = fetchMock as typeof fetch;

      const result = await requestDeviceCode();

      expect(result.deviceCode).toBe('DEVICE-1');
      expect(result.userCode).toBe('ABCD-EFGH');
      expect(result.tokenEndpoint).toBe(DISCOVERY.token_endpoint);
      expect(result.verificationUriComplete).toContain('ABCD-EFGH');
    });

    it('should throw when the device code is missing', async () => {
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        if (String(input) === 'https://auth.x.ai/.well-known/openid-configuration') {
          return jsonResponse(DISCOVERY);
        }
        return jsonResponse({ user_code: 'X' }); // no device_code
      });
      await expect(requestDeviceCode()).rejects.toThrow(GrokAuthError);
    });
  });

  describe('pollDeviceToken', () => {
    it('should map authorization_pending (HTTP 400) to pending with the device interval', async () => {
      // Real behavior: the token endpoint returns 400 + JSON error body
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'authorization_pending', error_description: 'still waiting' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      );
      const result = await pollDeviceToken(deviceCode);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') expect(result.interval).toBe(5);
    });

    it('should map slow_down (HTTP 400) to pending with interval + 5', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'slow_down' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      );
      const result = await pollDeviceToken(deviceCode);
      expect(result.status).toBe('pending');
      if (result.status === 'pending') expect(result.interval).toBe(10);
    });

    it('should map access_denied and expired_token (HTTP 400)', async () => {
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'access_denied' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      );
      expect((await pollDeviceToken(deviceCode)).status).toBe('denied');

      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ error: 'expired_token' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      );
      expect((await pollDeviceToken(deviceCode)).status).toBe('expired');
    });

    it('should parse a successful token response with identity from id_token', async () => {
      const body = { email: 'user@x.ai', sub: 's123' };
      // base64url-ish JWT (raw base64 from btoa decodes identically through the parser)
      const headerB64 = btoa(JSON.stringify({ typ: 'JWT', alg: 'none' }));
      const payloadB64 = btoa(JSON.stringify(body));
      const idToken = `${headerB64}.${payloadB64}.signature`;

      let sentGrant: string | null = null;
      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const bodyStr = init?.body?.toString() ?? '';
        if (bodyStr.includes('grant_type')) {
          sentGrant = new URLSearchParams(bodyStr).get('grant_type');
        }
        return jsonResponse({
          access_token: 'ACCESS-1',
          refresh_token: 'REFRESH-1',
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: idToken,
        });
      }) as typeof fetch;

      const result = await pollDeviceToken(deviceCode);

      expect(sentGrant).toBe(GROK_DEVICE_GRANT_TYPE);
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.tokens.accessToken).toBe('ACCESS-1');
        expect(result.tokens.refreshToken).toBe('REFRESH-1');
        expect(result.tokens.email).toBe('user@x.ai');
        expect(result.tokens.sub).toBe('s123');
        expect(result.tokens.tokenEndpoint).toBe(deviceCode.tokenEndpoint);
        expect(result.tokens.expiresAt).toBeGreaterThan(Date.now());
      }
    });
  });

  describe('getGrokAccessToken / refreshTokens', () => {
    it('should throw "not connected" when no tokens are stored', async () => {
      await expect(getGrokAccessToken()).rejects.toThrow('Grok OAuth: not connected');
    });

    it('should return the stored token when not near expiry', async () => {
      await saveTokens({
        accessToken: 'ACCESS-1',
        refreshToken: 'REFRESH-1',
        expiresAt: Date.now() + 60 * 60 * 1000,
        tokenEndpoint: deviceCode.tokenEndpoint,
      });
      const token = await getGrokAccessToken();
      expect(token).toBe('ACCESS-1');
    });

    it('should refresh when within the lead window of expiry', async () => {
      await saveTokens({
        accessToken: 'ACCESS-OLD',
        refreshToken: 'REFRESH-1',
        expiresAt: Date.now() + GROK_REFRESH_LEAD_MS - 1000, // just inside the lead window
        tokenEndpoint: deviceCode.tokenEndpoint,
      });

      let sentRefreshToken: string | null = null;
      let refreshCalls = 0;
      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const params = new URLSearchParams(init?.body?.toString() ?? '');
        if (params.get('grant_type') === 'refresh_token') {
          refreshCalls++;
          sentRefreshToken = params.get('refresh_token');
          return jsonResponse({ access_token: 'ACCESS-NEW', expires_in: 3600 });
        }
        throw new Error('unexpected request');
      }) as typeof fetch;

      const token = await getGrokAccessToken();

      expect(sentRefreshToken).toBe('REFRESH-1');
      expect(token).toBe('ACCESS-NEW');
      expect(refreshCalls).toBe(1);
      // refreshed value persisted
      expect((await loadTokens())?.accessToken).toBe('ACCESS-NEW');
    });

    it('should single-flight concurrent refreshes', async () => {
      await saveTokens({
        accessToken: 'ACCESS-OLD',
        refreshToken: 'REFRESH-1',
        expiresAt: Date.now() - 1000, // expired: force refresh
        tokenEndpoint: deviceCode.tokenEndpoint,
      });

      let refreshCalls = 0;
      globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const params = new URLSearchParams(init?.body?.toString() ?? '');
        if (params.get('grant_type') === 'refresh_token') {
          refreshCalls++;
          return jsonResponse({ access_token: 'ACCESS-NEW', expires_in: 3600 });
        }
        throw new Error('unexpected request');
      }) as typeof fetch;

      const [a, b] = await Promise.all([getGrokAccessToken(), getGrokAccessToken()]);

      expect(a).toBe('ACCESS-NEW');
      expect(b).toBe('ACCESS-NEW');
      expect(refreshCalls).toBe(1); // deduped
    });

    it('should throw "session expired" when the refresh fails', async () => {
      await saveTokens({
        accessToken: 'ACCESS-OLD',
        refreshToken: 'REFRESH-1',
        expiresAt: Date.now() - 1000,
        tokenEndpoint: deviceCode.tokenEndpoint,
      });

      globalThis.fetch = mock(async () =>
        new Response('unauthorized', { status: 401 })
      ) as typeof fetch;

      await expect(getGrokAccessToken()).rejects.toThrow('Grok OAuth: session expired');
    });
  });

  describe('getGrokAuthStatus', () => {
    it('should report not connected when no tokens', async () => {
      expect(await getGrokAuthStatus()).toEqual({ connected: false, needsReauth: false });
    });

    it('should report needsReauth when the refresh token is missing', async () => {
      await saveTokens({
        accessToken: 'A',
        refreshToken: '',
        expiresAt: Date.now() + 60 * 60 * 1000,
        tokenEndpoint: deviceCode.tokenEndpoint,
      } as GrokTokenSet);
      const status = await getGrokAuthStatus();
      expect(status.connected).toBe(true);
      expect(status.needsReauth).toBe(true);
    });

    it('should report needsReauth when expiry has passed', async () => {
      await saveTokens({
        accessToken: 'A',
        refreshToken: 'R',
        expiresAt: Date.now() - 1000,
        tokenEndpoint: deviceCode.tokenEndpoint,
      });
      const status = await getGrokAuthStatus();
      expect(status.connected).toBe(true);
      expect(status.needsReauth).toBe(true);
    });

    it('should report healthy when tokens are valid', async () => {
      await saveTokens({
        accessToken: 'A',
        refreshToken: 'R',
        email: 'user@x.ai',
        expiresAt: Date.now() + 60 * 60 * 1000,
        tokenEndpoint: deviceCode.tokenEndpoint,
      });
      const status = await getGrokAuthStatus();
      expect(status).toEqual({ connected: true, email: 'user@x.ai', needsReauth: false });
    });
  });

  describe('storage round-trip', () => {
    it('should encrypt stored tokens and decrypt them back', async () => {
      await saveTokens({
        accessToken: 'ACCESS-1',
        refreshToken: 'REFRESH-1',
        tokenEndpoint: deviceCode.tokenEndpoint,
      });

      const stored = await chrome.storage.local.get('grokOAuthTokens');
      expect(typeof stored.grokOAuthTokens).toBe('string');
      expect(stored.grokOAuthTokens.startsWith('enc:')).toBe(true); // device-encrypted

      const loaded = await loadTokens();
      expect(loaded?.accessToken).toBe('ACCESS-1');
      expect(loaded?.refreshToken).toBe('REFRESH-1');
    });
  });
});
