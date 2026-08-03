/**
 * Think Tag Parser
 *
 * Parses <space>think<space>...<space>response blocks embedded in text
 * content (Qwen3 / QwQ style). Used by OpenAI-compatible, Anthropic-compatible,
 * and Gemini-compatible endpoints that embed reasoning inline.
 *
 * Usage:
 *   const parser = createThinkTagParser();
 *   for (const chunk of parser.process(deltaContent)) { ... }
 *   const trailing = parser.flush(); // call when stream ends
 */

export interface ThinkChunk {
  type: 'text' | 'reasoning';
  content: string;
}

// Matches the tags used by process(): " thinking ...  response" (space style).
const THINK_TAG_REGEX = / thinking([\s\S]*?) response/gi;

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

export function createThinkTagParser(): ThinkTagParser {
  let inThinkBlock = false;
  let buffer = '';

  return {
    nonStreamingProcess(content: string): string {
      return content.replace(THINK_TAG_REGEX, '').trim();
    },
    nonStreamingParse(content: string): { content: string; reasoning: string } {
      let reasoning = '';
      const text = content.replace(THINK_TAG_REGEX, (_match, inner: string) => {
        reasoning += (reasoning ? '\n' : '') + inner.trim();
        return '';
      }).trim();
      return { content: text, reasoning };
    },
    *process(content: string): Generator<ThinkChunk> {
      buffer += content;

      let processing = true;
      while (processing && buffer.length > 0) {
        if (!inThinkBlock) {
          const startIdx = buffer.indexOf(' thinking');
          if (startIdx === -1) {
            const partial = trailingPartialMatch(buffer, ' thinking');
            const safe = buffer.slice(0, buffer.length - partial);
            if (safe) yield { type: 'text', content: safe };
            buffer = partial > 0 ? buffer.slice(-partial) : '';
            processing = false;
          } else {
            if (startIdx > 0) yield { type: 'text', content: buffer.slice(0, startIdx) };
            buffer = buffer.slice(startIdx + ' thinking'.length);
            inThinkBlock = true;
          }
        } else {
          const endIdx = buffer.indexOf(' response');
          if (endIdx === -1) {
            const partial = trailingPartialMatch(buffer, ' response');
            const safe = buffer.slice(0, buffer.length - partial);
            if (safe) yield { type: 'reasoning', content: safe };
            buffer = partial > 0 ? buffer.slice(-partial) : '';
            processing = false;
          } else {
            if (endIdx > 0) yield { type: 'reasoning', content: buffer.slice(0, endIdx) };
            buffer = buffer.slice(endIdx + ' response'.length);
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
