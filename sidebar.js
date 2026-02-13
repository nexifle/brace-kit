// AI Sidebar — main application logic
import { renderMarkdown, StreamRenderer } from './markdown.js';
import { PROVIDER_PRESETS } from './providers.js';

// ==================== STATE ====================
const state = {
  messages: [], // { role, content, toolCalls?, toolResults? }
  isStreaming: false,
  currentRequestId: null,
  pageContext: null, // { pageTitle, pageUrl, content, metaDescription }
  selectedText: null, // { selectedText, pageTitle, pageUrl }
  providerConfig: {
    providerId: 'openai',
    apiKey: '',
    apiUrl: '',
    model: '',
    format: '',
    systemPrompt: 'You are a helpful AI assistant. When the user shares page content or selected text, help them understand and work with it. Be concise and helpful.',
  },
  customProviders: [], // { id, name, apiUrl, apiKey, model, format }
  mcpServers: [], // { id, name, url }
  showCustomModel: false,
  abortController: null,
};

// ==================== DOM REFS ====================
const $ = (sel) => document.querySelector(sel);
const refs = {};

function initRefs() {
  refs.messages = $('#messages');
  refs.welcome = $('#welcome');
  refs.chatInput = $('#chat-input');
  refs.btnSend = $('#btn-send');
  refs.btnStop = $('#btn-stop');
  refs.btnSettings = $('#btn-settings');
  refs.btnBack = $('#btn-back');
  refs.btnNewChat = $('#btn-new-chat');
  refs.btnAttach = $('#btn-attach');
  refs.btnReadPage = $('#btn-read-page');
  refs.btnGrabSelection = $('#btn-grab-selection');
  refs.chatView = $('#chat-view');
  refs.settingsView = $('#settings-view');
  refs.contextBanner = $('#context-banner');
  refs.contextLabel = $('#context-label');
  refs.btnClearContext = $('#btn-clear-context');
  refs.selectionPreview = $('#selection-preview');
  refs.selectionText = $('#selection-text');
  refs.btnClearSelection = $('#btn-clear-selection');
  refs.providerSelect = $('#provider-select');
  refs.apiKey = $('#api-key');
  refs.apiUrl = $('#api-url');
  refs.modelSelect = $('#model-select');
  refs.modelCustom = $('#model-custom');
  refs.btnToggleModel = $('#btn-toggle-model');
  refs.btnToggleKey = $('#btn-toggle-key');
  refs.apiFormat = $('#api-format');
  refs.formatGroup = $('#format-group');
  refs.systemPrompt = $('#system-prompt');
  refs.providerLabel = $('#provider-label');
  refs.modelLabel = $('#model-label');
  refs.customProvidersList = $('#custom-providers-list');
  refs.cpName = $('#cp-name');
  refs.cpUrl = $('#cp-url');
  refs.cpFormat = $('#cp-format');
  refs.btnAddCustomProvider = $('#btn-add-custom-provider');
  refs.mcpServersList = $('#mcp-servers-list');
  refs.mcpName = $('#mcp-name');
  refs.mcpUrl = $('#mcp-url');
  refs.btnAddMcp = $('#btn-add-mcp');
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
  initRefs();
  await loadSettings();
  populateProviderDropdown();
  bindEvents();
  updateProviderUI();
  updateStatusBadges();
  renderCustomProviders();
  renderMCPServers();
});

