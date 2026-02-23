// Background service worker for BraceKit extension
// Handles: sidebar panel, message routing, LLM API calls, MCP orchestration

import { PROVIDER_PRESETS, formatRequest, parseStream, parseXAIImageResponse, fetchModels, GEMINI_NO_TOOLS_MODELS, GEMINI_SEARCH_ONLY_MODELS, XAI_IMAGE_MODELS } from './src/providers.ts';
import { MCPManager } from './mcp.js';
import { migrateOldConversations } from './src/utils/conversationDB.ts';

const mcpManager = new MCPManager();

// Track active streaming requests for cancellation
const activeRequests = new Map(); // requestId -> { abortController, aborted }

// Restore MCP connections on startup
(async () => {
  const { mcpServers } = await chrome.storage.local.get('mcpServers');
  if (mcpServers?.length > 0) {
    console.log('[Background] Restoring MCP servers:', mcpServers.length);
    for (const server of mcpServers) {
      if (server.enabled !== false) {
        try {
          await mcpManager.addServer(server);
          console.log('[Background] Restored:', server.name);
        } catch (e) {
          console.log('[Background] Failed to restore:', server.name, e);
        }
      }
    }
  }
})();

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Add context menu for sending selected text
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }

  // Handle data migrations
  if (details.reason === 'install' || details.reason === 'update') {
    migrateOldConversations().catch(e => console.error('[Background] Migration error:', e));
  }

  chrome.contextMenus.create({
    id: 'send-to-ai-sidebar',
    title: 'Send to BraceKit',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'send-to-ai-sidebar') {
    // Open sidebar and send selection
    chrome.sidePanel.open({ tabId: tab.id });

    // Small delay to let sidebar load
    setTimeout(() => {
      chrome.runtime.sendMessage({
        type: 'CONTEXT_MENU_SELECTION',
        data: {
          selectedText: info.selectionText,
          pageTitle: tab.title,
          pageUrl: tab.url,
        },
      });
    }, 500);
  }
});

// Handle messages from sidebar and content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'CHAT_REQUEST':
      handleChatRequest(message, sendResponse);
      return true; // async

    case 'STOP_STREAM':
      handleStopStream(message, sendResponse);
      return false;

    case 'GET_PAGE_CONTENT':
      forwardToContentScript(message, sendResponse);
      return true;

    case 'GET_SELECTED_TEXT':
      forwardToContentScript(message, sendResponse);
      return true;

    case 'MCP_CONNECT':
      console.log('[Background] MCP_CONNECT received:', message.config);
      handleMCPConnect(message, sendResponse);
      return true;

    case 'MCP_DISCONNECT':
      mcpManager.removeServer(message.serverId);
      sendResponse({ success: true });
      return false;

    case 'MCP_LIST_TOOLS':
      try {
        const allTools = mcpManager.getAllTools();
        console.log('[Background] MCP_LIST_TOOLS - clients:', mcpManager.clients.size, 'tools:', allTools);
        sendResponse({ tools: allTools });
      } catch (e) {
        sendResponse({ tools: [], error: e.message });
      }
      return false;

    case 'MCP_CALL_TOOL':
      handleMCPToolCall(message, sendResponse);
      return true;

    case 'GOOGLE_SEARCH_TOOL':
      handleGoogleSearchTool(message, sendResponse);
      return true;

    case 'MEMORY_EXTRACT':
      handleMemoryExtract(message, sendResponse);
      return true;

    case 'TITLE_GENERATE':
      handleTitleGenerate(message, sendResponse);
      return true;

    case 'FETCH_MODELS':
      handleFetchModels(message, sendResponse);
      return true;

    case 'TEXT_SELECTED':
      // Relay text selection from content script to sidebar
      chrome.runtime.sendMessage({
        type: 'SELECTION_UPDATED',
        data: message.data,
      });
      return false;
  }
});

async function forwardToContentScript(message, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ error: 'No active tab' });
      return;
    }
    const response = await chrome.tabs.sendMessage(tab.id, message);
    sendResponse(response);
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

function handleStopStream(message, sendResponse) {
  const { requestId } = message;
  const activeRequest = activeRequests.get(requestId);

  if (activeRequest) {
    console.log('[Background] Stopping stream for requestId:', requestId);
    activeRequest.aborted = true;
    activeRequest.abortController?.abort();
    activeRequests.delete(requestId);
    sendResponse({ success: true });
  } else {
    console.log('[Background] No active request found for requestId:', requestId);
    sendResponse({ success: false, error: 'No active request' });
  }
}

