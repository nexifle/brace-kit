import fuzzysort from 'fuzzysort';

/**
 * Fuzzy-filter a string array by a query.
 * Uses fuzzysort for multi-character queries, falls back to includes() for short queries.
 */
export function fuzzyFilter(items: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return items;

  if (q.length <= 2) {
    const lower = q.toLowerCase();
    return items.filter(item => item.toLowerCase().includes(lower));
  }

  const results = fuzzysort.go(q, items, { threshold: -10000, limit: 200 });
  return results.map(r => r.target);
}

/**
 * Fuzzy-filter an object array by a query against a specific key.
 */
export function fuzzyFilterBy<T>(
  items: T[],
  query: string,
  key: keyof T & string,
  options: { threshold?: number; limit?: number } = {},
): T[] {
  const { threshold = -10000, limit = 200 } = options;
  const q = query.trim();
  if (!q) return items;

  if (q.length <= 2) {
    const lower = q.toLowerCase();
    return items.filter(item => String(item[key]).toLowerCase().includes(lower));
  }

  const results = fuzzysort.go(q, items, { key: key as string, threshold, limit });
  return results.map(r => r.obj);
}

/**
 * Multi-field fuzzy search with weighted scoring.
 * Searches across multiple keys and merges results by item identity,
 * applying configurable score weights per field.
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
  const { getId = (_: T) => '', threshold = -10000, limit = 200, shortQueryFallback } = options;
  const q = query.trim();
  if (!q) return items;

  if (q.length <= 2 && shortQueryFallback) {
    return shortQueryFallback(items, q);
  }

  const resultMap = new Map<string, { item: T; score: number }>();

  for (const { key, weight = 1 } of fields) {
    const results = fuzzysort.go(q, items, { key: key as string, threshold, limit });
    for (const r of results) {
      const id = getId(r.obj);
      const existing = resultMap.get(id);
      const score = r.score * weight;
      if (existing) existing.score = Math.max(existing.score, score);
      else resultMap.set(id, { item: r.obj, score });
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
