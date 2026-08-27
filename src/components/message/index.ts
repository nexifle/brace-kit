// Main component
export { MessageBubble } from './MessageBubble';

// Streaming component (optimized for streaming re-renders)
export { StreamingBubble } from './StreamingBubble';
export { AgentActivityBlock } from './AgentActivityBlock';
export { ToolCallDetailSheet } from './ToolCallDetailSheet';

// Shared markdown body (main chat + slide rail)
export {
  MarkdownBody,
  MARKDOWN_BODY_PROSE_CLASS,
  markdownTextLength,
  wrapStreamingSuffix,
} from './MarkdownBody.tsx';
export type { MarkdownBodyProps } from './MarkdownBody.tsx';

// Types
export type {
  MessageBubbleProps,
  EditedMessageData,
  TextFileViewerState,
  ImageLightboxProps,
  ReasoningSectionProps,
  ContextSectionProps,
  SelectionSectionProps,
  ImagesSectionProps,
  CitationsSectionProps,
  MessageCopyButtonProps,
  MessageActionsProps,
  UserActionsProps,
  EditModeProps,
  SummarySectionProps,
} from './MessageBubble.types';

// Section components
export { ReasoningSection } from './sections/ReasoningSection';
export { ContextSection } from './sections/ContextSection';
export { SelectionSection } from './sections/SelectionSection';
export { ImagesSection } from './sections/ImagesSection';
export { CitationsSection } from './sections/CitationsSection';

// Action components
export { MessageCopyButton } from './actions/CopyButton';
export { BranchButton } from './actions/BranchButton';
export { MessageActions } from './actions/MessageActions';
export { UserActions } from './actions/UserActions';

// Display components
export { ImageLightbox } from './display/ImageLightbox';
export { SummarySection } from './display/SummarySection';
export { AttachmentsDisplay } from './display/AttachmentsDisplay';

// Edit components
export { EditMode } from './edit/EditMode';

// Utils
export * from './utils/tableConverters';
export * from './utils/imageProcessing';
