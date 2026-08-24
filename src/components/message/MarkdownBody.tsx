import { useMemo, useRef, type ReactNode } from 'react';
import parse from 'html-react-parser';
import { renderMarkdown } from '../../utils/markdown.ts';
import { useMarkdownInteractions, useMermaidHydration } from '../../hooks';

/** Prose chrome shared by chat bubbles and the slide-creator rail. */
export const MARKDOWN_BODY_PROSE_CLASS =
  'prose dark:prose-invert prose-sm prose-p:my-2 prose-hr:my-4 max-w-none relative break-words text-sm leading-relaxed';

export interface MarkdownBodyProps {
  content: string;
  /** When true, uses streaming-safe markdown + react parse (stable code blocks). */
  isStreaming?: boolean;
  /**
   * `prose` — full typography shell (default; rail / standalone).
   * `bare` — no prose classes; parent supplies bubble chrome (MessageBubble).
   */
  variant?: 'prose' | 'bare';
  className?: string;
  /** Optional trailing node (e.g. live caret) rendered after the markdown. */
  endAdornment?: ReactNode;
}

/**
 * Shared rendered-markdown body for main chat bubbles and the slide rail.
 * Runs the same `renderMarkdown` pipeline plus code/table/mermaid interactions
 * so callers stay DRY.
 */
export function MarkdownBody({
  content,
  isStreaming = false,
  variant = 'prose',
  className,
  endAdornment,
}: MarkdownBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  useMarkdownInteractions(ref);
  useMermaidHydration(ref, { isStreaming });

  const html = useMemo(
    () => renderMarkdown(content, isStreaming),
    [content, isStreaming],
  );

  const shell =
    variant === 'prose'
      ? [MARKDOWN_BODY_PROSE_CLASS, className].filter(Boolean).join(' ')
      : className || undefined;

  return (
    <div ref={ref} className={shell}>
      {isStreaming ? parse(html) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {endAdornment}
    </div>
  );
}
