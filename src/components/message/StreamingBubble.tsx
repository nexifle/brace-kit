import { memo, useRef } from 'react';
import { QuoteIcon } from 'lucide-react';
import { useStore } from '../../store';
import { useImageGenerationCheck, useQuoteSelection } from '../../hooks';
import { ReasoningSection } from './sections/ReasoningSection';
import { MarkdownBody } from './MarkdownBody.tsx';

// Import shared UI components
import { LoadingDots } from '../ui/LoadingDots';
import { ImageGenerationIndicator } from '../ui/ImageGenerationIndicator';

/**
 * StreamingBubble - Optimized component for displaying streaming AI responses.
 *
 * This component manages its own store subscriptions to prevent unnecessary
 * re-renders in parent components (MessageList) and sibling MessageBubble instances.
 *
 * Features:
 * - Isolated store subscriptions
 * - Quote selection support
 * - Reasoning content display
 * - Image generation loading indicator
 */
function StreamingBubbleInternal() {
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Streaming state - isolated subscriptions
  const streamingContent = useStore((state) => state.streamingContent);
  const streamingReasoningContent = useStore((state) => state.streamingReasoningContent);

  // Use extracted hooks
  const isImageGenerationModel = useImageGenerationCheck();
  const { quotePopup, handleMouseUp, handleQuoteClick } = useQuoteSelection(bubbleRef);

  const hasContent = streamingContent.length > 0;

  return (
    <div className="group flex flex-col gap-1 max-w-[92%] self-start" data-streaming-bubble="true">
      <div className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60 px-1.5">
        AI
      </div>
      <div
        className="prose dark:prose-invert prose-sm prose-p:my-2 prose-hr:my-4 max-w-none relative break-words px-3.5 py-1.5 pb-2.5 bg-muted/40 border border-border rounded-lg rounded-bl-sm"
        ref={bubbleRef}
        onMouseUp={handleMouseUp}
      >
        {/* Reasoning section (for thinking models) */}
        {streamingReasoningContent && (
          <ReasoningSection content={streamingReasoningContent} isStreaming={true} />
        )}

        {/* Main content — shared MarkdownBody (streaming parse for stable blocks) */}
        {hasContent ? (
          <MarkdownBody
            content={streamingContent}
            isStreaming
            variant="bare"
            className="text-sm leading-relaxed"
          />
        ) : (
          <LoadingDots />
        )}

        {/* Image generation indicator */}
        {isImageGenerationModel && <ImageGenerationIndicator />}

        {/* Quote popup */}
        {quotePopup.visible && (
          <div
            className="absolute z-10 flex items-center bg-popover/95 backdrop-blur-md border border-border rounded-md shadow-xl p-0.5 animate-in fade-in zoom-in-95 duration-200"
            style={{
              left: quotePopup.x,
              top: quotePopup.y,
              transform: 'translate(-50%, -100%)',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-sm transition-all"
              onClick={handleQuoteClick}
              title="Quote"
            >
              <div className="flex items-center justify-center">
                <QuoteIcon size={14} />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Export memoized component with display name for DevTools
export const StreamingBubble = memo(StreamingBubbleInternal);
StreamingBubble.displayName = 'StreamingBubble';
