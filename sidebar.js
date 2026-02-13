// AI Sidebar — main application logic
import { renderMarkdown, StreamRenderer } from './markdown.js';
import { PROVIDER_PRESETS } from './providers.js';

// ==================== STATE ====================
const state = {
  messages: [], // { role, content, toolCalls?, toolResults?, groundingMetadata? }
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
  providerKeys: {}, // { [providerId]: { apiKey, model } }
  customProviders: [], // { id, name, apiUrl, apiKey, model, format }
  mcpServers: [], // { id, name, url }
  showCustomModel: false,
  abortController: null,
  // Multi-conversation
  conversations: [], // [{ id, title, createdAt, updatedAt }]
  activeConversationId: null,
  historyDrawerOpen: false,
  // Memory system
  memories: [], // [{ id, category, content, confidence, source, createdAt, updatedAt }]
  memoryEnabled: true,
  memoryExtractionTimer: null,
  // Gemini-specific options
  enableGoogleSearch: false,
  // Fetched models cache per provider
  fetchedModels: {}, // { [providerId]: { models: [], fetchedAt: timestamp } }
  fetchingModels: false,
};

const MEMORY_CATEGORIES = ['style', 'interests', 'expertise', 'preferences', 'personal'];

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
  refs.btnToggleCpForm = $('#btn-toggle-cp-form');
  refs.cpAddForm = $('#cp-add-form');
  refs.urlRow = $('#url-row');
  refs.mcpServersList = $('#mcp-servers-list');
  refs.mcpName = $('#mcp-name');
  refs.mcpUrl = $('#mcp-url');
  refs.mcpHeaders = $('#mcp-headers');
  refs.btnAddMcp = $('#btn-add-mcp');
  refs.btnToggleMcpForm = $('#btn-toggle-mcp-form');
  refs.mcpAddForm = $('#mcp-add-form');
  refs.btnHistory = $('#btn-history');
  refs.historyDrawer = $('#history-drawer');
  refs.historyList = $('#history-list');
  refs.btnCloseHistory = $('#btn-close-history');
  refs.historyBackdrop = refs.historyDrawer?.querySelector('.history-drawer-backdrop');
  refs.memoryToggle = $('#memory-toggle');
  refs.memoryList = $('#memory-list');
  refs.btnClearMemories = $('#btn-clear-memories');
  refs.geminiOptions = $('#gemini-options');
  refs.googleSearchToggle = $('#google-search-toggle');
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
  reconnectMCPServers();
});

async function reconnectMCPServers() {
  if (state.mcpServers.length === 0) return;

  for (const server of state.mcpServers) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MCP_CONNECT',
        config: server,
      });
      server.connected = result.success;
      server.toolCount = result.tools?.length || 0;
    } catch (e) {
      server.connected = false;
      server.toolCount = 0;
    }
  }

  renderMCPServers();
}

