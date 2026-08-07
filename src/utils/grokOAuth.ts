/**
 * Grok OAuth Module
 *
 * OAuth 2.0 device-code authentication for the Grok (OAuth) provider.
 * Follows the xAI device flow: OIDC discovery → device authorization →
 * poll token endpoint (handling authorization_pending / slow_down) →
 * access_token + refresh_token. Tokens are stored encrypted in
 * chrome.storage.local; the in-flight flow state lives in storage.session.
 */

import { decryptApiKey, encryptApiKey } from './keyEncryption.ts';

// ==================== Constants ====================

export const GROK_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
export const GROK_DISCOVERY_URL = 'https://auth.x.ai/.well-known/openid-configuration';
export const GROK_SCOPE = 'openid profile email offline_access grok-cli:access api:access';
export const GROK_DEVICE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
export const GROK_DEFAULT_POLL_INTERVAL_MS = 5_000;
export const GROK_MAX_POLL_DURATION_MS = 30 * 60_000;
export const GROK_REFRESH_LEAD_MS = 5 * 60_000;
export const GROK_TOKENS_STORAGE_KEY = 'grokOAuthTokens';
export const GROK_FLOW_STORAGE_KEY = 'grokOAuthFlow';

// ==================== Types ====================

export interface GrokTokenSet {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  tokenType?: string;
  /** epoch ms */
  expiresAt?: number;
  email?: string;
  sub?: string;
  tokenEndpoint: string;
}

export interface GrokDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresIn: number;
  interval: number;
  tokenEndpoint: string;
}

export type GrokPollResult =
  | { status: 'success'; tokens: GrokTokenSet }
  | { status: 'pending'; interval: number }
  | { status: 'expired' }
  | { status: 'denied' }
  | { status: 'error'; error: string };

export class GrokAuthError extends Error {}

// In-flight refresh promise so concurrent callers share a single refresh.
let refreshInFlight: Promise<GrokTokenSet> | null = null;

// ==================== Token Storage ====================

/**
 * Persist tokens encrypted under the device encryption key.
 */
export async function saveTokens(tokens: GrokTokenSet): Promise<void> {
  const encrypted = await encryptApiKey(JSON.stringify(tokens));
  await chrome.storage.local.set({ [GROK_TOKENS_STORAGE_KEY]: encrypted });
}

/**
 * Load and decrypt the stored token set, or null when absent/unparseable.
 */
export async function loadTokens(): Promise<GrokTokenSet | null> {
  const data = await chrome.storage.local.get(GROK_TOKENS_STORAGE_KEY);
  const raw = data[GROK_TOKENS_STORAGE_KEY] as string | undefined;
  if (!raw) return null;
  const decrypted = await decryptApiKey(raw);
  if (!decrypted) return null;
  try {
    return JSON.parse(decrypted) as GrokTokenSet;
  } catch {
    return null;
  }
}

/**
 * Remove the stored token set.
 */
export async function clearTokens(): Promise<void> {
  await chrome.storage.local.remove(GROK_TOKENS_STORAGE_KEY);
}

// ==================== Token Lifecycle ====================

/**
 * Return a usable access token, refreshing when near/past expiry.
 * @throws GrokAuthError with message 'Grok OAuth: not connected' when no tokens are stored.
 */
export async function getGrokAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  if (!tokens) throw new GrokAuthError('Grok OAuth: not connected');
  if (tokens.expiresAt !== undefined && tokens.expiresAt - GROK_REFRESH_LEAD_MS <= Date.now()) {
    // refreshTokens persists the refreshed set before resolving.
    const refreshed = await refreshTokens(tokens);
    return refreshed.accessToken;
  }
  return tokens.accessToken;
}

