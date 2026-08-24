import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModelSpec } from '../../types/index.ts';
import { emptySpec, ModelSpecFields } from './ModelSpecFields.tsx';

interface ModelSpecDialogProps {
  isOpen: boolean;
  title: string;
  initial?: ModelSpec;
  existingIds: string[];
  onClose: () => void;
  onSave: (spec: ModelSpec) => void;
}

export function ModelSpecDialog({ isOpen, title, initial, existingIds, onClose, onSave }: ModelSpecDialogProps) {
  const [spec, setSpec] = useState<ModelSpec>(initial || emptySpec());
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSpec(initial || emptySpec());
      setError('');
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const originalId = initial?.id;
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const id = spec.id.trim();
    if (!id) {
      setError('Model ID is required.');
      return;
    }
    if (existingIds.includes(id) && id !== originalId) {
      setError('A model with this ID already exists.');
      return;
    }
    onSave({ ...spec, id });
  };

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 pointer-events-auto">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" onClick={onClose} />
      <form
        onSubmit={handleSave}
        className="relative w-full max-w-[420px] max-h-[90vh] overflow-y-auto bg-card border border-border shadow-2xl rounded-lg"
      >
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-lg font-bold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">Set the model id and its capacity / capability specs.</p>
        </div>
        <div className="px-5 pb-4">
          <ModelSpecFields spec={spec} onChange={setSpec} />
          {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-sm rounded-md border border-input hover:bg-accent"
          >
            Cancel
          </button>
          <button type="submit" className="h-8 px-3 text-sm rounded-md bg-primary text-primary-foreground">
            Save
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