// Helper to get user-friendly error messages from API responses
async function getFriendlyErrorMessage(response, prefix = 'API Error') {
  const status = response.status;
  let details = '';
  
  try {
    const errorText = await response.text();
    try {
      const errJson = JSON.parse(errorText);
      // Try common error pathways:
      // OpenAI/Anthropic: errJson.error.message
      // Gemini: errJson.error.message OR errJson[0].error.message
      // Generic: errJson.message
      details = 
        errJson.error?.message || 
        errJson.message || 
        (typeof errJson.error === 'string' ? errJson.error : null) ||
        (Array.isArray(errJson) ? errJson[0]?.error?.message : null) ||
        errorText;
    } catch {
      details = errorText;
    }
  } catch {
    details = response.statusText;
  }

  if (!details || details.length > 500) details = response.statusText || 'Unknown error';

  let statusPrefix = `${prefix} (${status})`;
  if (status === 401) statusPrefix = "Invalid API Key (401)";
  else if (status === 403) statusPrefix = "Permission Denied (403)";
  else if (status === 404) statusPrefix = "Not Found (404)";
  else if (status === 429) statusPrefix = "Rate Limit Exceeded (429)";
  else if (status >= 500) statusPrefix = "Provider Server Error (" + status + ")";

  return `${statusPrefix}: ${details}`;
}

async function handleChatRequest(message, sendResponse) {
  const { messages, providerConfig, tools, options, requestId } = message;
  console.log('[handleChatRequest] options:', options);

  // Create AbortController for this request
  const abortController = new AbortController();
  const activeRequest = { abortController, aborted: false };
  if (requestId) {
    activeRequests.set(requestId, activeRequest);
  }

  try {
    // Merge provider preset with user config
    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider = {
      ...preset,
      ...providerConfig,
      format: providerConfig.format || preset.format,
      apiUrl: providerConfig.apiUrl || preset.apiUrl,
    };

    if (!provider.apiKey) {
      sendResponse({ error: 'API key is required. Configure it in Settings.' });
      return;
    }

    // Format and send request
    const { url, options: fetchOptions } = formatRequest(provider, messages, tools || [], options || {});

    // Add abort signal to fetch options
    fetchOptions.signal = abortController.signal;

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response);
      sendResponse({ error });
      return;
    }

    // If non-streaming, return full response directly
    if (options?.stream === false) {
      const data = await response.json();
      let text = '';
      if (provider.format === 'openai') {
        const message = data.choices?.[0]?.message;
        text = message?.content || '';
        const reasoning = message?.reasoning_content || '';
        sendResponse({ content: text, reasoning_content: reasoning });
      } else if (provider.format === 'anthropic') {
        text = data.content?.map(c => c.text).filter(Boolean).join('') || '';
        sendResponse({ content: text });
      } else if (provider.format === 'gemini') {
        text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
        sendResponse({ content: text });
      }
      // Cleanup for non-streaming
      if (requestId) {
        activeRequests.delete(requestId);
      }
      return;
    }

    // Stream response back to sidebar via ports
    // Since sendResponse can only be called once, we use a different approach:
    // We'll collect chunks via a port-based streaming mechanism
    // But for simplicity in MV3, we'll use runtime messaging with chunked responses

    const chunks = [];
    const reasoningChunks = [];
    const toolCalls = [];
    const images = [];
    let currentToolCall = null;
    let groundingMetadata = null;

    const isXAIImageModel = provider.id === 'xai' && XAI_IMAGE_MODELS.includes(provider.model || '');

    for await (const chunk of (isXAIImageModel ? parseXAIImageResponse(response) : parseStream(provider, response, abortController.signal))) {
      // Check if request was aborted during streaming
      if (activeRequest.aborted) {
        console.log('[handleChatRequest] Request aborted during streaming');
        return;
      }

      if (chunk.type === 'text') {
        chunks.push(chunk.content);
        // Send incremental update
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM_CHUNK',
          content: chunk.content,
          requestId: message.requestId,
        });
      } else if (chunk.type === 'reasoning') {
        // Handle reasoning/thinking content
        console.log('[handleChatRequest] Received reasoning chunk:', chunk.content?.substring(0, 100));
        reasoningChunks.push(chunk.content);
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM_CHUNK',
          chunkType: 'reasoning',
          content: chunk.content,
          requestId: message.requestId,
        });
      } else if (chunk.type === 'image') {
        images.push({ mimeType: chunk.mimeType, data: chunk.imageData });
      } else if (chunk.type === 'error') {
        // Add error to chunks so it's included in fullContent
        const errorContent = `\n\n⚠️ ${chunk.content}`;
        chunks.push(errorContent);
        // Send error message to be displayed immediately
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM_CHUNK',
          content: errorContent,
          requestId: message.requestId,
        });
      } else if (chunk.type === 'tool_call' || chunk.type === 'tool_call_start') {
        if (chunk.type === 'tool_call_start') {
          currentToolCall = { id: chunk.id, name: chunk.name, arguments: '' };
          toolCalls.push(currentToolCall);
        } else if (chunk.name) {
          currentToolCall = {
            id: chunk.id || `tc_${Date.now()}`,
            name: chunk.name,
            arguments: chunk.arguments || '',
          };
          toolCalls.push(currentToolCall);
        }
      } else if (chunk.type === 'tool_call_delta' && currentToolCall) {
        currentToolCall.arguments += chunk.content;
      } else if (chunk.type === 'grounding_metadata') {
        groundingMetadata = chunk.groundingMetadata;
      }
    }

    // If there are accumulated tool_call argument fragments from OpenAI format
    // Merge them by index
    const mergedToolCalls = mergeToolCalls(toolCalls);

    // Signal stream complete
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM_DONE',
      fullContent: chunks.join(''),
      reasoningContent: reasoningChunks.length > 0 ? reasoningChunks.join('') : undefined,
      toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
      groundingMetadata: groundingMetadata,
      images: images.length > 0 ? images : undefined,
      requestId: message.requestId,
    });

    sendResponse({ started: true });
  } catch (e) {
    // Don't send error if request was aborted
    if (e.name === 'AbortError' || activeRequest.aborted) {
      console.log('[handleChatRequest] Request was aborted');
      sendResponse({ error: 'Request cancelled' });
    } else {
      sendResponse({ error: e.message });
      chrome.runtime.sendMessage({
        type: 'CHAT_STREAM_ERROR',
        error: e.message,
        requestId: message.requestId,
      });
    }
  } finally {
    // Cleanup active request
    if (requestId) {
      activeRequests.delete(requestId);
    }
  }
}