// ==================== SETTINGS PERSISTENCE ====================
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get([
      'providerConfig',
      'customProviders',
      'mcpServers',
      'chatHistory',
    ]);
    if (data.providerConfig) {
      state.providerConfig = { ...state.providerConfig, ...data.providerConfig };
    }
    if (data.customProviders) {
      state.customProviders = data.customProviders;
    }
    if (data.mcpServers) {
      state.mcpServers = data.mcpServers;
    }
    if (data.chatHistory) {
      state.messages = data.chatHistory;
      renderAllMessages();
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({
      providerConfig: state.providerConfig,
      customProviders: state.customProviders,
      mcpServers: state.mcpServers,
    });
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

async function saveChatHistory() {
  try {
    await chrome.storage.local.set({ chatHistory: state.messages });
  } catch (e) {
    console.warn('Failed to save chat history:', e);
  }
}

// ==================== EVENT BINDING ====================
function bindEvents() {
  // Send message
  refs.btnSend.addEventListener('click', sendMessage);
  refs.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  refs.chatInput.addEventListener('input', () => {
    refs.chatInput.style.height = 'auto';
    refs.chatInput.style.height = Math.min(refs.chatInput.scrollHeight, 120) + 'px';
  });

  // Stop streaming
  refs.btnStop.addEventListener('click', stopStreaming);

  // Navigation
  refs.btnSettings.addEventListener('click', () => showView('settings'));
  refs.btnBack.addEventListener('click', () => showView('chat'));
  refs.btnNewChat.addEventListener('click', newChat);

  // Page context
  refs.btnAttach.addEventListener('click', attachPageContext);
  refs.btnReadPage.addEventListener('click', attachPageContext);
  refs.btnGrabSelection.addEventListener('click', grabSelection);
  refs.btnClearContext.addEventListener('click', clearPageContext);
  refs.btnClearSelection.addEventListener('click', clearSelection);

  // Settings changes
  refs.providerSelect.addEventListener('change', onProviderChange);
  refs.apiKey.addEventListener('change', onSettingsChange);
  refs.apiUrl.addEventListener('change', onSettingsChange);
  refs.modelSelect.addEventListener('change', onSettingsChange);
  refs.modelCustom.addEventListener('change', onSettingsChange);
  refs.apiFormat.addEventListener('change', onSettingsChange);
  refs.systemPrompt.addEventListener('change', onSettingsChange);
  refs.btnToggleKey.addEventListener('click', () => {
    refs.apiKey.type = refs.apiKey.type === 'password' ? 'text' : 'password';
  });
  refs.btnToggleModel.addEventListener('click', () => {
    state.showCustomModel = !state.showCustomModel;
    refs.modelSelect.classList.toggle('hidden', state.showCustomModel);
    refs.modelCustom.classList.toggle('hidden', !state.showCustomModel);
  });

  // Custom providers
  refs.btnAddCustomProvider.addEventListener('click', addCustomProvider);

  // MCP
  refs.btnAddMcp.addEventListener('click', addMCPServer);

  // Listen for streaming chunks from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.requestId !== state.currentRequestId) return;

    switch (message.type) {
      case 'CHAT_STREAM_CHUNK':
        appendStreamChunk(message.content);
        break;
      case 'CHAT_STREAM_DONE':
        finishStream(message.fullContent, message.toolCalls);
        break;
      case 'CHAT_STREAM_ERROR':
        handleStreamError(message.error);
        break;
    }
  });

  // Listen for text selection from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SELECTION_UPDATED') {
      setSelectedText(message.data);
    }
    if (message.type === 'CONTEXT_MENU_SELECTION') {
      setSelectedText(message.data);
    }
  });
}

// ==================== VIEW SWITCHING ====================
function showView(view) {
  if (view === 'settings') {
    refs.settingsView.classList.remove('hidden');
    updateProviderUI();
  } else {
    refs.settingsView.classList.add('hidden');
  }
}

// ==================== PROVIDER CONFIG ====================
// Look up provider — check built-in presets first, then custom providers
function getProvider(providerId) {
  if (PROVIDER_PRESETS[providerId]) return PROVIDER_PRESETS[providerId];
  const custom = state.customProviders.find((cp) => cp.id === providerId);
  if (custom) return custom;
  return PROVIDER_PRESETS.openai; // fallback
}

function isCustomProvider(providerId) {
  return state.customProviders.some((cp) => cp.id === providerId);
}

