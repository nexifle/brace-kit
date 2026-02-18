import { useStore } from '../store/index.ts';
import { MessageList } from './MessageList.tsx';
import { WelcomeScreen } from './WelcomeScreen.tsx';
import { InputArea } from './InputArea.tsx';
import { SystemPromptEditor } from './SystemPromptEditor.tsx';

export function ChatView() {
  const messages = useStore((state) => state.messages);
  const showSystemPromptEditor = useStore((state) => state.showSystemPromptEditor);
  const setShowSystemPromptEditor = useStore((state) => state.setShowSystemPromptEditor);

  return (
    <>
      <div id="chat-view">
        {showSystemPromptEditor && (
          <SystemPromptEditor onClose={() => setShowSystemPromptEditor(false)} />
        )}
        {messages.length === 0 ? <WelcomeScreen /> : <MessageList />}
      </div>
      <InputArea />
    </>
  );
}
