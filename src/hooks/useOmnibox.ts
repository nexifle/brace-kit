/**
 * useOmnibox - Handles commands sent from the omnibox background handler.
 *
 * Call this hook inside InputArea so it has access to sendMessage for
 * auto-submitting new chat queries without extra store state.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store/index.ts';

interface OmniboxNewChatMessage {
  type: 'OMNIBOX_NEW_CHAT';
  query: string;
}

interface OmniboxSwitchMessage {
  type: 'OMNIBOX_SWITCH_CONVERSATION';
  conversationId: string;
}

type OmniboxMessage = OmniboxNewChatMessage | OmniboxSwitchMessage;

export function useOmnibox(sendMessage: (text: string) => void): void {
  // Use individual selectors so actions (stable Zustand references) don't
  // cause the effect to re-run on every store state change.
  const createConversation = useStore((s) => s.createConversation);
  const switchConversation = useStore((s) => s.switchConversation);
  const setView = useStore((s) => s.setView);

  // Keep sendMessage in a ref so the effect doesn't need it as a dependency.
  // This avoids listener churn when sendMessage's identity changes.
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  useEffect(() => {
    const listener = (message: OmniboxMessage): boolean | undefined => {
      if (message.type === 'OMNIBOX_NEW_CHAT') {
        createConversation();
        sendMessageRef.current(message.query);
        return false;
      }

      if (message.type === 'OMNIBOX_SWITCH_CONVERSATION') {
        // Return true synchronously to keep the message channel open while
        // switchConversation (an async IndexedDB operation) completes.
        switchConversation(message.conversationId).then(() => {
          setView('chat');
        });
        return true;
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [createConversation, switchConversation, setView]);
}