function populateProviderDropdown() {
  refs.providerSelect.innerHTML = '';
  // Built-in providers (exclude 'custom' — we manage those dynamically)
  for (const [id, preset] of Object.entries(PROVIDER_PRESETS)) {
    if (id === 'custom') continue;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = preset.name;
    refs.providerSelect.appendChild(opt);
  }
  // Custom providers
  if (state.customProviders.length > 0) {
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '── Custom ──';
    refs.providerSelect.appendChild(sep);
    for (const cp of state.customProviders) {
      const opt = document.createElement('option');
      opt.value = cp.id;
      opt.textContent = cp.name;
      refs.providerSelect.appendChild(opt);
    }
  }
  refs.providerSelect.value = state.providerConfig.providerId;
}

function onProviderChange() {
  const providerId = refs.providerSelect.value;
  const provider = getProvider(providerId);

  state.providerConfig.providerId = providerId;
  state.providerConfig.apiUrl = provider.apiUrl;
  state.providerConfig.format = provider.format;

  // For custom providers, also load the stored API key and model
  if (isCustomProvider(providerId)) {
    state.providerConfig.apiKey = provider.apiKey || '';
    state.providerConfig.model = provider.model || provider.defaultModel || '';
  }

  updateProviderUI();
  saveSettings();
  updateStatusBadges();
}

function onSettingsChange() {
  state.providerConfig.apiKey = refs.apiKey.value;
  state.providerConfig.apiUrl = refs.apiUrl.value;
  state.providerConfig.format = refs.apiFormat.value;
  state.providerConfig.systemPrompt = refs.systemPrompt.value;

  if (state.showCustomModel) {
    state.providerConfig.model = refs.modelCustom.value;
  } else {
    state.providerConfig.model = refs.modelSelect.value;
  }

  // If the active provider is custom, sync back to the custom provider entry
  const providerId = state.providerConfig.providerId;
  if (isCustomProvider(providerId)) {
    const cp = state.customProviders.find((c) => c.id === providerId);
    if (cp) {
      cp.apiKey = state.providerConfig.apiKey;
      cp.apiUrl = state.providerConfig.apiUrl;
      cp.model = state.providerConfig.model;
      cp.format = state.providerConfig.format;
    }
  }

  saveSettings();
  updateStatusBadges();
}

function updateProviderUI() {
  const { providerId, apiKey, apiUrl, model, format, systemPrompt } = state.providerConfig;
  const provider = getProvider(providerId);

  refs.providerSelect.value = providerId;
  refs.apiKey.value = apiKey || '';
  refs.apiUrl.value = apiUrl || provider.apiUrl;
  refs.apiUrl.placeholder = provider.apiUrl || 'https://...';
  refs.apiFormat.value = format || provider.format;
  refs.systemPrompt.value = systemPrompt || '';

  // Show format selector for custom providers
  const showFormat = isCustomProvider(providerId);
  refs.formatGroup.style.display = showFormat ? 'block' : 'none';

  // Populate model select
  refs.modelSelect.innerHTML = '';
  const models = provider.models || [];
  if (models.length > 0) {
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      refs.modelSelect.appendChild(opt);
    }
    refs.modelSelect.value = model || provider.defaultModel;
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Enter custom model';
    refs.modelSelect.appendChild(opt);
    state.showCustomModel = true;
    refs.modelSelect.classList.add('hidden');
    refs.modelCustom.classList.remove('hidden');
  }

  if (!state.showCustomModel) {
    refs.modelCustom.classList.add('hidden');
    refs.modelSelect.classList.remove('hidden');
  }
  refs.modelCustom.value = model || '';
}

function updateStatusBadges() {
  const provider = getProvider(state.providerConfig.providerId);
  const providerName = provider?.name || 'Custom';
  const model =
    state.providerConfig.model ||
    provider?.defaultModel ||
    '';

  refs.providerLabel.textContent = state.providerConfig.apiKey
    ? providerName
    : 'No provider configured';
  refs.modelLabel.textContent = model;
}

