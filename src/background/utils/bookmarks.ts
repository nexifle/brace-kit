/**
 * Shared bookmark utilities for background handlers and tools
 */

import type { SmartBookmark } from '../../types';

/**
 * Flatten Chrome bookmarks tree into a list of bookmarks (leaf nodes with url).
 * Builds a folder path string for context (e.g. "Programming > React").
 */
export function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  parentPath = ''
): SmartBookmark[] {
  const results: SmartBookmark[] = [];

  for (const node of nodes) {
    const currentPath = parentPath
      ? node.title
        ? `${parentPath} > ${node.title}`
        : parentPath
      : node.title || '';

    if (node.url) {
      results.push({
        id: node.id,
        title: node.title || node.url,
        url: node.url,
        dateAdded: node.dateAdded,
        folderPath: parentPath || undefined,
      });
    } else if (node.children) {
      results.push(...flattenBookmarks(node.children, currentPath));
    }
  }

  return results;
}