// ==================== SETTINGS PERSISTENCE ====================
async function loadSettings() {
  try {
    const data = await chrome.storage.local.get([
      'providerConfig',
      'providerKeys',
      'customProviders',
      'mcpServers',
      'chatHistory',
      'conversations',
      'activeConversationId',
      'memories',
      'memoryEnabled',
      'enableGoogleSearch',
    ]);
    if (data.providerConfig) {
      state.providerConfig = { ...state.providerConfig, ...data.providerConfig };
    }
    if (data.providerKeys) {
      state.providerKeys = data.providerKeys;
    }
    if (data.customProviders) {
      state.customProviders = data.customProviders;
    }
    if (data.mcpServers) {
      state.mcpServers = data.mcpServers;
    }
    if (data.memories) {
      state.memories = data.memories;
    }
    if (data.memoryEnabled !== undefined) {
      state.memoryEnabled = data.memoryEnabled;
    }
    if (data.enableGoogleSearch !== undefined) {
      state.enableGoogleSearch = data.enableGoogleSearch;
    }

    // Load conversations index
    if (data.conversations) {
      state.conversations = data.conversations;
    }

    // Migrate legacy chatHistory to new multi-conversation format
    if (data.chatHistory && data.chatHistory.length > 0 && !data.conversations) {
      await migrateLegacyChatHistory(data.chatHistory);
    } else if (data.activeConversationId) {
      // Load the active conversation
      state.activeConversationId = data.activeConversationId;
      const convData = await chrome.storage.local.get(`conv_${data.activeConversationId}`);
      if (convData[`conv_${data.activeConversationId}`]) {
        state.messages = convData[`conv_${data.activeConversationId}`];
        renderAllMessages();
      }
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

async function migrateLegacyChatHistory(messages) {
  const id = `conv_${Date.now()}`;
  const firstUserMsg = messages.find(m => m.role === 'user');
  const title = firstUserMsg
    ? (firstUserMsg.displayContent || firstUserMsg.content).slice(0, 50)
    : 'Imported Chat';
  const now = Date.now();

  const conv = { id, title, createdAt: now, updatedAt: now };
  state.conversations = [conv];
  state.activeConversationId = id;
  state.messages = messages;

  await chrome.storage.local.set({
    [`conv_${id}`]: messages,
    conversations: state.conversations,
    activeConversationId: id,
  });
  // Remove legacy key
  await chrome.storage.local.remove('chatHistory');

  renderAllMessages();
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({
      providerConfig: state.providerConfig,
      providerKeys: state.providerKeys,
      customProviders: state.customProviders,
      mcpServers: state.mcpServers,
      enableGoogleSearch: state.enableGoogleSearch,
    });
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}

async function saveActiveConversation() {
  if (!state.activeConversationId) return;
  try {
    await chrome.storage.local.set({
      [`conv_${state.activeConversationId}`]: state.messages,
    });
    // Update updatedAt in index
    const conv = state.conversations.find(c => c.id === state.activeConversationId);
    if (conv) {
      conv.updatedAt = Date.now();
      await saveConversationIndex();
    }
  } catch (e) {
    console.warn('Failed to save conversation:', e);
  }
}

async function saveConversationIndex() {
  try {
    await chrome.storage.local.set({
      conversations: state.conversations,
      activeConversationId: state.activeConversationId,
    });
  } catch (e) {
    console.warn('Failed to save conversation index:', e);
  }
}

function createNewConversation() {
  const id = `conv_${Date.now()}`;
  const now = Date.now();
  const conv = { id, title: 'New Chat', createdAt: now, updatedAt: now };
  state.conversations.unshift(conv);
  state.activeConversationId = id;
  state.messages = [];
  saveConversationIndex();
  return conv;
}

async function switchConversation(id) {
  if (id === state.activeConversationId) return;

  // Save current conversation first
  await saveActiveConversation();

  // Load target conversation
  state.activeConversationId = id;
  const data = await chrome.storage.local.get(`conv_${id}`);
  state.messages = data[`conv_${id}`] || [];

  await saveConversationIndex();
  renderAllMessages();
  closeHistoryDrawer();
}

async function deleteConversation(id) {
  state.conversations = state.conversations.filter(c => c.id !== id);
  await chrome.storage.local.remove(`conv_${id}`);

  if (id === state.activeConversationId) {
    if (state.conversations.length > 0) {
      await switchConversation(state.conversations[0].id);
    } else {
      createNewConversation();
      renderAllMessages();
    }
  }

  await saveConversationIndex();
  renderHistoryList();
}

function autoTitleConversation(text) {
  if (!state.activeConversationId) return;
  const conv = state.conversations.find(c => c.id === state.activeConversationId);
  if (conv && conv.title === 'New Chat') {
    conv.title = text.slice(0, 50) + (text.length > 50 ? '…' : '');
    saveConversationIndex();
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
  refs.apiKey.addEventListener('change', () => {
    onSettingsChange();
    // Fetch models when API key changes
    const provider = getProvider(state.providerConfig.providerId);
    if (provider.supportsModelFetch && state.providerConfig.apiKey) {
      // Clear cache to force re-fetch
      delete state.fetchedModels[state.providerConfig.providerId];
      fetchAndCacheModels(state.providerConfig.providerId);
    }
  });
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
  refs.btnToggleCpForm.addEventListener('click', () => {
    refs.cpAddForm.classList.toggle('hidden');
    refs.btnToggleCpForm.classList.toggle('active');
  });

  // Memory settings
  refs.memoryToggle.addEventListener('change', () => {
    state.memoryEnabled = refs.memoryToggle.checked;
    saveMemories();
  });
  refs.btnClearMemories.addEventListener('click', () => {
    if (confirm('Clear all memories? This cannot be undone.')) {
      clearAllMemories();
      renderMemoryList();
    }
  });

  // Gemini Google Search toggle
  refs.googleSearchToggle.addEventListener('change', () => {
    state.enableGoogleSearch = refs.googleSearchToggle.checked;
    saveSettings();
  });

  // History drawer
  refs.btnHistory.addEventListener('click', toggleHistoryDrawer);
  refs.btnCloseHistory.addEventListener('click', closeHistoryDrawer);
  refs.historyBackdrop.addEventListener('click', closeHistoryDrawer);

  // MCP
  refs.btnAddMcp.addEventListener('click', addMCPServer);
  refs.btnToggleMcpForm.addEventListener('click', () => {
    refs.mcpAddForm.classList.toggle('hidden');
    refs.btnToggleMcpForm.classList.toggle('active');
  });

  // Listen for streaming chunks from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.requestId !== state.currentRequestId) return;

    switch (message.type) {
      case 'CHAT_STREAM_CHUNK':
        appendStreamChunk(message.content);
        break;
      case 'CHAT_STREAM_DONE':
        finishStream(message.fullContent, message.toolCalls, message.groundingMetadata);
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
    renderMemoryList();
    refs.memoryToggle.checked = state.memoryEnabled;
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
  const newId = refs.providerSelect.value;
  const oldId = state.providerConfig.providerId;
  const provider = getProvider(newId);

  // Save current provider's API key and model before switching
  state.providerKeys[oldId] = {
    apiKey: state.providerConfig.apiKey,
    model: state.providerConfig.model,
  };

  // Load the new provider's stored key and model
  const saved = state.providerKeys[newId] || {};

  state.providerConfig.providerId = newId;
  state.providerConfig.apiUrl = provider.apiUrl;
  state.providerConfig.format = provider.format;
  state.providerConfig.apiKey = saved.apiKey || (isCustomProvider(newId) ? provider.apiKey : '') || '';
  state.providerConfig.model = saved.model || provider.defaultModel || '';

  updateProviderUI();
  saveSettings();
  updateStatusBadges();

  // Fetch models for the new provider if supported and has API key
  if (provider.supportsModelFetch && state.providerConfig.apiKey) {
    fetchAndCacheModels(newId);
  }
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

  // Keep providerKeys in sync
  const providerId = state.providerConfig.providerId;
  state.providerKeys[providerId] = {
    apiKey: state.providerConfig.apiKey,
    model: state.providerConfig.model,
  };

  // If the active provider is custom, sync back to the custom provider entry
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
  const isCp = isCustomProvider(providerId);
  refs.formatGroup.style.display = isCp ? 'block' : 'none';

  // Show URL row for custom providers; hide for built-in (they have preset URLs)
  const isBuiltIn = !!PROVIDER_PRESETS[providerId];
  refs.urlRow.style.display = isBuiltIn ? 'none' : 'block';

  // Show Gemini options only for Gemini provider or Gemini-format custom providers
  const actualFormat = format || provider.format;
  const isGemini = providerId === 'gemini' || actualFormat === 'gemini';
  refs.geminiOptions.classList.toggle('hidden', !isGemini);
  refs.googleSearchToggle.checked = state.enableGoogleSearch;

  // Populate model select - use fetched models if available, otherwise use preset models
  populateModelSelect(provider, model);

  // Fetch models from API if supported and not cached
  if (provider.supportsModelFetch && apiKey && !state.fetchedModels[providerId]) {
    fetchAndCacheModels(providerId);
  }
}

async function fetchAndCacheModels(providerId) {
  if (state.fetchingModels) return;

  // Check if we have a valid cache (less than 1 hour old)
  const cached = state.fetchedModels[providerId];
  if (cached && Date.now() - cached.fetchedAt < 3600000) {
    return;
  }

  state.fetchingModels = true;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'FETCH_MODELS',
      providerConfig: {
        ...state.providerConfig,
        providerId,
      },
    });

    if (result?.models && result.models.length > 0) {
      state.fetchedModels[providerId] = {
        models: result.models,
        fetchedAt: Date.now(),
      };

      // Update UI if this is still the current provider
      if (state.providerConfig.providerId === providerId) {
        const provider = getProvider(providerId);
        populateModelSelect(provider, state.providerConfig.model);
      }
    }
  } catch (e) {
    console.warn('Failed to fetch models:', e);
  } finally {
    state.fetchingModels = false;
  }
}

function populateModelSelect(provider, currentModel) {
  const providerId = state.providerConfig.providerId;

  // Get models from: 1) fetched cache, 2) static models from preset, 3) empty
  let models = [];
  const cached = state.fetchedModels[providerId];

  if (cached?.models?.length > 0) {
    models = cached.models;
  } else if (provider.staticModels?.length > 0) {
    models = provider.staticModels;
  } else if (provider.models?.length > 0) {
    models = provider.models;
  }

  refs.modelSelect.innerHTML = '';

  if (models.length > 0) {
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      refs.modelSelect.appendChild(opt);
    }
    refs.modelSelect.value = currentModel || provider.defaultModel || models[0];
    state.showCustomModel = false;
    refs.modelSelect.classList.remove('hidden');
    refs.modelCustom.classList.add('hidden');
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Enter custom model';
    refs.modelSelect.appendChild(opt);
    state.showCustomModel = true;
    refs.modelSelect.classList.add('hidden');
    refs.modelCustom.classList.remove('hidden');
  }

  refs.modelCustom.value = currentModel || '';
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

  // Clear form and collapse
  refs.cpName.value = '';
  refs.cpUrl.value = '';
  refs.cpFormat.value = 'openai';
  refs.cpAddForm.classList.add('hidden');
  refs.btnToggleCpForm.classList.remove('active');

  populateProviderDropdown();
  renderCustomProviders();

  // Auto-select the new provider
  state.providerConfig.providerId = id;
  state.providerConfig.apiUrl = apiUrl;
  state.providerConfig.apiKey = '';
  state.providerConfig.model = '';
  state.providerConfig.format = format;
  updateProviderUI();
  updateStatusBadges();
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
  // Save current conversation before creating new one
  saveActiveConversation();

  state.isStreaming = false;
  state.currentRequestId = null;
  clearPageContext();
  clearSelection();

  createNewConversation();
  refs.messages.innerHTML = '';
  refs.welcome.classList.remove('hidden');
  closeHistoryDrawer();
}

async function sendMessage() {
  const text = refs.chatInput.value.trim();
  if (!text || state.isStreaming) return;

  // Hide welcome
  refs.welcome.classList.add('hidden');

  // Ensure we have an active conversation
  if (!state.activeConversationId) {
    createNewConversation();
  }

  // Auto-title from first user message
  if (state.messages.length === 0) {
    autoTitleConversation(text);
  }

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

  // Build options for provider-specific features
  const chatOptions = {
    enableGoogleSearch: state.enableGoogleSearch &&
      (state.providerConfig.providerId === 'gemini' || state.providerConfig.format === 'gemini'),
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_REQUEST',
      messages: apiMessages,
      providerConfig: state.providerConfig,
      tools: tools,
      options: chatOptions,
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

function buildMemoryBlock() {
  if (!state.memoryEnabled || state.memories.length === 0) return '';

  const categoryLabels = {
    style: 'Communication Style',
    interests: 'Interests & Topics',
    expertise: 'Expertise & Skills',
    preferences: 'Preferences',
    personal: 'Personal Info',
  };

  let block = '\n\n[User Memory - Use these insights to personalize responses]\n';
  for (const cat of MEMORY_CATEGORIES) {
    const items = state.memories.filter(m => m.category === cat);
    if (items.length === 0) continue;
    block += `\n${categoryLabels[cat]}:\n`;
    for (const item of items) {
      block += `- ${item.content}\n`;
    }
  }
  return block;
}

function buildAPIMessages() {
  const msgs = [];

  // System prompt with memory block
  const memoryBlock = buildMemoryBlock();
  const systemContent = (state.providerConfig.systemPrompt || '') + memoryBlock;
  if (systemContent) {
    msgs.push({ role: 'system', content: systemContent });
  }

  // Conversation history — properly format tool calls and results
  for (const msg of state.messages) {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      // Assistant message with tool calls
      const assistantMsg = { role: 'assistant', content: msg.content || null };
      assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments || '{}' },
      }));
      msgs.push(assistantMsg);
    } else if (msg.role === 'tool') {
      // Tool result message
      msgs.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        name: msg.name, // Required for Gemini functionResponse mapping
        content: msg.content,
      });
    } else {
      msgs.push({ role: msg.role, content: msg.content });
    }
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

