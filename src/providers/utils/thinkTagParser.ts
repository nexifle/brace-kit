/**
 * Think Tag Parser
 *
 * Splits reasoning embedded by models like Qwen3 / QwQ into separate
 * text/reasoning chunks. Real models emit the tags on their own lines:
 *
 *   \n\n thinking\n<reasoning>\n\n response\n<answer>
 *
 * The tags are anchored to a line boundary (start of input or a newline) so
 * the words "thinking" / "response" in ordinary prose are never mistaken for
 * tags. Used by OpenAI-compatible, Anthropic-compatible, and Gemini-compatible
 * endpoints that embed reasoning inline.
 */

export interface ThinkChunk {
  type: 'text' | 'reasoning';
  content: string;
}

// Open tag: " thinking" at the start of a line. Close tag: " response" at the
// start of a line. Both anchored so prose like "I was thinking about the
// correct response" is never treated as a tag.
const OPEN_TAG = '\n thinking';
const CLOSE_TAG = '\n response';
// Lengths include the leading newline.
const OPEN_TAG_LEN = OPEN_TAG.length;
const CLOSE_TAG_LEN = CLOSE_TAG.length;

export interface ThinkTagParser {
  /** Process a content delta, yielding text/reasoning chunks. */
  process(content: string): Generator<ThinkChunk>;
  /** Strip think tags from static content (backwards-compatible). */
  nonStreamingProcess(content: string): string;
  /** Split static content into text + reasoning, keeping the reasoning. */
  nonStreamingParse(content: string): { content: string; reasoning: string };
  /** Flush any buffered content when the stream ends. Returns null if nothing buffered. */
  flush(): ThinkChunk | null;
}

function trailingPartialMatch(str: string, tag: string): number {
  const maxLen = Math.min(str.length, tag.length - 1);
  for (let i = maxLen; i > 0; i--) {
    if (str.endsWith(tag.slice(0, i))) return i;
  }
  return 0;
}

/**
 * Find the open tag in line-anchored form. Returns the index of the "\n"
 * that precedes " thinking" (or 0 when the tag starts the buffer), else -1.
 * The tag must be preceded by a newline or the start of the string.
 */
function findOpenTag(buffer: string): number {
  const idx = buffer.indexOf(OPEN_TAG);
  if (idx !== -1) return idx;
  // Tag at the very start of the buffer (no preceding newline yet).
  if (buffer.startsWith(' thinking')) return 0;
  return -1;
}

function findCloseTag(buffer: string): number {
  return buffer.indexOf(CLOSE_TAG);
}

export function createThinkTagParser(): ThinkTagParser {
  let inThinkBlock = false;
  let buffer = '';

  return {
    nonStreamingProcess(content: string): string {
      return content.replace(/\n thinking[\s\S]*?\n response/g, '\n').trim();
    },
    nonStreamingParse(content: string): { content: string; reasoning: string } {
      let reasoning = '';
      const text = content
        .replace(/\n thinking([\s\S]*?)\n response/g, (_m, inner: string) => {
          reasoning += (reasoning ? '\n' : '') + inner.trim();
          return '\n';
        })
        .trim();
      return { content: text, reasoning };
    },
    *process(content: string): Generator<ThinkChunk> {
      buffer += content;

      let processing = true;
      while (processing && buffer.length > 0) {
        if (!inThinkBlock) {
          const startIdx = findOpenTag(buffer);
          if (startIdx === -1) {
            // Hold back any trailing partial of the open tag ("\n thin").
            const partial = trailingPartialMatch(buffer, OPEN_TAG);
            const safe = buffer.slice(0, buffer.length - partial);
            if (safe) yield { type: 'text', content: safe };
            buffer = partial > 0 ? buffer.slice(-partial) : '';
            processing = false;
          } else {
            if (startIdx > 0) yield { type: 'text', content: buffer.slice(0, startIdx) };
            buffer = buffer.slice(startIdx + OPEN_TAG_LEN);
            inThinkBlock = true;
          }
        } else {
          const endIdx = findCloseTag(buffer);
          if (endIdx === -1) {
            const partial = trailingPartialMatch(buffer, CLOSE_TAG);
            const safe = buffer.slice(0, buffer.length - partial);
            if (safe) yield { type: 'reasoning', content: safe };
            buffer = partial > 0 ? buffer.slice(-partial) : '';
            processing = false;
          } else {
            if (endIdx > 0) yield { type: 'reasoning', content: buffer.slice(0, endIdx) };
            buffer = buffer.slice(endIdx + CLOSE_TAG_LEN);
            inThinkBlock = false;
          }
        }
      }
    },

    flush(): ThinkChunk | null {
      if (buffer.length === 0) return null;
      const chunk: ThinkChunk = { type: inThinkBlock ? 'reasoning' : 'text', content: buffer };
      buffer = '';
      return chunk;
    },
  };
}
