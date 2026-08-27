import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import parse from 'html-react-parser';
import { renderMarkdown } from '../../utils/markdown.ts';
import { useMarkdownInteractions, useMermaidHydration } from '../../hooks';

/** Cap so a restored snapshot does not fade the entire bubble. */
const STREAM_CHUNK_MAX_CHARS = 80;

export function markdownTextLength(node: ReactNode): number {
  if (node == null || typeof node === 'boolean') return 0;
  if (typeof node === 'string' || typeof node === 'number') return String(node).length;
  if (Array.isArray(node)) {
    let n = 0;
    for (const child of node) n += markdownTextLength(child);
    return n;
  }
  if (isValidElement(node)) {
    return markdownTextLength((node.props as { children?: ReactNode }).children);
  }
  return 0;
}

function keyed(node: ReactNode, key: string): ReactNode {
  if (isValidElement(node) && node.key == null) {
    return cloneElement(node, { key });
  }
  return node;
}

function wrapTextSuffix(text: string, remaining: number): { node: ReactNode; remaining: number } {
  if (remaining <= 0 || text.length === 0) return { node: text, remaining };
  // Keep inter-element whitespace stable; spend the delta on visible text.
  if (text.trim().length === 0) return { node: text, remaining };
  if (text.length <= remaining) {
    return {
      node: <span className="bk-stream-chunk">{text}</span>,
      remaining: remaining - text.length,
    };
  }
  const split = text.length - remaining;
  return {
    node: (
      <Fragment>
        {text.slice(0, split)}
        <span className="bk-stream-chunk">{text.slice(split)}</span>
      </Fragment>
    ),
    remaining: 0,
  };
}

/** Wrap the last `remaining` visible characters in `.bk-stream-chunk` (walk from the end). */
export function wrapStreamingSuffix(node: ReactNode, remaining: number): { node: ReactNode; remaining: number } {
  if (remaining <= 0) return { node, remaining: 0 };
  if (node == null || typeof node === 'boolean') return { node, remaining };
  if (typeof node === 'string' || typeof node === 'number') {
    return wrapTextSuffix(String(node), remaining);
  }
  if (Array.isArray(node)) {
    const out = node.slice();
    let rem = remaining;
    for (let i = out.length - 1; i >= 0 && rem > 0; i--) {
      const r = wrapStreamingSuffix(out[i], rem);
      out[i] = keyed(r.node, `bk-s-${i}`);
      rem = r.remaining;
    }
    return { node: out, remaining: rem };
  }
  if (isValidElement(node)) {
    const children = (node.props as { children?: ReactNode }).children;
    if (children == null) return { node, remaining };
    const childList = Children.toArray(children);
    const r = wrapStreamingSuffix(childList.length === 1 ? childList[0] : childList, remaining);
    if (r.node === children) return { node, remaining: r.remaining };
    return { node: cloneElement(node, undefined, r.node), remaining: r.remaining };
  }
  return { node, remaining };
}

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

  const parsed = useMemo(
    () => (isStreaming ? parse(html) : null),
    [html, isStreaming],
  );

  const prevTextRef = useRef(0);
  const prevContentRef = useRef('');

  let streamingBody: ReactNode = parsed;
  if (isStreaming && parsed != null) {
    const fullText = markdownTextLength(parsed);
    const prevText = prevTextRef.current;
    const prevContent = prevContentRef.current;
    const prefixExtend = prevContent.length === 0 || content.startsWith(prevContent);
    let delta = 0;
    if (prefixExtend && fullText > prevText) {
      delta = Math.min(fullText - prevText, STREAM_CHUNK_MAX_CHARS);
    }
    prevTextRef.current = fullText;
    prevContentRef.current = content;
    streamingBody = delta > 0 ? wrapStreamingSuffix(parsed, delta).node : parsed;
  } else if (!isStreaming) {
    prevTextRef.current = 0;
    prevContentRef.current = '';
  }

  const shell =
    variant === 'prose'
      ? [MARKDOWN_BODY_PROSE_CLASS, className].filter(Boolean).join(' ')
      : className || undefined;

  return (
    <div ref={ref} className={shell}>
      {isStreaming ? streamingBody : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
      {endAdornment}
    </div>
  );
}