// ==================== CUSTOM PROVIDERS ====================
function addCustomProvider() {
  const name = refs.cpName.value.trim();
  const apiUrl = refs.cpUrl.value.trim();
  const format = refs.cpFormat.value;

  if (!name) return;

  const id = 'custom_' + Date.now();
  state.customProviders.push({
    id,
    name,
    apiUrl,
    apiKey: '',
    model: '',
    defaultModel: '',
    format,
    models: [],
  });

  // Clear form
  refs.cpName.value = '';
  refs.cpUrl.value = '';
  refs.cpFormat.value = 'openai';

  populateProviderDropdown();
  renderCustomProviders();
  saveSettings();
}

function removeCustomProvider(id) {
  state.customProviders = state.customProviders.filter((cp) => cp.id !== id);

  // If the removed provider was active, switch to openai
  if (state.providerConfig.providerId === id) {
    state.providerConfig.providerId = 'openai';
    const fallback = PROVIDER_PRESETS.openai;
    state.providerConfig.apiUrl = fallback.apiUrl;
    state.providerConfig.format = fallback.format;
    state.providerConfig.apiKey = '';
    state.providerConfig.model = '';
    updateProviderUI();
    updateStatusBadges();
  }

  populateProviderDropdown();
  renderCustomProviders();
  saveSettings();
}

