/**
 * Bookmarks Handler - Handles Chrome Bookmarks API access and AI-powered search
 * @module background/handlers/bookmarks
 */

import {
  PROVIDER_PRESETS,
  formatRequest,
  type ProviderWithConfig,
} from '../../providers';
import type { BookmarkSearchResult, ProviderConfig } from '../../types';
import { getFriendlyErrorMessage } from '../utils/errors';
import { flattenBookmarks } from '../utils/bookmarks';

type SendResponse = (response?: unknown) => void;

interface BookmarksGetAllMessage {
  type: 'BOOKMARKS_GET_ALL';
}

interface BookmarksSearchMessage {
  type: 'BOOKMARKS_SEARCH';
  query: string;
  providerConfig: ProviderConfig;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
}

interface OpenAIChoice {
  message?: { content?: string };
}

interface AnthropicContent {
  text?: string;
}

/** Maximum number of bookmarks to send to AI (to avoid token limit errors) */
const MAX_BOOKMARKS_FOR_AI = 200;

/**
 * Handle BOOKMARKS_GET_ALL: return flat list of all Chrome bookmarks
 */
export async function handleBookmarksGetAll(
  _message: BookmarksGetAllMessage,
  sendResponse: SendResponse
): Promise<void> {
  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = flattenBookmarks(tree);
    sendResponse({ bookmarks });
  } catch (e) {
    sendResponse({ error: (e as Error).message });
  }
}

/**
 * Handle BOOKMARKS_SEARCH: use AI to find bookmarks relevant to a query.
 * Pre-filters with keyword matching to stay within token limits, then uses AI
 * for semantic evaluation of the candidate set.
 */
export async function handleBookmarksSearch(
  message: BookmarksSearchMessage,
  sendResponse: SendResponse
): Promise<void> {
  const { query, providerConfig } = message;

  try {
    const tree = await chrome.bookmarks.getTree();
    const allBookmarks = flattenBookmarks(tree);

    if (allBookmarks.length === 0) {
      sendResponse({ results: [] });
      return;
    }

    // Pre-filter with keyword matching when bookmark count exceeds AI limit
    const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);
    const candidates =
      allBookmarks.length > MAX_BOOKMARKS_FOR_AI
        ? allBookmarks
            .map((b) => {
              const text = `${b.title} ${b.url} ${b.folderPath || ''}`.toLowerCase();
              const score = queryWords.reduce((s, w) => s + (text.includes(w) ? 1 : 0), 0);
              return { bookmark: b, score };
            })
            .filter(({ score }) => score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_BOOKMARKS_FOR_AI)
            .map(({ bookmark }) => bookmark)
        : allBookmarks;

    if (candidates.length === 0) {
      sendResponse({ results: [] });
      return;
    }

    // Format bookmark list for AI prompt
    const bookmarkList = candidates
      .map((b, i) => {
        const folder = b.folderPath ? ` [${b.folderPath}]` : '';
        return `${i + 1}. [ID:${b.id}] "${b.title}"${folder}\n   URL: ${b.url}`;
      })
      .join('\n');

    const systemPrompt = `You are a bookmark search assistant. The user wants to find bookmarks relevant to their query.

RETURN ONLY a valid JSON array — no markdown, no explanation, just the array.

Each result must have:
- "id": the bookmark ID (string, from the [ID:...] field)
- "relevance": a brief explanation (1-2 sentences) of why this bookmark is relevant

Only include genuinely relevant bookmarks. Return [] if nothing matches.

Example output:
[{"id":"123","relevance":"This is the official React documentation covering hooks in depth."}]`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `Find bookmarks relevant to: "${query}"\n\nMy bookmarks:\n${bookmarkList}`,
      },
    ];

    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider: ProviderWithConfig = {
      ...preset,
      ...providerConfig,
      format: providerConfig.format || preset.format,
      apiUrl: providerConfig.apiUrl || preset.apiUrl,
    };

    if (!provider.apiKey) {
      sendResponse({ error: 'No API key configured' });
      return;
    }

    const { url: streamUrl, options } = formatRequest(provider, messages, []);
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    // Non-streaming request
    let url = streamUrl;
    if (provider.format === 'openai') {
      body.stream = false;
    } else if (provider.format === 'anthropic') {
      body.stream = false;
    } else if (provider.format === 'gemini') {
      url = url.replace(':streamGenerateContent', ':generateContent').replace('alt=sse&', '');
    }

    options.body = JSON.stringify(body);
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response);
      sendResponse({ error });
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;

    let rawText = '';
    if (provider.format === 'openai') {
      const choices = data.choices as OpenAIChoice[] | undefined;
      rawText = choices?.[0]?.message?.content || '';
    } else if (provider.format === 'anthropic') {
      const content = data.content as AnthropicContent[] | undefined;
      rawText = content?.map((c) => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      const candidates2 = data.candidates as GeminiCandidate[] | undefined;
      rawText =
        candidates2?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
    }

    // Parse AI JSON response
    const parsed = parseAIJsonArray(rawText);
    if (!parsed) {
      sendResponse({ error: 'Failed to parse AI response' });
      return;
    }

    // Map AI results back to full bookmark objects
    const bookmarkMap = new Map(candidates.map((b) => [b.id, b]));
    const results: BookmarkSearchResult[] = parsed
      .filter((r): r is Record<string, string> => {
        if (typeof r !== 'object' || r === null) return false;
        const rec = r as Record<string, unknown>;
        return typeof rec.id === 'string' && typeof rec.relevance === 'string';
      })
      .map((r) => {
        const bookmark = bookmarkMap.get(r.id);
        if (!bookmark) return null;
        return { bookmark, relevance: r.relevance };
      })
      .filter((r): r is BookmarkSearchResult => r !== null);

    sendResponse({ results });
  } catch (e) {
    sendResponse({ error: (e as Error).message });
  }
}

/**
 * Robustly extract a JSON array from AI response text.
 * Handles markdown code fences and finds the first balanced [ ... ] block.
 */
function parseAIJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();

  // Strip markdown code fences if present
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : trimmed;

  const start = jsonStr.indexOf('[');
  if (start === -1) return null;

  // Find the matching closing bracket using bracket counting
  let depth = 0;
  let end = -1;
  for (let i = start; i < jsonStr.length; i++) {
    if (jsonStr[i] === '[') depth++;
    else if (jsonStr[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;

  try {
    const parsed = JSON.parse(jsonStr.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Register bookmarks handlers on message listener
 */
export function registerBookmarksHandlers(
  onMessage: typeof chrome.runtime.onMessage
): void {
  onMessage.addListener(
    (
      message: { type: string },
      _sender: chrome.runtime.MessageSender,
      sendResponse: SendResponse
    ) => {
      if (message.type === 'BOOKMARKS_GET_ALL') {
        handleBookmarksGetAll(message as BookmarksGetAllMessage, sendResponse);
        return true;
      }
      if (message.type === 'BOOKMARKS_SEARCH') {
        handleBookmarksSearch(message as BookmarksSearchMessage, sendResponse);
        return true;
      }
      return false;
    }
  );
}
