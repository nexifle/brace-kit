/**
 * Think Tag Parser
 *
 * Parses <think>...</think> blocks embedded in streaming text content.
 * Used by OpenAI-compatible, Anthropic-compatible, and Gemini-compatible
 * endpoints that embed reasoning inline (e.g. Qwen3, some Ollama models).
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

export interface ThinkTagParser {
  /** Process a content delta, yielding text/reasoning chunks. */
  process(content: string): Generator<ThinkChunk>;
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
    *process(content: string): Generator<ThinkChunk> {
      buffer += content;

      let processing = true;
      while (processing && buffer.length > 0) {
        if (!inThinkBlock) {
          const startIdx = buffer.indexOf('<think>');
          if (startIdx === -1) {
            const partial = trailingPartialMatch(buffer, '<think>');
            const safe = buffer.slice(0, buffer.length - partial);
            if (safe) yield { type: 'text', content: safe };
            buffer = partial > 0 ? buffer.slice(-partial) : '';
            processing = false;
          } else {
            if (startIdx > 0) yield { type: 'text', content: buffer.slice(0, startIdx) };
            buffer = buffer.slice(startIdx + '<think>'.length);
            inThinkBlock = true;
          }
        } else {
          const endIdx = buffer.indexOf('</think>');
          if (endIdx === -1) {
            const partial = trailingPartialMatch(buffer, '</think>');
            const safe = buffer.slice(0, buffer.length - partial);
            if (safe) yield { type: 'reasoning', content: safe };
            buffer = partial > 0 ? buffer.slice(-partial) : '';
            processing = false;
          } else {
            if (endIdx > 0) yield { type: 'reasoning', content: buffer.slice(0, endIdx) };
            buffer = buffer.slice(endIdx + '</think>'.length);
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