function finishStream(fullContent, toolCalls, groundingMetadata) {
  // Store assistant message with tool_calls metadata if present
  const assistantMsg = { role: 'assistant', content: fullContent || '' };
  if (toolCalls && toolCalls.length > 0) {
    assistantMsg.toolCalls = toolCalls;
  }
  if (groundingMetadata) {
    assistantMsg.groundingMetadata = groundingMetadata;
  }
  state.messages.push(assistantMsg);

  if (currentStreamRenderer) {
    // Final render
    const bubble = currentStreamRenderer.element;
    bubble.innerHTML = renderMarkdown(fullContent || '');

    // Add grounding citations if available
    if (groundingMetadata && groundingMetadata.groundingChunks) {
      const citationsEl = createGroundingCitations(groundingMetadata);
      if (citationsEl) {
        bubble.appendChild(citationsEl);
      }
    }
  }

  currentStreamRenderer = null;

  // Add copy button and wire code block copy buttons
  if (fullContent) {
    addMessageActionsToLast(fullContent);
  }

  // Handle tool calls — the agentic loop
  if (toolCalls && toolCalls.length > 0) {
    handleToolCalls(toolCalls);
  } else {
    // No tool calls — we're done
    setStreamingUI(false);
    state.isStreaming = false;
    saveActiveConversation();
    scheduleMemoryExtraction();
  }

  scrollToBottom();
}

