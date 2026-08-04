import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../store/index.ts';
import { Btn } from './ui/Btn.tsx';
import { ConfirmDialog } from './ui/ConfirmDialog.tsx';
import { ConversationList } from './ConversationList.tsx';
import { useChat } from '../hooks';
import { PlusIcon, MessageSquareIcon } from 'lucide-react';

const RAIL_WIDTH = 272;

export function ConversationRail() {
  const store = useStore();
  const { stopStreaming, newChat } = useChat();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleNewChat = () => {
    if (store.isStreaming) {
      setShowConfirm(true);
    } else {
      newChat();
    }
  };

  const confirmNewChat = () => {
    stopStreaming();
    newChat();
    setShowConfirm(false);
  };

  return (
    <AnimatePresence initial={false}>
      {!store.railCollapsed && (
        <motion.aside
          key="conversation-rail"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: RAIL_WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="h-full shrink-0 overflow-hidden bg-background"
        >
          <div className="w-[272px] h-full flex flex-col border-r border-border bg-background">
            <ConfirmDialog
              isOpen={showConfirm}
              title="Stop Chat?"
              message="The current request will be automatically stopped if you try to create a new chat."
              confirmLabel="Yes, New Chat"
              onConfirm={confirmNewChat}
              onCancel={() => setShowConfirm(false)}
            />

            <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquareIcon size={14} className="text-muted-foreground shrink-0" />
                <span className="text-2xs font-black uppercase tracking-[0.25em] text-muted-foreground truncate">
                  Conversations
                </span>
              </div>
              <Btn
                size="icon-sm"
                variant="ghost"
                className="h-7 w-7 rounded-none shrink-0"
                title="New Chat"
                onClick={handleNewChat}
              >
                <PlusIcon size={15} />
              </Btn>
            </div>

            <div className="p-3 pt-2.5 flex flex-col flex-1 min-h-0 overflow-hidden">
              <ConversationList />
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