function renderCustomProviders() {
  const container = refs.customProvidersList;
  container.innerHTML = '';

  if (state.customProviders.length === 0) {
    container.innerHTML = '<p class="empty-text">No custom providers added yet.</p>';
    return;
  }

  for (const cp of state.customProviders) {
    const el = document.createElement('div');
    el.className = 'custom-provider-item';

    const formatLabel = { openai: 'OpenAI', anthropic: 'Anthropic', gemini: 'Gemini' }[cp.format] || cp.format;

    el.innerHTML = `
      <div class="cp-info">
        <div class="cp-name">${cp.name}</div>
        <div class="cp-details">${formatLabel}${cp.model ? ' · ' + cp.model : ''}${cp.apiUrl ? ' · ' + new URL(cp.apiUrl).hostname : ''}</div>
      </div>
      <button class="cp-delete" title="Remove provider">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    el.querySelector('.cp-delete').addEventListener('click', () => removeCustomProvider(cp.id));
    container.appendChild(el);
  }
}

// ==================== PAGE CONTEXT ====================
async function attachPageContext() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTENT' });
    if (response?.error) {
      addMessage('error', `Failed to read page: ${response.error}`);
      return;
    }
    state.pageContext = response;
    refs.contextBanner.classList.remove('hidden');
    refs.contextLabel.textContent = `📄 ${response.pageTitle || 'Page attached'}`;
    refs.btnAttach.classList.add('active');
  } catch (e) {
    addMessage('error', `Failed to read page: ${e.message}`);
  }
}

function clearPageContext() {
  state.pageContext = null;
  refs.contextBanner.classList.add('hidden');
  refs.btnAttach.classList.remove('active');
}

async function grabSelection() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SELECTED_TEXT' });
    if (response?.selectedText) {
      setSelectedText(response);
    } else {
      addMessage('error', 'No text selected on the page. Highlight some text first.');
    }
  } catch (e) {
    addMessage('error', `Failed to grab selection: ${e.message}`);
  }
}

function setSelectedText(data) {
  if (!data?.selectedText) return;
  state.selectedText = data;
  refs.selectionPreview.classList.remove('hidden');
  refs.selectionText.textContent =
    data.selectedText.length > 80
      ? data.selectedText.substring(0, 80) + '...'
      : data.selectedText;
}

function clearSelection() {
  state.selectedText = null;
  refs.selectionPreview.classList.add('hidden');
  refs.selectionText.textContent = '';
}

// ==================== CHAT ====================
function newChat() {
  state.messages = [];
  state.isStreaming = false;
  state.currentRequestId = null;
  clearPageContext();
  clearSelection();
  refs.messages.innerHTML = '';
  refs.welcome.classList.remove('hidden');
  saveChatHistory();
}

async function sendMessage() {
  const text = refs.chatInput.value.trim();
  if (!text || state.isStreaming) return;

  // Hide welcome
  refs.welcome.classList.add('hidden');

  // Build user message with context
  let userContent = text;

  // Attach page context if available
  if (state.pageContext) {
    userContent = `[Page Context]\nTitle: ${state.pageContext.pageTitle}\nURL: ${state.pageContext.pageUrl}\n${state.pageContext.metaDescription ? `Description: ${state.pageContext.metaDescription}\n` : ''}\nContent:\n${state.pageContext.content}\n\n[User Message]\n${text}`;
  }

  // Attach selected text if available
  if (state.selectedText) {
    const selPrefix = state.pageContext
      ? '' // already has page context
      : `[From: ${state.selectedText.pageTitle}]\n`;
    userContent = `${selPrefix}[Selected Text]\n"${state.selectedText.selectedText}"\n\n[User Message]\n${text}`;
  }

  // Add to state
  state.messages.push({ role: 'user', content: userContent, displayContent: text });
  addMessage('user', text);

  // Clear input & selection
  refs.chatInput.value = '';
  refs.chatInput.style.height = 'auto';
  clearSelection();

  // Build messages for API
  const apiMessages = buildAPIMessages();

  // Get MCP tools
  let tools = [];
  try {
    const mcpRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
    if (mcpRes?.tools) tools = mcpRes.tools;
  } catch (e) {
    // no MCP tools
  }

  // Start streaming
  state.isStreaming = true;
  state.currentRequestId = `req_${Date.now()}`;
  setStreamingUI(true);

  // Create assistant message placeholder
  const streamEl = addMessage('assistant', '', true);        

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_REQUEST',
      messages: apiMessages,
      providerConfig: state.providerConfig,
      tools: tools,
      requestId: state.currentRequestId,
    });

    if (response?.error) {
      removeStreamingMessage();
      addMessage('error', response.error);
      setStreamingUI(false);
      state.isStreaming = false;
    }
  } catch (e) {
    removeStreamingMessage();
    addMessage('error', `Request failed: ${e.message}`);
    setStreamingUI(false);
    state.isStreaming = false;
  }
}

function buildAPIMessages() {
  const msgs = [];

  // System prompt
  if (state.providerConfig.systemPrompt) {
    msgs.push({ role: 'system', content: state.providerConfig.systemPrompt });
  }

  // Conversation history
  for (const msg of state.messages) {
    msgs.push({ role: msg.role, content: msg.content });
  }

  return msgs;
}

// ==================== STREAMING ====================
let currentStreamRenderer = null;

function appendStreamChunk(content) {
  if (!currentStreamRenderer) return;
  currentStreamRenderer.append(content);
  scrollToBottom();
}

function finishStream(fullContent, toolCalls) {
  // Update last message in state
  state.messages.push({ role: 'assistant', content: fullContent || '' });

  if (currentStreamRenderer) {
    // Final render
    const bubble = currentStreamRenderer.element;
    bubble.innerHTML = renderMarkdown(fullContent || '');
  }

  currentStreamRenderer = null;
  setStreamingUI(false);
  state.isStreaming = false;
  saveChatHistory();

  // Add copy button and wire code block copy buttons
  addMessageActionsToLast(fullContent || '');

  // Handle tool calls
  if (toolCalls && toolCalls.length > 0) {
    handleToolCalls(toolCalls, fullContent);
  }

  scrollToBottom();
}

function handleStreamError(error) {
  removeStreamingMessage();
  addMessage('error', error);
  setStreamingUI(false);
  state.isStreaming = false;
  currentStreamRenderer = null;
}

function stopStreaming() {
  if (state.abortController) {
    state.abortController.abort();
  }
  // Also send stop signal
  chrome.runtime.sendMessage({
    type: 'STOP_STREAM',
    requestId: state.currentRequestId,
  });
  setStreamingUI(false);
  state.isStreaming = false;
  currentStreamRenderer = null;
}

// ==================== TOOL CALLS ====================
async function handleToolCalls(toolCalls, assistantContent) {
  for (const tc of toolCalls) {
    if (!tc.name) continue;

    let args = {};
    try {
      args = JSON.parse(tc.arguments || '{}');
    } catch (e) {
      args = {};
    }

    // Show tool call in UI
    addToolMessage(tc.name, args, 'calling');

    // Execute via MCP
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MCP_CALL_TOOL',
        name: tc.name,
        arguments: args,
      });

      const resultText =
        result?.content?.map((c) => c.text || JSON.stringify(c)).join('\n') ||
        JSON.stringify(result);

      addToolMessage(tc.name, args, 'result', resultText);

      // Add tool result to messages and continue
      state.messages.push({
        role: 'user',
        content: `[Tool Result: ${tc.name}]\n${resultText}`,
      });
    } catch (e) {
      addToolMessage(tc.name, args, 'error', e.message);
    }
  }
}

// ==================== MESSAGE RENDERING ====================
function addMessage(role, content, isStreaming = false) {
  const container = refs.messages;

  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;

  const roleLabel = document.createElement('div');
  roleLabel.className = 'message-role';
  roleLabel.textContent = role === 'user' ? 'You' : role === 'error' ? 'Error' : 'AI';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (isStreaming) {
    // Add typing indicator
    bubble.innerHTML =
      '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    currentStreamRenderer = new StreamRenderer(bubble);
  } else {
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(content);
    } else {
      bubble.textContent = content;
    }
  }

  msgEl.appendChild(roleLabel);
  msgEl.appendChild(bubble);

  // Add copy button for assistant messages
  if (role === 'assistant' && !isStreaming) {
    const actions = createMessageActions(content);
    msgEl.appendChild(actions);
  }

  container.appendChild(msgEl);
  // Wire up code block copy buttons
  wireCodeCopyButtons(msgEl);

  scrollToBottom();
  return bubble;
}

function createMessageActions(markdownContent) {
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-action-btn';
  copyBtn.title = 'Copy response';
  copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy</span>`;
  copyBtn.addEventListener('click', () => {
    copyToClipboard(markdownContent, copyBtn);
  });

  actions.appendChild(copyBtn);
  return actions;
}

function wireCodeCopyButtons(container) {
  container.querySelectorAll('.copy-code-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const code = btn.getAttribute('data-code')
        ?.replace(/&#10;/g, '\n')
        .replace(/&quot;/g, '"') || '';
      copyToClipboard(code, btn);
    });
  });
}

