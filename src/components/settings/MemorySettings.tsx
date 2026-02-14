import { useState } from 'react';
import { useStore } from '../../store/index.ts';
import { MEMORY_CATEGORIES, MEMORY_CATEGORY_LABELS } from '../../types/index.ts';
import type { MemoryCategory } from '../../types/index.ts';

export function MemorySettings() {
  const store = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMemoryCategory, setNewMemoryCategory] = useState<MemoryCategory>('personal');
  const [newMemoryContent, setNewMemoryContent] = useState('');

  const handleClearMemories = () => {
    if (confirm('Clear all memories? This cannot be undone.')) {
      store.clearMemories();
      store.saveToStorage();
    }
  };

  const handleDeleteMemory = (id: string) => {
    store.removeMemory(id);
    store.saveToStorage();
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
    <section className="settings-section">
      <div className="section-header-row">
        <h3>Memory</h3>
        <label className="toggle-switch">
          <input
            type="checkbox"
            checked={store.memoryEnabled}
            onChange={(e) => {
              store.setMemoryEnabled(e.target.checked);
              store.saveToStorage();
            }}
          />
          <span className="toggle-slider"></span>
        </label>
      </div>
      <p className="memory-description">
        AI automatically learns your preferences from conversations. You can also add memories manually.
      </p>
      
      {!showAddForm ? (
        <button 
          className="btn-secondary" 
          onClick={() => setShowAddForm(true)}
          style={{ marginBottom: '1rem' }}
        >
          + Add Memory
        </button>
      ) : (
        <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          <select 
            value={newMemoryCategory}
            onChange={(e) => setNewMemoryCategory(e.target.value as MemoryCategory)}
            style={{ width: '100%', marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white' }}
          >
            {MEMORY_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{MEMORY_CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <textarea
            value={newMemoryContent}
            onChange={(e) => setNewMemoryContent(e.target.value)}
            placeholder="Enter memory content..."
            style={{ width: '100%', minHeight: '60px', marginBottom: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', color: 'white', resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-primary" onClick={handleAddMemory}>Save</button>
            <button className="btn-secondary" onClick={() => { setShowAddForm(false); setNewMemoryContent(''); }}>Cancel</button>
          </div>
        </div>
      )}

      <div id="memory-list" className="memory-list">
        {store.memories.length === 0 ? (
          <p className="empty-text">No memories yet. Chat more to build personalization.</p>
        ) : (
          MEMORY_CATEGORIES.map((cat) => {
            const items = store.memories.filter((m) => m.category === cat);
            if (items.length === 0) return null;

            return (
              <div key={cat} className="memory-category">
                <div className="memory-category-header">{MEMORY_CATEGORY_LABELS[cat as MemoryCategory]}</div>
                {items.map((item) => (
                  <div key={item.id} className="memory-item">
                    <span className="memory-item-text">{item.content}</span>
                    <button
                      className="memory-item-delete"
                      title="Remove"
                      onClick={() => handleDeleteMemory(item.id)}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>
      {store.memories.length > 0 && (
        <button id="btn-clear-memories" className="btn-danger" onClick={handleClearMemories}>
          Clear All Memories ({store.memories.length})
        </button>
      )}
    </section>
  );
}
