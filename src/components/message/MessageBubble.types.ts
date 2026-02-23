import type { Message, Attachment, PageContext, SelectedText, GroundingMetadata } from '../../types';

// Re-export types needed by sub-components
export type { Attachment, PageContext, SelectedText, GroundingMetadata, Message };

export interface EditedMessageData {
  text: string;
  pageContext?: PageContext | null;
  selectedText?: SelectedText | null;
  attachments?: Attachment[];
}

export interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  messageIndex?: number;
  onBranch?: (index: number) => void;
  onRegenerate?: (index: number) => void;
  onEdit?: (index: number, data: EditedMessageData) => void;
}

export interface QuotePopupState {
  visible: boolean;
  x: number;
  y: number;
  text: string;
}

export interface TextFileViewerState {
  isOpen: boolean;
  name: string;
  content: string;
}

export interface ImageLightboxProps {
  src: string;
  favId?: string;
  isFavorited?: boolean;
  onToggleFavorite?: (id: string) => void;
  onClose: () => void;
}

export interface ReasoningSectionProps {
  content: string;
  isStreaming?: boolean;
}

export interface ContextSectionProps {
  context: PageContext;
}

export interface SelectionSectionProps {
  selection: SelectedText;
}

export interface ImagesSectionProps {
  images: Array<{ mimeType: string; data: string; imageRef?: string }>;
  messageIndex?: number;
  onImageClick: (src: string) => void;
  onToggleFavorite: (id: string) => void;
  favorites: Set<string>;
  activeConversationId?: string | null;
}

export interface CitationsSectionProps {
  groundingMetadata?: GroundingMetadata;
}

export interface MessageCopyButtonProps {
  content: string;
}

export interface MessageActionsProps {
  content: string;
  messageIndex?: number;
  onBranch?: (index: number) => void;
}

export interface UserActionsProps {
  content: string;
  messageIndex?: number;
  isEditing: boolean;
  onEdit?: () => void;
  onRegenerate?: (index: number) => void;
  onBranch?: (index: number) => void;
}

export interface EditModeProps {
  initialText: string;
  initialPageContext?: PageContext | null;
  initialSelectedText?: SelectedText | null;
  initialAttachments?: Attachment[];
  hasAfterMessages: boolean;
  onSubmit: (data: EditedMessageData) => void;
  onCancel: () => void;
}

export interface SummarySectionProps {
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
}
