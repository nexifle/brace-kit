/**
 * Google Search Tool Handler
 * Executes Google search using Gemini's grounding feature
 */

export interface ToolExecutionContext {
  googleSearchApiKey?: string;
}

export interface ToolResult {
  content: Array<{ text: string }>;
}

export interface GoogleSearchArgs {
  query?: string;
  q?: string;
}

interface GeminiGroundingChunk {
  web?: {
    uri: string;
    title?: string;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
  groundingMetadata?: {
    groundingChunks?: GeminiGroundingChunk[];
    webSearchQueries?: string[];
  };
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
}

/**
 * Get user-friendly error messages from API responses
 * @param response - The fetch response object
 * @param prefix - Error prefix to use
 * @returns User-friendly error message
 */
async function getFriendlyErrorMessage(
  response: Response,
  prefix: string = 'API Error'
): Promise<string> {
  const status = response.status;
  let details = '';

  try {
    const errorText = await response.text();
    try {
      const errJson = JSON.parse(errorText) as Record<string, unknown>;
      const errorObj = errJson.error as Record<string, unknown> | undefined;
      details =
        (errorObj?.message as string | undefined) ||
        (errJson.message as string | undefined) ||
        (typeof errJson.error === 'string' ? errJson.error : null) ||
        (Array.isArray(errJson)
          ? (errJson[0] as Record<string, unknown>)?.error
            ? ((errJson[0] as Record<string, unknown>).error as Record<string, unknown>)
                .message as string
            : null
          : null) ||
        errorText;
    } catch {
      details = errorText;
    }
  } catch {
    details = response.statusText;
  }

  if (!details || details.length > 500)
    details = response.statusText || 'Unknown error';

  let statusPrefix = `${prefix} (${status})`;
  if (status === 401) statusPrefix = 'Invalid API Key (401)';
  else if (status === 403) statusPrefix = 'Permission Denied (403)';
  else if (status === 404) statusPrefix = 'Not Found (404)';
  else if (status === 429) statusPrefix = 'Rate Limit Exceeded (429)';
  else if (status >= 500) statusPrefix = 'Provider Server Error (' + status + ')';

  return `${statusPrefix}: ${details}`;
}

/**
 * Handle Google Search tool execution
 * @param args - Tool arguments
 * @param context - Execution context
 * @returns Tool result
 */
export async function handleGoogleSearch(
  args: GoogleSearchArgs | undefined,
  context: ToolExecutionContext | undefined
): Promise<ToolResult> {
  const query = args?.query || args?.q || '';

  if (!query) {
    return { content: [{ text: 'Error: query parameter is required' }] };
  }

  if (!context?.googleSearchApiKey) {
    return {
      content: [
        {
          text: 'Error: Google Search API key not configured. Set it in Settings > Chat.',
        },
      ],
    };
  }

  const geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta';
  const model = 'gemini-2.5-flash-lite';
  const url = `${geminiApiUrl}/models/${model}:generateContent?key=${context.googleSearchApiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    tools: [{ google_search: {} }],
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response, 'Google Search Error');
      return { content: [{ text: error }] };
    }

    const data = (await response.json()) as GeminiResponse;
    const candidate = data.candidates?.[0];
    const text =
      candidate?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
    const groundingMetadata = candidate?.groundingMetadata;

    let result = text;

    // Append source links if available
    if (groundingMetadata?.groundingChunks?.length && groundingMetadata.groundingChunks.length > 0) {
      const sources = groundingMetadata.groundingChunks
        .filter((c) => c.web?.uri)
        .map(
          (c, i) =>
            `[${i + 1}] ${c.web!.title ? c.web!.title + ' - ' : ''}${c.web!.uri}`
        )
        .join('\n');
      if (sources) {
        result += `\n\nSources:\n${sources}`;
      }
    }

    if (groundingMetadata?.webSearchQueries?.length && groundingMetadata.webSearchQueries.length > 0) {
      result = `Search queries: ${groundingMetadata.webSearchQueries.join(', ')}\n\n${result}`;
    }

    return { content: [{ text: result || 'No results found.' }] };
  } catch (e) {
    return { content: [{ text: `Google Search Error: ${(e as Error).message}` }] };
  }
}