function mergeToolCalls(toolCalls) {
  const merged = new Map();
  for (const tc of toolCalls) {
    if (tc.index !== undefined) {
      const existing = merged.get(tc.index);
      if (existing) {
        if (tc.arguments) existing.arguments += tc.arguments;
        if (tc.name) existing.name = tc.name;
        if (tc.id) existing.id = tc.id;
      } else {
        merged.set(tc.index, { ...tc });
      }
    } else {
      merged.set(tc.id || merged.size, tc);
    }
  }
  return Array.from(merged.values());
}

async function handleMCPConnect(message, sendResponse) {
  try {
    const result = await mcpManager.addServer(message.config);
    sendResponse(result);
  } catch (e) {
    sendResponse({ success: false, error: e.message });
  }
}

async function handleMemoryExtract(message, sendResponse) {
  const { messages, providerConfig } = message;

  try {
    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider = {
      ...preset,
      ...providerConfig,
      format: providerConfig.format || preset.format,
      apiUrl: providerConfig.apiUrl || preset.apiUrl,
    };

    if (!provider.apiKey) {
      sendResponse({ error: 'No API key' });
      return;
    }

    // Build non-streaming request using formatRequest, then override stream: false
    const { url: streamUrl, options } = formatRequest(provider, messages, []);
    const body = JSON.parse(options.body);

    // Override to non-streaming
    let url = streamUrl;
    if (provider.format === 'openai') {
      body.stream = false;
    } else if (provider.format === 'anthropic') {
      body.stream = false;
    } else if (provider.format === 'gemini') {
      // Switch from streamGenerateContent to generateContent
      url = url.replace(':streamGenerateContent', ':generateContent').replace('alt=sse&', '');
    }

    options.body = JSON.stringify(body);
    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response);
      sendResponse({ error });
      return;
    }

    const data = await response.json();

    // Extract text content based on format
    let text = '';
    if (provider.format === 'openai') {
      const message = data.choices?.[0]?.message;
      text = (message?.content || '') + (message?.reasoning_content || '');
    } else if (provider.format === 'anthropic') {
      text = data.content?.map(c => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      text = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    }

    // Parse JSON from response
    try {
      // Try to extract JSON array from the text
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const memories = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      sendResponse({ memories });
    } catch (e) {
      sendResponse({ memories: [] });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function handleMCPToolCall(message, sendResponse) {
  try {
    const { name, arguments: args } = message;

    // Intercept google_search tool - route to Gemini grounding
    if (name === 'google_search') {
      await handleGoogleSearchTool(message, sendResponse);
      return;
    }

    const found = await mcpManager.callTool(name);
    if (!found) {
      sendResponse({ error: `Tool "${name}" not found` });
      return;
    }
    const result = await found.client.callTool(name, args);
    sendResponse(result);
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function handleGoogleSearchTool(message, sendResponse) {
  try {
    const { arguments: args } = message;
    const query = args?.query || args?.q || '';

    if (!query) {
      sendResponse({ content: [{ text: 'Error: query parameter is required' }] });
      return;
    }

    // Load Gemini API key from storage
    const { googleSearchApiKey } = await chrome.storage.local.get('googleSearchApiKey');
    if (!googleSearchApiKey) {
      sendResponse({ content: [{ text: 'Error: Google Search API key not configured. Set it in Settings > Chat.' }] });
      return;
    }

    const geminiApiUrl = 'https://generativelanguage.googleapis.com/v1beta';
    const model = 'gemini-2.5-flash-lite';
    const url = `${geminiApiUrl}/models/${model}:generateContent?key=${googleSearchApiKey}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: query }] }],
      tools: [{ google_search: {} }],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await getFriendlyErrorMessage(response, 'Google Search Error');
      sendResponse({ content: [{ text: error }] });
      return;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    const groundingMetadata = candidate?.groundingMetadata;

    let result = text;

    // Append source links if available
    if (groundingMetadata?.groundingChunks?.length > 0) {
      const sources = groundingMetadata.groundingChunks
        .filter(c => c.web?.uri)
        .map((c, i) => `[${i + 1}] ${c.web.title ? c.web.title + ' - ' : ''}${c.web.uri}`)
        .join('\n');
      if (sources) {
        result += `\n\nSources:\n${sources}`;
      }
    }

    if (groundingMetadata?.webSearchQueries?.length > 0) {
      result = `Search queries: ${groundingMetadata.webSearchQueries.join(', ')}\n\n${result}`;
    }

    sendResponse({ content: [{ text: result || 'No results found.' }] });
  } catch (e) {
    sendResponse({ content: [{ text: `Google Search Error: ${e.message}` }] });
  }
}

async function handleFetchModels(message, sendResponse) {
  const { providerConfig } = message;

  try {
    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider = {
      ...preset,
      ...providerConfig,
      format: providerConfig.format || preset.format,
      apiUrl: providerConfig.apiUrl || preset.apiUrl,
    };

    const result = await fetchModels(provider);
    sendResponse(result);
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function handleTitleGenerate(message, sendResponse) {
  const { messages, providerConfig } = message;

  try {
    const preset = PROVIDER_PRESETS[providerConfig.providerId] || PROVIDER_PRESETS.custom;
    const provider = {
      ...preset,
      ...providerConfig,
      format: providerConfig.format || preset.format,
      apiUrl: providerConfig.apiUrl || preset.apiUrl,
    };

    if (!provider.apiKey) {
      sendResponse({ error: 'No API key' });
      return;
    }

    const { url: streamUrl, options } = formatRequest(provider, messages, []);
    const body = JSON.parse(options.body);

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

    const data = await response.json();

    let title = '';
    if (provider.format === 'openai') {
      const message = data.choices?.[0]?.message;
      title = (message?.content || '') + (message?.reasoning_content || '');
    } else if (provider.format === 'anthropic') {
      title = data.content?.map(c => c.text).filter(Boolean).join('') || '';
    } else if (provider.format === 'gemini') {
      title = data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
    }

    sendResponse({ title: title.trim() });
  } catch (e) {
    sendResponse({ error: e.message });
  }
}
