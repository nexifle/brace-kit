import { useRef, useEffect, useState, useCallback } from 'react';
import { CheckIcon, XIcon, PlusIcon, FileTextIcon, GlobeIcon } from 'lucide-react';
import { Btn } from '../../ui/Btn';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import type { EditModeProps, Attachment, PageContext, SelectedText } from '../MessageBubble.types';
import { processImageForEdit, readFileAsDataURL } from '../utils/imageProcessing';
import { MAX_FILE_SIZE } from '../../../types';

export function EditMode({
  initialText,
  initialPageContext,
  initialSelectedText,
  initialAttachments = [],
  hasAfterMessages,
  onSubmit,
  onCancel,
}: EditModeProps) {
  const [text, setText] = useState(initialText);
  const [pageContext, setPageContext] = useState<PageContext | null>(initialPageContext || null);
  const [selectedText, setSelectedText] = useState<SelectedText | null>(initialSelectedText || null);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, []);

  // Check if there are unsaved changes
  const hasChanges =
    text !== initialText ||
    pageContext !== (initialPageContext || null) ||
    selectedText !== (initialSelectedText || null) ||
    JSON.stringify(attachments) !== JSON.stringify(initialAttachments || []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    if (!text.trim()) return;

    if (hasAfterMessages) {
      setShowSubmitConfirm(true);
    } else {
      onSubmit({ text, pageContext, selectedText, attachments });
    }
  }, [text, pageContext, selectedText, attachments, hasAfterMessages, onSubmit]);

  // Handle confirmed submit
  const handleConfirmSubmit = useCallback(() => {
    setShowSubmitConfirm(false);
    onSubmit({ text, pageContext, selectedText, attachments });
  }, [text, pageContext, selectedText, attachments, onSubmit]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      setShowCancelConfirm(true);
    } else {
      onCancel();
    }
  }, [hasChanges, onCancel]);

  // Handle confirmed cancel
  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirm(false);
    onCancel();
  }, [onCancel]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSubmit, handleCancel]
  );

  // Remove handlers
  const handleRemovePageContext = useCallback(() => setPageContext(null), []);
  const handleRemoveSelectedText = useCallback(() => setSelectedText(null), []);
  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Add handlers
  const handleAddPageContext = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' }).then((response: any) => {
      if (response?.error) {
        console.error('Failed to get page context:', response.error);
      } else {
        setPageContext(response);
      }
    });
  }, []);

  const handleAddSelectedText = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' }).then((response: any) => {
      if (response?.error) {
        console.error('Failed to get selected text:', response.error);
      } else if (response?.selectedText) {
        setSelectedText(response);
      }
    });
  }, []);

  // File selection handler
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const ALLOWED_FILE_TYPES: Record<string, 'image' | 'text' | 'pdf'> = {
      'image/jpeg': 'image',
      'image/png': 'image',
      'image/gif': 'image',
      'image/webp': 'image',
      'text/plain': 'text',
      'text/csv': 'text',
      'application/pdf': 'pdf',
    };

    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_SIZE) {
        console.error('File too large:', file.name);
        continue;
      }

      const fileType = ALLOWED_FILE_TYPES[file.type];
      if (!fileType) {
        console.error('Unsupported file type:', file.name);
        continue;
      }

      try {
        if (fileType === 'image') {
          const dataUrl = await processImageForEdit(file);
          setAttachments((prev) => [
            ...prev,
            {
              type: 'image',
              name: file.name,
              data: dataUrl,
            },
          ]);
        } else if (fileType === 'text') {
          const textContent = await file.text();
          setAttachments((prev) => [
            ...prev,
            {
              type: 'text',
              name: file.name,
              data: textContent,
            },
          ]);
        } else if (fileType === 'pdf') {
          const dataUrl = await readFileAsDataURL(file);
          setAttachments((prev) => [
            ...prev,
            {
              type: 'pdf',
              name: file.name,
              data: dataUrl,
            },
          ]);
        }
      } catch (err) {
        console.error('Failed to process file:', file.name, err);
      }
    }
  }, []);

  return (
    <div className="">
      {/* Edit Page Context */}
      {pageContext && (
        <div className="flex items-center gap-2.5 px-3 py-2 mb-2.5 bg-brand-400/[0.08] border border-brand-400/15 rounded-md animate-slide-down">
          <div className="flex items-center justify-center w-8 h-8 bg-brand-400/15 rounded-sm text-accent shrink-0">
            <GlobeIcon size={16} />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="text-[0.85rem] font-semibold text-text-default truncate mb-0.5">
              {pageContext.pageTitle}
            </div>
            <div className="text-[0.7rem] text-text-subtle truncate">{pageContext.pageUrl}</div>
          </div>
          <button
            className="flex items-center justify-center w-6 h-6 border-none bg-transparent text-text-subtle rounded-full cursor-pointer shrink-0 transition-all duration-150 hover:bg-danger-400/20 hover:text-danger-400"
            onClick={handleRemovePageContext}
            title="Remove page context"
          >
            <XIcon size={14} />
          </button>
        </div>
      )}

      {/* Edit Selected Text */}
      {selectedText && (
        <div className="flex items-center justify-between px-2.5 py-2 mb-2.5 bg-purple-400/[0.08] border border-purple-400/15 rounded-sm animate-slide-down">
          <div className="flex items-center gap-1.5 text-[0.8rem] text-accent-subtle overflow-hidden flex-1">
            <FileTextIcon size={12} />
            <span className="truncate max-w-60">
              {selectedText.selectedText.length > 80
                ? `${selectedText.selectedText.substring(0, 80)}...`
                : selectedText.selectedText}
            </span>
          </div>
          <button
            className="flex items-center justify-center w-6 h-6 border-none bg-transparent text-text-subtle rounded-full cursor-pointer shrink-0 transition-all duration-150 hover:bg-danger-400/20 hover:text-danger-400"
            onClick={handleRemoveSelectedText}
            title="Remove selection"
          >
            <XIcon size={10} />
          </button>
        </div>
      )}

      {/* Edit Attachments */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5 animate-slide-down">
          {attachments.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-2 py-1.5 bg-bg-surface-raised border border-border rounded-sm text-[0.8rem] text-text-muted"
            >
              {att.type === 'image' ? (
                <>
                  <img src={att.data} alt={att.name} className="w-10 h-10 object-cover rounded-sm" />
                  <span className="truncate max-w-20">{att.name}</span>
                </>
              ) : (
                <>
                  <span>{att.type === 'pdf' ? '📄' : '📃'}</span>
                  <span className="truncate max-w-20">{att.name}</span>
                </>
              )}
              <button
                className="flex items-center justify-center w-4 h-4 border-none bg-transparent text-text-subtle cursor-pointer rounded-full shrink-0 transition-all duration-150 hover:bg-danger-400/20 hover:text-danger-400"
                onClick={() => handleRemoveAttachment(idx)}
                title="Remove"
              >
                <XIcon size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add attachments buttons */}
      <div className="flex items-center gap-1 mb-2">
        <Btn variant="ghost" size="sm" onClick={handleAddPageContext} title="Add page context">
          <GlobeIcon size={14} />
        </Btn>
        <Btn variant="ghost" size="sm" onClick={handleAddSelectedText} title="Add selected text">
          <FileTextIcon size={14} />
        </Btn>
        <Btn variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Attach file">
          <PlusIcon size={14} />
        </Btn>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*,.txt,.csv,.pdf"
          multiple
          onChange={(e) => handleFileSelect(e.target.files)}
        />
      </div>

      <textarea
        ref={textareaRef}
        className="w-full mt-2 mb-0 overflow-y-auto border-none outline-none resize-none max-inline-max field-sizing-content max-h-[150px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
      />

      <div className="mb-1 w-full flex justify-end gap-2 mt-2">
        <Btn variant="ghost" size="sm" onClick={handleCancel} title="Cancel (Escape)">
          <XIcon size={14} />
          Cancel
        </Btn>
        <Btn variant="default" size="sm" onClick={handleSubmit} title="Submit (Enter)">
          <CheckIcon size={14} />
          Submit
        </Btn>
      </div>

      {/* Confirm Dialog for Submit with after-messages */}
      <ConfirmDialog
        isOpen={showSubmitConfirm}
        title="Regenerate Response?"
        message="Editing this message will clear all following messages and start a new response. Continue?"
        confirmLabel="Continue"
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
      />

      {/* Confirm Dialog for Cancel with changes */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Discard Changes?"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmLabel="Discard"
        variant="danger"
        onConfirm={handleConfirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}