function addMessageActionsToLast(markdownContent) {
  // Add actions to the last assistant message (after streaming completes)
  const messages = refs.messages.querySelectorAll('.message.assistant');
  const last = messages[messages.length - 1];
  if (last && !last.querySelector('.message-actions')) {
    const actions = createMessageActions(markdownContent);
    last.appendChild(actions);
    wireCodeCopyButtons(last);
  }
}

async function copyToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.innerHTML;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Copied!</span>`;
    btn.classList.add('copied');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove('copied');
    }, 1500);
  } catch (e) {
    console.warn('Copy failed:', e);
  }
}

function addToolMessage(toolName, args, status, result) {
  const container = refs.messages;
  const msgEl = document.createElement('div');
  msgEl.className = 'message tool';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const header = document.createElement('div');
  header.className = 'tool-header';
  header.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
    ${status === 'calling' ? '⏳' : status === 'error' ? '❌' : '✅'} ${toolName}
  `;

  bubble.appendChild(header);

  if (args && Object.keys(args).length > 0) {
    const argsEl = document.createElement('div');
    argsEl.className = 'tool-args';
    argsEl.textContent = JSON.stringify(args, null, 2);
    bubble.appendChild(argsEl);
  }

  if (result) {
    const resultEl = document.createElement('div');
    resultEl.className = 'tool-args';
    resultEl.style.marginTop = '6px';
    resultEl.style.borderLeft = `2px solid ${status === 'error' ? 'var(--danger)' : 'var(--success)'}`;
    resultEl.textContent = result;
    bubble.appendChild(resultEl);
  }

  msgEl.appendChild(bubble);
  container.appendChild(msgEl);
  scrollToBottom();
}

