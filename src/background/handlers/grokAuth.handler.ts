/**
 * Grok Auth Handler - Handles GROK_OAUTH_* messages for the device-code flow
 * @module background/handlers/grokAuth
 */

import {
  GROK_FLOW_STORAGE_KEY,
  getGrokAuthStatus,
  pollDeviceToken,
  requestDeviceCode,
  saveTokens,
  signOutGrok,
  type GrokDeviceCode,
} from '../../utils/grokOAuth.ts';

type SendResponse = (response?: unknown) => void;

interface GrokOAuthStartMessage {
  type: 'GROK_OAUTH_START';
}

interface GrokOAuthPollMessage {
  type: 'GROK_OAUTH_POLL';
}

interface GrokOAuthCancelMessage {
  type: 'GROK_OAUTH_CANCEL';
}

interface GrokOAuthStatusMessage {
  type: 'GROK_OAUTH_STATUS';
}

interface GrokOAuthSignoutMessage {
  type: 'GROK_OAUTH_SIGNOUT';
}

/**
 * Start the device flow: request a device code, persist it in storage.session,
 * and open the verification tab. May be invoked while already connected
 * (relogin) — new tokens simply overwrite the old ones on success.
 */
export async function handleGrokOAuthStart(
  _message: GrokOAuthStartMessage,
  sendResponse: SendResponse
): Promise<void> {
  try {
    const deviceCode = await requestDeviceCode();
    await chrome.storage.session.set({ [GROK_FLOW_STORAGE_KEY]: deviceCode });
    await chrome.tabs.create({
      url: deviceCode.verificationUriComplete || deviceCode.verificationUri,
    });
    sendResponse({
      ok: true,
      userCode: deviceCode.userCode,
      verificationUri: deviceCode.verificationUri,
      interval: deviceCode.interval,
      expiresIn: deviceCode.expiresIn,
    });
  } catch (e) {
    sendResponse({ ok: false, error: (e as Error).message });
  }
}

/**
 * Poll the token endpoint once for the persisted flow. On success the tokens
 * are saved and the flow state cleared.
 */
export async function handleGrokOAuthPoll(
  _message: GrokOAuthPollMessage,
  sendResponse: SendResponse
): Promise<void> {
  try {
    const data = await chrome.storage.session.get(GROK_FLOW_STORAGE_KEY);
    const deviceCode = data[GROK_FLOW_STORAGE_KEY] as GrokDeviceCode | undefined;
    if (!deviceCode) {
      sendResponse({ status: 'error', error: 'No active Grok sign-in flow' });
      return;
    }

    const result = await pollDeviceToken(deviceCode);
    if (result.status === 'success') {
      await saveTokens(result.tokens);
      await chrome.storage.session.remove(GROK_FLOW_STORAGE_KEY);
      sendResponse({ status: 'success' });
      return;
    }
    if (result.status === 'pending') {
      sendResponse({ status: 'pending', interval: result.interval });
      return;
    }
    // expired / denied / error — the flow is over either way
    await chrome.storage.session.remove(GROK_FLOW_STORAGE_KEY);
    sendResponse(
      result.status === 'error'
        ? { status: 'error', error: result.error }
        : { status: result.status }
    );
  } catch (e) {
    sendResponse({ status: 'error', error: (e as Error).message });
  }
}

/**
 * Cancel the in-flight flow.
 */
export async function handleGrokOAuthCancel(
  _message: GrokOAuthCancelMessage,
  sendResponse: SendResponse
): Promise<void> {
  await chrome.storage.session.remove(GROK_FLOW_STORAGE_KEY);
  sendResponse({ ok: true });
}

/**
 * Report current auth status plus whether a flow is active.
 */
export async function handleGrokOAuthStatus(
  _message: GrokOAuthStatusMessage,
  sendResponse: SendResponse
): Promise<void> {
  const status = await getGrokAuthStatus();
  const data = await chrome.storage.session.get(GROK_FLOW_STORAGE_KEY);
  sendResponse({ ...status, flowActive: !!data[GROK_FLOW_STORAGE_KEY] });
}

/**
 * Sign out: clear tokens and any flow state.
 */
export async function handleGrokOAuthSignout(
  _message: GrokOAuthSignoutMessage,
  sendResponse: SendResponse
): Promise<void> {
  await signOutGrok();
  sendResponse({ ok: true });
}

/**
 * Register grok OAuth handlers on message listener
 * @param onMessage - Chrome message listener
 */
export function registerGrokAuthHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (message: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
      switch (message.type) {
        case 'GROK_OAUTH_START':
          handleGrokOAuthStart(message as GrokOAuthStartMessage, sendResponse);
          return true;
        case 'GROK_OAUTH_POLL':
          handleGrokOAuthPoll(message as GrokOAuthPollMessage, sendResponse);
          return true;
        case 'GROK_OAUTH_CANCEL':
          handleGrokOAuthCancel(message as GrokOAuthCancelMessage, sendResponse);
          return true;
        case 'GROK_OAUTH_STATUS':
          handleGrokOAuthStatus(message as GrokOAuthStatusMessage, sendResponse);
          return true;
        case 'GROK_OAUTH_SIGNOUT':
          handleGrokOAuthSignout(message as GrokOAuthSignoutMessage, sendResponse);
          return true;
        default:
          return false;
      }
    }
  );
}
