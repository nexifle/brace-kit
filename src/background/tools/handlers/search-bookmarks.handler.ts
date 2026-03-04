/**
 * Search Bookmarks Tool Handler
 * Performs keyword-based search on Chrome bookmarks.
 * Results are returned to the AI in the chat conversation,
 * which then provides semantic interpretation to the user.
 */

import type { ToolResult } from '../index';
import { flattenBookmarks } from '../../utils/bookmarks';
import type { SmartBookmark } from '../../../types';

interface SearchBookmarksArgs {
  query?: string;
}

/**
 * Score a bookmark against the query words.
 * Higher score = more relevant.
 */
function scoreBookmark(bookmark: SmartBookmark, queryWords: string[]): number {
  const text = `${bookmark.title} ${bookmark.url} ${bookmark.folderPath || ''}`.toLowerCase();
  return queryWords.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

export async function handleSearchBookmarks(
  args: SearchBookmarksArgs | undefined
): Promise<ToolResult> {
  const query = args?.query?.trim() || '';

  if (!query) {
    return { content: [{ text: 'No query provided. Please specify what to search for.' }] };
  }

  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = flattenBookmarks(tree);

    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);

    // Score and filter bookmarks
    const scored = bookmarks
      .map((b) => ({ bookmark: b, score: scoreBookmark(b, queryWords) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20); // top 20 results

    if (scored.length === 0) {
      return {
        content: [
          {
            text: `No bookmarks found matching "${query}". The user may not have bookmarked any pages about this topic.`,
          },
        ],
      };
    }

    const resultText = scored
      .map(({ bookmark: b }) => {
        const folder = b.folderPath ? ` (folder: ${b.folderPath})` : '';
        return `- ${b.title}${folder}\n  URL: ${b.url}`;
      })
      .join('\n');

    return {
      content: [
        {
          text: `Found ${scored.length} bookmark(s) matching "${query}":\n\n${resultText}`,
        },
      ],
    };
  } catch (e) {
    return {
      content: [
        {
          text: `Failed to access bookmarks: ${(e as Error).message}`,
        },
      ],
    };
  }
}
