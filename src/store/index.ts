import { create } from 'zustand';
import type {
  AppState,
  Message,
  ProviderConfig,
  Conversation,
} from '../types/index.ts';

const DEFAULT_SYSTEM_PROMPT = 'You are a helpful AI assistant. When the user shares page content or selected text, help them understand and work with it. Be concise and helpful.';

const initialProviderConfig: ProviderConfig = {
  providerId: 'openai',
  apiKey: '',
  apiUrl: '',
  model: '',
  format: 'openai',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

export const useStore = create<AppState>((set, get) => ({
  // Messages
  messages: [],
  isStreaming: false,
  currentRequestId: null,
  streamingContent: '',

  // Context
  pageContext: null,
  selectedText: null,

  // Provider
  providerConfig: initialProviderConfig,
  providerKeys: {},
  customProviders: [],
  showCustomModel: false,
  fetchedModels: {},
  fetchingModels: false,

  // MCP
  mcpServers: [],

  // Conversations
  conversations: [],
  activeConversationId: null,

  // Memory
  memories: [],
  memoryEnabled: true,

  // Gemini options
  enableGoogleSearch: false,

  // File attachments
  attachments: [],

  // UI State
  view: 'chat',
  historyDrawerOpen: false,
  settingsSection: null,

  // Actions
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateLastMessage: (content) =>
    set((state) => {
      const messages = [...state.messages];
      if (messages.length > 0) {
        messages[messages.length - 1].content = content;
      }
      return { messages };
    }),

  setIsStreaming: (isStreaming) => set({ isStreaming }),
  setCurrentRequestId: (currentRequestId) => set({ currentRequestId }),
  setStreamingContent: (streamingContent) => set({ streamingContent }),

  setPageContext: (pageContext) => set({ pageContext }),
  setSelectedText: (selectedText) => set({ selectedText }),

  setProviderConfig: (config) =>
    set((state) => ({
      providerConfig: { ...state.providerConfig, ...config },
    })),

  setProviderKeys: (providerKeys) => set({ providerKeys }),

  addCustomProvider: (provider) =>
    set((state) => ({
      customProviders: [...state.customProviders, provider],
    })),

  removeCustomProvider: (id) =>
    set((state) => ({
      customProviders: state.customProviders.filter((p) => p.id !== id),
    })),

  updateCustomProvider: (id, updates) =>
    set((state) => ({
      customProviders: state.customProviders.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),

  setShowCustomModel: (showCustomModel) => set({ showCustomModel }),

  setFetchedModels: (providerId, models) =>
    set((state) => ({
      fetchedModels: { ...state.fetchedModels, [providerId]: models },
    })),

  setFetchingModels: (fetchingModels) => set({ fetchingModels }),

  addMCPServer: (server) =>
    set((state) => ({
      mcpServers: [...state.mcpServers, server],
    })),

  removeMCPServer: (id) =>
    set((state) => ({
      mcpServers: state.mcpServers.filter((s) => s.id !== id),
    })),

  updateMCPServer: (id, updates) =>
    set((state) => ({
      mcpServers: state.mcpServers.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  toggleMCPServer: (id, enabled) =>
    set((state) => ({
      mcpServers: state.mcpServers.map((s) =>
        s.id === id ? { ...s, enabled } : s
      ),
    })),

  createConversation: (opts?: { title?: string; branchedFromId?: string }) => {
    const id = `conv_${Date.now()}`;
    const now = Date.now();
    const conv: Conversation = {
      id,
      title: opts?.title ?? 'New Chat',
      createdAt: now,
      updatedAt: now,
      ...(opts?.branchedFromId ? { branchedFromId: opts.branchedFromId } : {}),
    };
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: id,
      messages: [],
    }));
    return conv;
  },

  switchConversation: async (id) => {
    const state = get();
    if (id === state.activeConversationId) return;

    // Save current conversation first
    await state.saveActiveConversation();

    // Load target conversation
    set({ activeConversationId: id });
    try {
      const data = await chrome.storage.local.get(`conv_${id}`);
      const messages = data[`conv_${id}`] || [];
      set({ messages });

      // Save to storage
      await chrome.storage.local.set({ activeConversationId: id });
    } catch (e) {
      console.warn('Failed to load conversation:', e);
    }
  },

  deleteConversation: async (id) => {
    const state = get();
    const newConversations = state.conversations.filter((c) => c.id !== id);

    await chrome.storage.local.remove(`conv_${id}`);

    if (id === state.activeConversationId) {
      if (newConversations.length > 0) {
        await get().switchConversation(newConversations[0].id);
      } else {
        get().createConversation();
        set({ messages: [] });
      }
    }

    set({ conversations: newConversations });
    await chrome.storage.local.set({ conversations: newConversations });
  },

  updateConversationTitle: (id, title) => {
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      );
      return { conversations: updated };
    });
    get().saveToStorage();
  },

  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),

  addMemory: (memory) =>
    set((state) => ({
      memories: [...state.memories, memory],
    })),

  removeMemory: (id) =>
    set((state) => ({
      memories: state.memories.filter((m) => m.id !== id),
    })),

  updateMemory: (id, updates) =>
    set((state) => ({
      memories: state.memories.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),

  setMemoryEnabled: (memoryEnabled) => set({ memoryEnabled }),

  clearMemories: () => set({ memories: [] }),

  setEnableGoogleSearch: (enableGoogleSearch) => set({ enableGoogleSearch }),

  addAttachment: (attachment) =>
    set((state) => ({
      attachments: [...state.attachments, attachment],
    })),

  removeAttachment: (id) =>
    set((state) => ({
      attachments: state.attachments.filter((a) => a.id !== id),
    })),

  clearAttachments: () => set({ attachments: [] }),

  setView: (view) => set({ view }),

  setHistoryDrawerOpen: (historyDrawerOpen) => set({ historyDrawerOpen }),

  toggleHistoryDrawer: () =>
    set((state) => ({ historyDrawerOpen: !state.historyDrawerOpen })),

  // Persistence
  loadFromStorage: async () => {
    try {
      const data = await chrome.storage.local.get([
        'providerConfig',
        'providerKeys',
        'customProviders',
        'mcpServers',
        'conversations',
        'activeConversationId',
        'memories',
        'memoryEnabled',
        'enableGoogleSearch',
      ]);

      const updates: Partial<AppState> = {};

      if (data.providerConfig) {
        updates.providerConfig = { ...initialProviderConfig, ...data.providerConfig };
      }
      if (data.providerKeys) {
        updates.providerKeys = data.providerKeys;
      }
      if (data.customProviders) {
        updates.customProviders = data.customProviders;
      }
      if (data.mcpServers) {
        updates.mcpServers = data.mcpServers;
      }
      if (data.memories) {
        updates.memories = data.memories;
      }
      if (data.memoryEnabled !== undefined) {
        updates.memoryEnabled = data.memoryEnabled;
      }
      if (data.enableGoogleSearch !== undefined) {
        updates.enableGoogleSearch = data.enableGoogleSearch;
      }

      // Load conversations index
      if (data.conversations) {
        updates.conversations = data.conversations;
      }

      // Migrate legacy chatHistory or load active conversation
      const legacyData = await chrome.storage.local.get(['chatHistory']);
      if (legacyData.chatHistory && legacyData.chatHistory.length > 0 && !data.conversations) {
        // Migrate legacy data
        const id = `conv_${Date.now()}`;
        const firstUserMsg = legacyData.chatHistory.find((m: Message) => m.role === 'user');
        const title = firstUserMsg
          ? (firstUserMsg.displayContent || firstUserMsg.content).slice(0, 50)
          : 'Imported Chat';
        const now = Date.now();

        const conv: Conversation = { id, title, createdAt: now, updatedAt: now };
        updates.conversations = [conv];
        updates.activeConversationId = id;
        updates.messages = legacyData.chatHistory;

        await chrome.storage.local.set({
          [`conv_${id}`]: legacyData.chatHistory,
          conversations: [conv],
          activeConversationId: id,
        });
        await chrome.storage.local.remove('chatHistory');
      } else if (data.activeConversationId) {
        updates.activeConversationId = data.activeConversationId;
        const convData = await chrome.storage.local.get(`conv_${data.activeConversationId}`);
        if (convData[`conv_${data.activeConversationId}`]) {
          updates.messages = convData[`conv_${data.activeConversationId}`];
        }
      }

      set(updates);
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
  },

  saveToStorage: async () => {
    const state = get();
    try {
      await chrome.storage.local.set({
        providerConfig: state.providerConfig,
        providerKeys: state.providerKeys,
        customProviders: state.customProviders,
        mcpServers: state.mcpServers,
        enableGoogleSearch: state.enableGoogleSearch,
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        memories: state.memories,
        memoryEnabled: state.memoryEnabled,
      });
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  },

  saveActiveConversation: async () => {
    const state = get();
    if (!state.activeConversationId) return;

    try {
      await chrome.storage.local.set({
        [`conv_${state.activeConversationId}`]: state.messages,
      });

      // Update updatedAt in index
      const conv = state.conversations.find((c) => c.id === state.activeConversationId);
      if (conv) {
        conv.updatedAt = Date.now();
        await chrome.storage.local.set({
          conversations: state.conversations,
        });
      }
    } catch (e) {
      console.warn('Failed to save conversation:', e);
    }
  },
}));
