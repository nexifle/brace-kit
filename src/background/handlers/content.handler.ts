/**
 * Content Handler - Handles GET_PAGE_CONTENT and GET_SELECTED_TEXT messages
 * @module background/handlers/content
 */

type SendResponse = (response?: unknown) => void;

interface ChromeMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Forward message to content script
 * @param message - Message to forward
 * @param sendResponse - Response callback
 */
async function forwardToContentScript(
  message: ChromeMessage,
  sendResponse: SendResponse
): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ error: 'No active tab' });
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, message);
    sendResponse(response);
  } catch (e) {
    sendResponse({ error: (e as Error).message });
  }
}

/**
 * Handle get page content message
 * @param message - Get page content message
 * @param sendResponse - Response callback
 */
export async function handleGetPageContent(
  message: ChromeMessage,
  sendResponse: SendResponse
): Promise<void> {
  await forwardToContentScript(message, sendResponse);
}

/**
 * Handle get selected text message
 * @param message - Get selected text message
 * @param sendResponse - Response callback
 */
export async function handleGetSelectedText(
  message: ChromeMessage,
  sendResponse: SendResponse
): Promise<void> {
  await forwardToContentScript(message, sendResponse);
}

/**
 * Register content handlers on message listener
 * @param onMessage - Chrome message listener
 */
export function registerContentHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (message: ChromeMessage, _sender: chrome.runtime.MessageSender, sendResponse: SendResponse) => {
      switch (message.type) {
        case 'GET_PAGE_CONTENT':
        case 'GET_SELECTED_TEXT':
          forwardToContentScript(message, sendResponse);
          return true;
      }
      return false;
    }
  );
}
