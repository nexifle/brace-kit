import { useState } from 'react';
import { useStore } from '../../store/index.ts';
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from '../../types/index.ts';
import type { MemoryCategory, Memory } from '../../types/index.ts';
import { PencilIcon, PlusIcon, XIcon, Trash2Icon } from 'lucide-react';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { useMemory } from '../../hooks/useMemory.ts';

export function MemorySettings() {
  const store = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('personal');
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const { clearAllMemories } = useMemory();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [editContent, setEditContent] = useState('');

  const handleClearMemories = () => {
    setShowClearConfirm(true);
  };

  const confirmClearMemories = () => {
    clearAllMemories();
    setShowClearConfirm(false);
  };

  const handleDeleteMemory = (id: string) => {
    store.removeMemory(id);
    store.saveToStorage();
  };

  const handleStartEdit = (memory: Memory) => {
    setEditingMemory(memory);
    setEditContent(memory.content);
  };

  const handleSaveEdit = () => {
    if (!editingMemory || !editContent.trim()) return;

    store.updateMemory(editingMemory.id, {
      content: editContent.trim(),
    });
    store.saveToStorage();

    setEditingMemory(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setEditingMemory(null);
    setEditContent('');
  };

  const handleAddMemory = () => {
    if (!newMemoryContent.trim()) return;

    store.addMemory({
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category: newMemoryCategory,
      content: newMemoryContent.trim(),
      confidence: 1.0,
      source: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    store.saveToStorage();

    setNewMemoryContent('');
    setShowAddForm(false);
  };

  return (
    <section className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      <div className="flex items-center justify-between px-0.5">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Memory</h3>
          <p className="text-xs text-muted-foreground leading-none">Personalize assistant behavior</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={store.memoryEnabled}
            onChange={(e) => {
              store.setMemoryEnabled(e.target.checked);
              store.saveToStorage();
            }}
          />
          <div className="w-8 h-4.5 bg-muted rounded-full peer peer-checked:bg-primary transition-all duration-200 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5"></div>
        </label>
      </div>

      <p className="text-xs text-muted-foreground leading-tight px-0.5 mb-1">
        AI automatically learns your preferences from conversations. You can also add memories manually.
      </p>

      <div className="sticky top-0 z-10 -mx-4 p-4 bg-background">
        {!showAddForm ? (
          <button
            className="w-full h-8 flex items-center justify-center gap-2 bg-secondary/60 hover:bg-secondary text-foreground text-xs font-medium rounded-md border border-border/50 transition-all shadow-sm group"
            onClick={() => setShowAddForm(true)}
          >
            <PlusIcon size={14} />
            Add Memory
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-3 rounded-lg bg-secondary/30 border border-border/50 animate-in fade-in slide-in-from-top-2 duration-300">
            <select
              className="w-full h-8 px-2 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground cursor-pointer"
              value={newMemoryCategory}
              onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
            >
              {MEMORY_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{MEMORY_CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
            <textarea
              className="w-full min-h-[60px] p-2 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all placeholder:text-muted-foreground/40 text-foreground resize-none"
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              placeholder="What should I remember?"
            />
            <div className="flex gap-2">
              <button className="flex-1 h-7 bg-primary text-primary-foreground text-xs font-medium rounded hover:bg-primary/90 transition-colors" onClick={handleAddMemory}>Save</button>
              <button className="flex-1 h-7 bg-muted text-muted-foreground text-xs font-medium rounded hover:bg-muted/80 transition-colors" onClick={() => { setShowAddForm(false); setNewMemoryContent(''); }}>Cancel</button>
            </div>
          </div>
        )}

        {store.memories.length > 0 && (
          <button
            className="mt-2 w-full h-8 flex items-center justify-center gap-2 bg-destructive/5 text-destructive hover:bg-destructive/10 text-2xs font-bold uppercase tracking-wider rounded border border-destructive/20 transition-all"
            onClick={handleClearMemories}
          >
            <Trash2Icon size={12} />
            Clear All Memories ({store.memories.length})
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4 mt-1">
        {store.memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 px-2 text-center rounded-lg border border-dashed border-border/50 bg-secondary/10">
            <p className="text-xs text-muted-foreground italic">No memories yet. Chat more to build personalization.</p>
          </div>
        ) : (
          MEMORY_CATEGORIES.map((cat) => {
            const items = store.memories.filter((m) => m.category === cat);
            if (items.length === 0) return null;

            return (
              <div key={cat} className="flex flex-col gap-1.5">
                <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60 px-0.5">{MEMORY_CATEGORY_LABELS[cat as MemoryCategory]}</div>
                <div className="flex flex-col gap-1">
                  {items.map((item) => (
                    <div key={item.id} className="group relative flex items-start gap-2 p-2 rounded-md bg-secondary/30 hover:bg-secondary/40 border border-border/50 transition-all">
                      {editingMemory?.id === item.id ? (
                        <div className="flex-1 flex flex-col gap-2">
                          <textarea
                            className="w-full min-h-[50px] p-2 text-xs bg-muted/40 border border-input rounded focus-visible:ring-1 focus-visible:ring-ring outline-none transition-all text-foreground resize-none"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            autoFocus
                          />
                          <div className="flex gap-2 justify-end">
                            <button className="px-2 h-6 bg-primary text-primary-foreground text-2xs font-bold uppercase rounded hover:bg-primary/90 transition-colors" onClick={handleSaveEdit}>Save</button>
                            <button className="px-2 h-6 bg-muted text-muted-foreground text-2xs font-bold uppercase rounded hover:bg-muted/80 transition-colors" onClick={handleCancelEdit}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="flex-1 text-xs text-foreground/90 leading-normal">{item.content}</span>
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-all"
                              title="Edit"
                              onClick={() => handleStartEdit(item)}
                            >
                              <PencilIcon size={14} />
                            </button>
                            <button
                              className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-all"
                              title="Remove"
                              onClick={() => handleDeleteMemory(item.id)}
                            >
                              <XIcon size={14} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        title="Clear All Memories?"
        message="This will permanently delete all your assistant's learned knowledge and manual memories. This action cannot be undone."
        confirmLabel="Clear Memories"
        variant="danger"
        onConfirm={confirmClearMemories}
        onCancel={() => setShowClearConfirm(false)}
      />
    </section>
  );
}
