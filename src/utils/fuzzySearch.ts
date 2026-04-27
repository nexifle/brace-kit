import fuzzysort from 'fuzzysort';

/**
 * Fuzzy-filter a string array by a query.
 * Uses fuzzysort for multi-character queries, falls back to includes() for short queries.
 * Always returns a new array to prevent callers from mutating the original.
 */
export function fuzzyFilter(items: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return items.slice();

  if (q.length <= 2) {
    const lower = q.toLowerCase();
    return items.filter(item => item.toLowerCase().includes(lower));
  }

  // Prioritize exact substring matches — model IDs are technical strings where
  // users expect "qwen" to match only models containing "qwen", not scattered chars.
  const lower = q.toLowerCase();
  const exact = items.filter(item => item.toLowerCase().includes(lower));
  if (exact.length > 0) return exact;

  // Fuzzy fallback for typo tolerance (e.g. "gpt4" → "gpt-4o", "llama3" → "llama-3.3").
  const results = fuzzysort.go(q, items, { threshold: -(q.length * 150), limit: 200 });
  return results.map(r => r.target);
}

/**
 * Fuzzy-filter an object array by a query against a specific key.
 * Always returns a new array to prevent callers from mutating the original.
 */
export function fuzzyFilterBy<T>(
  items: T[],
  query: string,
  key: keyof T & string,
  options: { threshold?: number; limit?: number } = {},
): T[] {
  const { threshold = -10000, limit = 200 } = options;
  const q = query.trim();
  if (!q) return items.slice();

  if (q.length <= 2) {
    const lower = q.toLowerCase();
    return items.filter((item) => {
      const value = item[key];
      if (value == null) return false;
      return String(value).toLowerCase().includes(lower);
    });
  }

  const searchableItems = items.filter(item => item[key] != null);
  const results = fuzzysort.go(q, searchableItems, { key: key as string, threshold, limit });
  return results.map(r => r.obj);
}

/**
 * Multi-field fuzzy search with weighted scoring.
 * Searches across multiple keys and merges results by item identity,
 * applying configurable score weights per field.
 * Always returns a new array to prevent callers from mutating the original.
 */
export function fuzzySearchMulti<T>(
  items: T[],
  query: string,
  fields: { key: keyof T & string; weight?: number }[],
  options: {
    getId?: (item: T) => string;
    threshold?: number;
    limit?: number;
    shortQueryFallback?: (items: T[], query: string) => T[];
  } = {},
): T[] {
  const { getId, threshold = -10000, limit = 200, shortQueryFallback } = options;
  const q = query.trim();
  if (!q) return items.slice();

  if (q.length <= 2 && shortQueryFallback) {
    return shortQueryFallback(items, q);
  }

  const resultMap = new Map<string | T, { item: T; score: number }>();

  for (const { key, weight = 1 } of fields) {
    const searchableItems = items.filter(item => item[key] != null);
    const results = fuzzysort.go(q, searchableItems, { key: key as string, threshold, limit });
    for (const r of results) {
      const resultKey = getId ? getId(r.obj) : r.obj;
      const existing = resultMap.get(resultKey);
      const safeWeight = weight > 0 ? weight : 1;
      // Fuzzysort scores are <= 0 where values closer to 0 are better.
      // Normalize them into a positive range first so exact matches (score 0)
      // can still be boosted by field weights.
      const normalizedScore = 1 / (1 - r.score);
      const score = normalizedScore * safeWeight;
      if (existing) existing.score = Math.max(existing.score, score);
      else resultMap.set(resultKey, { item: r.obj, score });
    }
  }

  return Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .map(r => r.item);
}

/**
 * Highlight fuzzy match characters in text using fuzzysort.
 * Returns HTML string with matches wrapped in the given open/close tags.
 */
export function fuzzyHighlight(
  text: string,
  query: string,
  openTag = '<mark>',
  closeTag = '</mark>',
): string {
  if (!query.trim()) return text;
  const result = fuzzysort.single(query, text);
  if (!result) return text;
  return result.highlight(openTag, closeTag);
}