function createGroundingCitations(metadata) {
  const chunks = metadata.groundingChunks;
  if (!chunks || chunks.length === 0) return null;

  const container = document.createElement('div');
  container.className = 'grounding-citations';

  const header = document.createElement('div');
  header.className = 'grounding-citations-header';
  header.innerHTML = `
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    Sources
  `;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'grounding-citations-list';

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const web = chunk.web;
    if (!web || !web.uri) continue;

    const link = document.createElement('a');
    link.className = 'grounding-source';
    link.href = web.uri;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    const title = web.title || new URL(web.uri).hostname;
    link.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
        <polyline points="15 3 21 3 21 9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      ${escapeHtml(title)}
    `;
    list.appendChild(link);
  }

  if (list.children.length === 0) return null;

  container.appendChild(list);
  return container;
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
async function handleToolCalls(toolCalls) {
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

      // Add tool result to state with proper role for API
      state.messages.push({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name, // Required for Gemini functionResponse mapping
        content: resultText,
      });
    } catch (e) {
      addToolMessage(tc.name, args, 'error', e.message);
      state.messages.push({
        role: 'tool',
        toolCallId: tc.id,
        name: tc.name, // Required for Gemini functionResponse mapping
        content: `Error: ${e.message}`,
      });
    }
  }

  // --- Agentic loop: send tool results back to LLM for follow-up ---
  const apiMessages = buildAPIMessages();

  let tools = [];
  try {
    const mcpRes = await chrome.runtime.sendMessage({ type: 'MCP_LIST_TOOLS' });
    if (mcpRes?.tools) tools = mcpRes.tools;
  } catch (_) {}

  state.currentRequestId = `req_${Date.now()}`;

  // Create a new streaming placeholder for the follow-up response
  const streamEl = addMessage('assistant', '', true);

  // Build options for provider-specific features
  const chatOptions = {
    enableGoogleSearch: state.enableGoogleSearch &&
      (state.providerConfig.providerId === 'gemini' || state.providerConfig.format === 'gemini'),
  };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHAT_REQUEST',
      messages: apiMessages,
      providerConfig: state.providerConfig,
      tools: tools,
      options: chatOptions,
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
    const details = document.createElement('details');
    details.className = `tool-result ${status === 'error' ? 'error' : 'success'}`;

    const summary = document.createElement('summary');
    const preview = result.length > 80 ? result.slice(0, 80) + '…' : result;
    summary.textContent = preview;
    details.appendChild(summary);

    const fullContent = document.createElement('div');
    fullContent.className = 'tool-result-content';
    fullContent.textContent = result;
    details.appendChild(fullContent);

    bubble.appendChild(details);
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

  // Parse headers from textarea (one per line, Key: Value)
  const headers = {};
  const headerLines = refs.mcpHeaders.value.trim().split('\n');
  for (const line of headerLines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key) headers[key] = val;
    }
  }

  const config = {
    id: `mcp_${Date.now()}`,
    name,
    url,
    headers,
  };

  refs.btnAddMcp.disabled = true;

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
      refs.mcpHeaders.value = '';
      refs.mcpAddForm.classList.add('hidden');
      refs.btnToggleMcpForm.classList.remove('active');
      saveSettings();
      renderMCPServers();
    } else {
      alert(`Failed to connect: ${result.error || 'Unknown error'}`);
    }
  } catch (e) {
    alert(`Connection error: ${e.message}`);
  }

  refs.btnAddMcp.disabled = false;
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

// ==================== MEMORY SYSTEM ====================
function scheduleMemoryExtraction() {
  if (!state.memoryEnabled) return;
  if (state.messages.length < 4) return;

  if (state.memoryExtractionTimer) {
    clearTimeout(state.memoryExtractionTimer);
  }
  state.memoryExtractionTimer = setTimeout(() => {
    extractMemories();
  }, 3000);
}

async function extractMemories() {
  if (!state.memoryEnabled) return;

  // Get last 10 messages for context
  const recentMessages = state.messages.slice(-10);
  const existingMemories = state.memories.map(m => `[${m.category}] ${m.content}`).join('\n');

  const extractionPrompt = `Analyze the conversation and extract insights about the user. Return ONLY a JSON array of new insights.

Each insight should have:
- "category": one of "style", "interests", "expertise", "preferences", "personal"
- "content": the insight text (concise, 1 sentence)
- "confidence": 0.0-1.0 how confident you are

Categories:
- style: communication preferences (formal/casual, verbose/concise)
- interests: topics, hobbies, fields they care about
- expertise: technical skill level, domain knowledge
- preferences: response format, length, detail preferences
- personal: name, role, occupation, location

Existing memories (avoid duplicates):
${existingMemories || '(none yet)'}

Return [] if no new insights found. ONLY return valid JSON array, nothing else.`;

  const messages = [
    { role: 'system', content: extractionPrompt },
    ...recentMessages.filter(m => m.role === 'user' || m.role === 'assistant').map(m => ({
      role: m.role,
      content: m.displayContent || m.content,
    })),
  ];

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'MEMORY_EXTRACT',
      messages,
      providerConfig: state.providerConfig,
    });

    if (response?.memories && Array.isArray(response.memories)) {
      mergeMemories(response.memories);
    }
  } catch (e) {
    console.warn('Memory extraction failed:', e);
  }
}

function mergeMemories(newInsights) {
  let changed = false;
  for (const insight of newInsights) {
    if (!MEMORY_CATEGORIES.includes(insight.category)) continue;
    if (!insight.content || typeof insight.content !== 'string') continue;

    const confidence = Math.min(1, Math.max(0, Number(insight.confidence) || 0.5));

    // Check for similar existing memory
    const existing = state.memories.find(m =>
      m.category === insight.category && isSimilarMemory(m.content, insight.content)
    );

    if (existing) {
      // Update if higher confidence
      if (confidence > existing.confidence) {
        existing.content = insight.content;
        existing.confidence = confidence;
        existing.updatedAt = Date.now();
        changed = true;
      }
    } else {
      state.memories.push({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        category: insight.category,
        content: insight.content,
        confidence,
        source: state.activeConversationId || '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      changed = true;
    }
  }

  if (changed) {
    // Cap at 100 memories, keep highest confidence + most recent
    if (state.memories.length > 100) {
      state.memories.sort((a, b) => (b.confidence * 0.7 + b.updatedAt / Date.now() * 0.3) -
        (a.confidence * 0.7 + a.updatedAt / Date.now() * 0.3));
      state.memories = state.memories.slice(0, 100);
    }
    saveMemories();
  }
}

function isSimilarMemory(a, b) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;

  // Simple word overlap check
  const wordsA = new Set(na.split(/\s+/));
  const wordsB = new Set(nb.split(/\s+/));
  const intersection = [...wordsA].filter(w => wordsB.has(w));
  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size > 0.6;
}

async function saveMemories() {
  try {
    await chrome.storage.local.set({ memories: state.memories, memoryEnabled: state.memoryEnabled });
  } catch (e) {
    console.warn('Failed to save memories:', e);
  }
}

async function loadMemories() {
  try {
    const data = await chrome.storage.local.get(['memories', 'memoryEnabled']);
    if (data.memories) state.memories = data.memories;
    if (data.memoryEnabled !== undefined) state.memoryEnabled = data.memoryEnabled;
  } catch (e) {
    console.warn('Failed to load memories:', e);
  }
}

function deleteMemory(id) {
  state.memories = state.memories.filter(m => m.id !== id);
  saveMemories();
}

function clearAllMemories() {
  state.memories = [];
  saveMemories();
}

function renderMemoryList() {
  const container = refs.memoryList;
  if (!container) return;
  container.innerHTML = '';

  refs.btnClearMemories.style.display = state.memories.length > 0 ? 'block' : 'none';

  if (state.memories.length === 0) {
    container.innerHTML = '<p class="empty-text">No memories yet. Chat more to build personalization.</p>';
    return;
  }

  const categoryLabels = {
    style: '🎨 Communication Style',
    interests: '💡 Interests & Topics',
    expertise: '🧠 Expertise & Skills',
    preferences: '⚙️ Preferences',
    personal: '👤 Personal Info',
  };

  for (const cat of MEMORY_CATEGORIES) {
    const items = state.memories.filter(m => m.category === cat);
    if (items.length === 0) continue;

    const group = document.createElement('div');
    group.className = 'memory-category';

    const header = document.createElement('div');
    header.className = 'memory-category-header';
    header.textContent = categoryLabels[cat] || cat;
    group.appendChild(header);

    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'memory-item';
      el.innerHTML = `
        <span class="memory-item-text">${escapeHtml(item.content)}</span>
        <button class="memory-item-delete" title="Remove">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      el.querySelector('.memory-item-delete').addEventListener('click', () => {
        deleteMemory(item.id);
        renderMemoryList();
      });
      group.appendChild(el);
    }

    container.appendChild(group);
  }
}

