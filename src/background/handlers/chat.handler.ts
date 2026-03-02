/**
 * Chat Handler - Handles CHAT_REQUEST and STOP_STREAM messages
 * @module background/handlers/chat
 */

import {
  createChatService,
  type ChatService,
  type ChatRequestMessage,
  type ChatServiceResponse,
} from '../services/chat.service';
import { executeTool, type ToolExecutionContext } from '../tools/index';
import { decryptApiKey } from '../../utils/keyEncryption.ts';

type SendResponse = (response?: unknown) => void;

interface StopStreamMessage {
  type: 'STOP_STREAM';
  requestId: string;
}

interface GoogleSearchToolMessage {
  type: 'GOOGLE_SEARCH_TOOL';
  arguments: Record<string, unknown>;
}

const chatService: ChatService = createChatService();

/**
 * Handle chat request message
 * @param message - Chat request message
 * @param sendResponse - Response callback
 * @returns True for async response
 */
export function handleChatRequest(
  message: ChatRequestMessage,
  sendResponse: SendResponse
): boolean {
  chatService.executeRequest(message, sendResponse as (response: ChatServiceResponse) => void);
  return true; // async response
}

/**
 * Handle stop stream message
 * @param message - Stop stream message
 * @param sendResponse - Response callback
 * @returns False for sync response
 */
export function handleStopStream(
  message: StopStreamMessage,
  sendResponse: SendResponse
): boolean {
  const success = chatService.abortRequest(message.requestId);
  sendResponse({ success });
  return false;
}

/**
 * Handle direct Google Search tool call
 * @param message - Google search message
 * @param sendResponse - Response callback
 * @returns True for async response
 */
export async function handleGoogleSearchToolDirect(
  message: GoogleSearchToolMessage,
  sendResponse: SendResponse
): Promise<boolean> {
  try {
    const { arguments: args } = message;
    const { googleSearchApiKey } = await chrome.storage.local.get('googleSearchApiKey');
    // Decrypt API key before use
    const decryptedKey = await decryptApiKey(googleSearchApiKey as string | undefined);
    const context: ToolExecutionContext = {
      googleSearchApiKey: decryptedKey,
    };
    const result = await executeTool('google_search', args, context);
    sendResponse(result);
  } catch (e) {
    sendResponse({ content: [{ text: `Google Search Error: ${(e as Error).message}` }] });
  }
  return true;
}

// Export chatService for testing
export { chatService };
