// Background service worker for AI Sidebar extension
// Handles: sidebar panel, message routing, LLM API calls, MCP orchestration

import { PROVIDER_PRESETS, formatRequest, parseStream } from './providers.js';
import { MCPManager } from './mcp.js';

const mcpManager = new MCPManager();

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Set side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Add context menu for sending selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'send-to-ai-sidebar',
    title: 'Send to AI Sidebar',
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

    case 'GET_PAGE_CONTENT':
      forwardToContentScript(message, sendResponse);
      return true;

    case 'GET_SELECTED_TEXT':
      forwardToContentScript(message, sendResponse);
      return true;

    case 'MCP_CONNECT':
      handleMCPConnect(message, sendResponse);
      return true;

    case 'MCP_DISCONNECT':
      mcpManager.removeServer(message.serverId);
      sendResponse({ success: true });
      return true;

    case 'MCP_LIST_TOOLS':
      sendResponse({ tools: mcpManager.getAllTools() });
      return true;

    case 'MCP_CALL_TOOL':
      handleMCPToolCall(message, sendResponse);
      return true;

    case 'MEMORY_EXTRACT':
      handleMemoryExtract(message, sendResponse);
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

async function handleChatRequest(message, sendResponse) {
  const { messages, providerConfig, tools } = message;

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
    const { url, options } = formatRequest(provider, messages, tools || []);
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg;
      try {
        const errJson = JSON.parse(errorText);
        errorMsg = errJson.error?.message || errJson.message || errorText;
      } catch {
        errorMsg = errorText;
      }
      sendResponse({ error: `API Error (${response.status}): ${errorMsg}` });
      return;
    }

    // Stream response back to sidebar via ports
    // Since sendResponse can only be called once, we use a different approach:
    // We'll collect chunks via a port-based streaming mechanism
    // But for simplicity in MV3, we'll use runtime messaging with chunked responses

    const chunks = [];
    const toolCalls = [];
    let currentToolCall = null;

    for await (const chunk of parseStream(provider, response)) {
      if (chunk.type === 'text') {
        chunks.push(chunk.content);
        // Send incremental update
        chrome.runtime.sendMessage({
          type: 'CHAT_STREAM_CHUNK',
          content: chunk.content,
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
      }
    }

    // If there are accumulated tool_call argument fragments from OpenAI format
    // Merge them by index
    const mergedToolCalls = mergeToolCalls(toolCalls);

    // Signal stream complete
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM_DONE',
      fullContent: chunks.join(''),
      toolCalls: mergedToolCalls.length > 0 ? mergedToolCalls : undefined,
      requestId: message.requestId,
    });

    sendResponse({ started: true });
  } catch (e) {
    sendResponse({ error: e.message });
    chrome.runtime.sendMessage({
      type: 'CHAT_STREAM_ERROR',
      error: e.message,
      requestId: message.requestId,
    });
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
      sendResponse({ error: `API Error ${response.status}` });
      return;
    }

    const data = await response.json();

    // Extract text content based on format
    let text = '';
    if (provider.format === 'openai') {
      text = data.choices?.[0]?.message?.content || '';
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