// ==================== HISTORY DRAWER ====================
function toggleHistoryDrawer() {
  if (state.historyDrawerOpen) {
    closeHistoryDrawer();
  } else {
    openHistoryDrawer();
  }
}

function openHistoryDrawer() {
  state.historyDrawerOpen = true;
  refs.historyDrawer.classList.remove('hidden');
  renderHistoryList();
}

function closeHistoryDrawer() {
  state.historyDrawerOpen = false;
  refs.historyDrawer.classList.add('hidden');
}

function renderHistoryList() {
  const container = refs.historyList;
  container.innerHTML = '';

  // Sort by updatedAt descending
  const sorted = [...state.conversations].sort((a, b) => b.updatedAt - a.updatedAt);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="history-empty">No conversations yet.</div>';
    return;
  }

  for (const conv of sorted) {
    const el = document.createElement('div');
    el.className = `history-item${conv.id === state.activeConversationId ? ' active' : ''}`;

    el.innerHTML = `
      <div class="history-item-info">
        <div class="history-item-title">${escapeHtml(conv.title)}</div>
        <div class="history-item-time">${formatTimeAgo(conv.updatedAt)}</div>
      </div>
      <button class="history-item-delete" title="Delete">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    el.querySelector('.history-item-info').addEventListener('click', () => {
      switchConversation(conv.id);
    });
    el.querySelector('.history-item-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteConversation(conv.id);
    });

    container.appendChild(el);
  }
}

function formatTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
