import { useStore } from '../store/index.ts';
import { MessageList } from './MessageList.tsx';
import { WelcomeScreen } from './WelcomeScreen.tsx';
import { InputArea } from './InputArea.tsx';

export function ChatView() {
  const messages = useStore((state) => state.messages);

  return (
    <>
      <div id="chat-view">
        {messages.length === 0 ? <WelcomeScreen /> : <MessageList />}
      </div>
      <InputArea />
    </>
  );
}
