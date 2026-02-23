/**
 * Error Utilities - User-friendly error messages from API responses
 * @module background/utils/errors
 */

/**
 * Get user-friendly error messages from API responses
 * @param response - Fetch response object
 * @param prefix - Error prefix (default: 'API Error')
 * @returns User-friendly error message
 */
export async function getFriendlyErrorMessage(
  response: Response,
  prefix: string = 'API Error'
): Promise<string> {
  const status = response.status;
  let details = '';

  try {
    const errorText = await response.text();
    try {
      const errJson = JSON.parse(errorText) as Record<string, unknown>;
      // Try common error pathways:
      // OpenAI/Anthropic: errJson.error.message
      // Gemini: errJson.error.message OR errJson[0].error.message
      // Generic: errJson.message
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