async function doRefreshTokens(tokens: GrokTokenSet): Promise<GrokTokenSet> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: GROK_CLIENT_ID,
    refresh_token: tokens.refreshToken,
  });
  const res = await fetch(tokens.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = data.access_token;
  if (!res.ok || typeof accessToken !== 'string' || !accessToken) {
    throw new GrokAuthError('Grok OAuth: session expired');
  }
  const refreshed: GrokTokenSet = {
    accessToken,
    refreshToken:
      typeof data.refresh_token === 'string' && data.refresh_token
        ? data.refresh_token
        : tokens.refreshToken,
    idToken: typeof data.id_token === 'string' ? data.id_token : tokens.idToken,
    tokenType: typeof data.token_type === 'string' ? data.token_type : tokens.tokenType,
    expiresAt:
      typeof data.expires_in === 'number' && data.expires_in > 0
        ? Date.now() + data.expires_in * 1000
        : undefined,
    email: tokens.email,
    sub: tokens.sub,
    tokenEndpoint: tokens.tokenEndpoint,
  };
  await saveTokens(refreshed);
  return refreshed;
}

/**
 * Refresh tokens with single-flight dedup — concurrent calls await the same
 * refresh so the token endpoint is hit at most once per window.
 */
export function refreshTokens(tokens: GrokTokenSet): Promise<GrokTokenSet> {
  if (!refreshInFlight) {
    refreshInFlight = doRefreshTokens(tokens).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// ==================== Status / Convenience ====================

/**
 * Auth status driving the Settings UI. `needsReauth` is true when the stored
 * tokens can no longer refresh (no refresh token, or expiry already passed).
 */
export async function getGrokAuthStatus(): Promise<{
  connected: boolean;
  email?: string;
  needsReauth: boolean;
}> {
  const tokens = await loadTokens();
  if (!tokens) return { connected: false, needsReauth: false };
  const needsReauth =
    !tokens.refreshToken || (tokens.expiresAt !== undefined && tokens.expiresAt <= Date.now());
  return { connected: true, email: tokens.email, needsReauth };
}

/**
 * Clear stored tokens and any in-flight flow state.
 */
export async function signOutGrok(): Promise<void> {
  await clearTokens();
  await chrome.storage.session.remove(GROK_FLOW_STORAGE_KEY);
}

/**
 * Resolve a valid access token for the given provider id, or null when not
 * connected (used by memory/title handlers so they never need a token they
 * lack). Errors other than "not connected"/"session expired" propagate.
 */
export async function resolveGrokBearer(providerId: string): Promise<string | null> {
  if (providerId !== 'grok') return null;
  try {
    return await getGrokAccessToken();
  } catch (e) {
    if (e instanceof GrokAuthError) return null;
    throw e;
  }
}

// ==================== Device Flow ====================

/** Validate that a discovered endpoint is an https URL on x.ai (or a subdomain). */
function isOAuthEndpoint(url: unknown): url is string {
  return typeof url === 'string' && /^https:\/\/(?:[a-zA-Z0-9-]+\.)*x\.ai(?:\/|$)/.test(url);
}

/**
 * Discover the device authorization and token endpoints from OIDC metadata.
 */
export async function discoverEndpoints(): Promise<{
  deviceAuthorizationEndpoint: string;
  tokenEndpoint: string;
}> {
  const res = await fetch(GROK_DISCOVERY_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new GrokAuthError(`OAuth discovery failed: ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const deviceAuthorizationEndpoint = data.device_authorization_endpoint;
  const tokenEndpoint = data.token_endpoint;
  if (!isOAuthEndpoint(deviceAuthorizationEndpoint) || !isOAuthEndpoint(tokenEndpoint)) {
    throw new GrokAuthError('OAuth discovery returned invalid endpoints');
  }
  return { deviceAuthorizationEndpoint, tokenEndpoint };
}

/**
 * Request a device code from the device authorization endpoint (opens with no
 * user interaction beyond fetching the code).
 */
export async function requestDeviceCode(): Promise<GrokDeviceCode> {
  const { deviceAuthorizationEndpoint, tokenEndpoint } = await discoverEndpoints();
  const params = new URLSearchParams({ client_id: GROK_CLIENT_ID, scope: GROK_SCOPE });
  const res = await fetch(deviceAuthorizationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new GrokAuthError(`Device authorization failed: ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const deviceCode = data.device_code;
  const userCode = data.user_code;
  if (typeof deviceCode !== 'string' || !deviceCode || typeof userCode !== 'string' || !userCode) {
    throw new GrokAuthError('Device authorization response missing device code');
  }
  const verificationUri =
    typeof data.verification_uri === 'string' && data.verification_uri
      ? data.verification_uri
      : '';
  const verificationUriComplete =
    typeof data.verification_uri_complete === 'string' && data.verification_uri_complete
      ? data.verification_uri_complete
      : '';
  if (!verificationUri && !verificationUriComplete) {
    throw new GrokAuthError('Device authorization response missing verification URI');
  }
  return {
    deviceCode,
    userCode,
    verificationUri: verificationUri || verificationUriComplete,
    verificationUriComplete: verificationUriComplete || undefined,
    expiresIn: typeof data.expires_in === 'number' ? data.expires_in : 600,
    interval: typeof data.interval === 'number' ? data.interval : 5,
    tokenEndpoint,
  };
}

/** Decode email/sub from an id_token JWT payload (base64url second segment). */
function parseJWTIdentity(idToken?: string): { email?: string; sub?: string } {
  if (!idToken) return {};
  const parts = idToken.split('.');
  if (parts.length < 2) return {};
  try {
    const payload = JSON.parse(
      atob((parts[1] || '').replace(/-/g, '+').replace(/_/g, '/'))
    ) as Record<string, unknown>;
    return {
      email: typeof payload.email === 'string' ? payload.email : undefined,
      sub: typeof payload.sub === 'string' ? payload.sub : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Poll the token endpoint once for the given device flow.
 * Callers handle `pending` scheduling (authorization_pending / slow_down).
 */
export async function pollDeviceToken(deviceCode: GrokDeviceCode): Promise<GrokPollResult> {
  const params = new URLSearchParams({
    grant_type: GROK_DEVICE_GRANT_TYPE,
    device_code: deviceCode.deviceCode,
    client_id: GROK_CLIENT_ID,
  });
  const res = await fetch(deviceCode.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: params.toString(),
  });
  // The token endpoint signals in-flight/terminal states with HTTP 400 plus a
  // JSON error body (RFC 8628: authorization_pending, slow_down, …) — parse it
  // regardless of status so pending keeps polling instead of failing hard.
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const error = data.error as string | undefined;
  if (error) {
    if (error === 'authorization_pending') {
      return { status: 'pending', interval: deviceCode.interval || 5 };
    }
    if (error === 'slow_down') {
      return { status: 'pending', interval: deviceCode.interval + 5 };
    }
    if (error === 'expired_token') return { status: 'expired' };
    if (error === 'access_denied') return { status: 'denied' };
    const description = typeof data.error_description === 'string' ? data.error_description : '';
    return { status: 'error', error: description ? `${error}: ${description}` : error };
  }
  if (!res.ok) {
    return { status: 'error', error: `Token request failed: ${res.status}` };
  }
  const accessToken = data.access_token;
  if (typeof accessToken !== 'string' || !accessToken) {
    return { status: 'error', error: 'Token response missing access_token' };
  }
  const idToken = typeof data.id_token === 'string' ? data.id_token : undefined;
  const { email, sub } = parseJWTIdentity(idToken);
  return {
    status: 'success',
    tokens: {
      accessToken,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : '',
      idToken,
      tokenType: typeof data.token_type === 'string' ? data.token_type : undefined,
      expiresAt:
        typeof data.expires_in === 'number' && data.expires_in > 0
          ? Date.now() + data.expires_in * 1000
          : undefined,
      email,
      sub,
      tokenEndpoint: deviceCode.tokenEndpoint,
    },
  };
}
