import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/index.ts';
import { MessageList } from './MessageList.tsx';
import { WelcomeScreen } from './WelcomeScreen.tsx';
import { InputArea } from './InputArea.tsx';
import { SystemPromptEditor } from './SystemPromptEditor.tsx';
import { TextInput } from './ui/TextInput.tsx';
import { Btn } from './ui/Btn.tsx';
import { SquarePenIcon, DownloadIcon } from 'lucide-react';
import { exportConversationToMarkdown, downloadMarkdown } from '../utils/exportMarkdown.ts';

function ConversationTitleBar() {
  const activeConversationId = useStore((state) => state.activeConversationId);
  const conversations = useStore((state) => state.conversations);
  const messages = useStore((state) => state.messages);
  const updateConversationTitle = useStore((state) => state.updateConversationTitle);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  const startEdit = useCallback(() => {
    if (!activeConv) return;
    setEditValue(activeConv.title);
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }, [activeConv]);

  const commit = useCallback(() => {
    if (activeConversationId && editValue.trim()) {
      updateConversationTitle(activeConversationId, editValue.trim());
    }
    setIsEditing(false);
  }, [activeConversationId, editValue, updateConversationTitle]);

  const cancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleExport = useCallback(() => {
    if (!activeConv) return;
    const markdown = exportConversationToMarkdown(activeConv, messages);
    const filename = `${activeConv.title.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.md`;
    downloadMarkdown(filename, markdown);
  }, [activeConv, messages]);

  if (!activeConv) return null;

  return (
    <div className="border-b border-border/40 flex justify-between items-center gap-4 px-3 py-1.5 transition-colors">
      {isEditing ? (
        <TextInput
          ref={inputRef}
          className="w-full h-8 text-sm"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') cancel();
          }}
          onBlur={commit}
        />
      ) : (
        <>
          <span
            className="text-sm font-medium text-muted-foreground truncate hover:text-foreground transition-colors cursor-pointer"
            title="Double-click to rename"
            onDoubleClick={startEdit}
          >
            {activeConv.title}
          </span>
          <div className="flex items-center gap-1">
            <Btn
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 opacity-60 hover:opacity-100"
              title="Export to Markdown"
              onClick={handleExport}
            >
              <DownloadIcon size={14} />
            </Btn>
            <Btn
              size="icon-sm"
              variant="ghost"
              className="h-6 w-6 opacity-60 hover:opacity-100"
              title="Rename conversation"
              onClick={startEdit}
            >
              <SquarePenIcon size={14} />
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

export function ChatView() {
  const messages = useStore((state) => state.messages);
  const showSystemPromptEditor = useStore((state) => state.showSystemPromptEditor);
  const setShowSystemPromptEditor = useStore((state) => state.setShowSystemPromptEditor);

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden animate-in fade-in duration-300">
      {showSystemPromptEditor && (
        <SystemPromptEditor onClose={() => setShowSystemPromptEditor(false)} />
      )}
      <ConversationTitleBar />
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {messages.length === 0 ? <WelcomeScreen /> : <MessageList />}
      </div>
      <InputArea />
    </div>
  );
}