function removeStreamingMessage() {
  const messages = refs.messages.querySelectorAll('.message.assistant');
  const last = messages[messages.length - 1];
  if (last) {
    const bubble = last.querySelector('.message-bubble');
    if (bubble?.querySelector('.typing-indicator')) {
      last.remove();
    }
  }
}

function renderAllMessages() {
  refs.messages.innerHTML = '';
  if (state.messages.length === 0) {
    refs.welcome.classList.remove('hidden');
    return;
  }
  refs.welcome.classList.add('hidden');
  for (const msg of state.messages) {
    addMessage(msg.role, msg.displayContent || msg.content);
  }
}

// ==================== UI HELPERS ====================
function setStreamingUI(streaming) {
  refs.btnSend.classList.toggle('hidden', streaming);
  refs.btnStop.classList.toggle('hidden', !streaming);
  refs.chatInput.disabled = streaming;
  if (!streaming) {
    refs.chatInput.focus();
  }
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    refs.messages.scrollTop = refs.messages.scrollHeight;
  });
}

// ==================== MCP MANAGEMENT ====================
async function addMCPServer() {
  const name = refs.mcpName.value.trim();
  const url = refs.mcpUrl.value.trim();
  if (!name || !url) return;

  const config = {
    id: `mcp_${Date.now()}`,
    name,
    url,
  };

  refs.btnAddMcp.disabled = true;
  refs.btnAddMcp.textContent = 'Connecting...';

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'MCP_CONNECT',
      config,
    });

    if (result.success) {
      config.connected = true;
      config.toolCount = result.tools?.length || 0;
      state.mcpServers.push(config);
      refs.mcpName.value = '';
      refs.mcpUrl.value = '';
      saveSettings();
      renderMCPServers();
    } else {
      alert(`Failed to connect: ${result.error || 'Unknown error'}`);
    }
  } catch (e) {
    alert(`Connection error: ${e.message}`);
  }

  refs.btnAddMcp.disabled = false;
  refs.btnAddMcp.textContent = 'Connect Server';
}

function removeMCPServer(id) {
  chrome.runtime.sendMessage({ type: 'MCP_DISCONNECT', serverId: id });
  state.mcpServers = state.mcpServers.filter((s) => s.id !== id);
  saveSettings();
  renderMCPServers();
}

function renderMCPServers() {
  refs.mcpServersList.innerHTML = '';
  for (const server of state.mcpServers) {
    const item = document.createElement('div');
    item.className = 'mcp-server-item';
    item.innerHTML = `
      <div class="mcp-server-info">
        <span class="mcp-server-name">${escapeHtml(server.name)}</span>
        <span class="mcp-server-url">${escapeHtml(server.url)}</span>
        ${server.toolCount ? `<span class="mcp-server-tools">${server.toolCount} tools available</span>` : ''}
      </div>
      <div class="mcp-server-status">
        <span class="status-dot ${server.connected ? 'connected' : 'disconnected'}"></span>
        <button class="btn-disconnect" data-id="${server.id}" title="Disconnect">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
    item.querySelector('.btn-disconnect').addEventListener('click', () => {
      removeMCPServer(server.id);
    });
    refs.mcpServersList.appendChild(item);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
