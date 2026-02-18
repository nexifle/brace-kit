import { create } from 'zustand';
import type {
  AppState,
  Message,
  ProviderConfig,
  Conversation,
} from '../types/index.ts';
import {
  saveImagesForConversation,
  hydrateMessages,
  deleteImagesByConversation,
} from '../utils/imageDB.ts';
import { sha256 } from '../utils/crypto.ts';

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

  // Quote
  quotedText: null,

  // Auto Compact
  compactConfig: {
    threshold: 0.9,
    defaultContextWindow: 128000,
  },
  isCompacting: false,

  // UI State
  view: 'chat',
  historyDrawerOpen: false,
  settingsSection: null,

  // Security
  security: {
    isLockEnabled: false,
    passwordHash: null,
  },
  isAuthenticated: false,

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

    // Jika conversation aktif kosong, hapus dari state sebelum switch
    if (state.messages.length === 0 && state.activeConversationId) {
      const currentId = state.activeConversationId;
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== currentId),
      }));
    } else {
      // Save current conversation first
      await state.saveActiveConversation();
    }

    // Load target conversation
    set({ activeConversationId: id });
    try {
      const data = await chrome.storage.local.get(`conv_${id}`);
      let messages = data[`conv_${id}`] || [];

      // Hydrate gambar dari IndexedDB berdasarkan imageRef keys
      try {
        messages = await hydrateMessages(messages);
      } catch (e) {
        console.warn('[Store] Failed to hydrate images:', e);
      }

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

    // Cleanup gambar dari IndexedDB (async, tidak blocking)
    deleteImagesByConversation(id).catch((e) =>
      console.warn('[Store] Failed to cleanup images for deleted conversation:', e)
    );

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

  togglePinConversation: (id) => {
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c
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

  setQuotedText: (quotedText) => set({ quotedText }),

  setView: (view) => set({ view }),

  setHistoryDrawerOpen: (historyDrawerOpen) => set({ historyDrawerOpen }),

  toggleHistoryDrawer: () =>
    set((state) => ({ historyDrawerOpen: !state.historyDrawerOpen })),

  // Security Actions
  setSecurity: (security) =>
    set((state) => ({
      security: { ...state.security, ...security },
    })),

  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),

  // Auto Compact Actions
  setCompactConfig: (config) =>
    set((state) => ({
      compactConfig: { ...state.compactConfig, ...config },
    })),

  setIsCompacting: (isCompacting) => set({ isCompacting }),

  compactConversation: async (_id) => {
    // This will be implemented or called from useChat or a dedicated service
    // For now, it's a placeholder if we want to trigger it from the store
  },

  authenticate: async (password) => {
    const state = get();
    if (!state.security.passwordHash) return false;
    const hash = await sha256(password);
    const isValid = hash === state.security.passwordHash;
    if (isValid) {
      set({ isAuthenticated: true });
      // Save to session storage to persist during browser session
      try {
        await chrome.storage.session.set({ isAuthenticated: true });
      } catch (e) {
        // storage.session might not be available in all contexts
      }
    }
    return isValid;
  },

  lock: async () => {
    set({ isAuthenticated: false });
    // Clear session storage when manually locking
    try {
      await chrome.storage.session.remove('isAuthenticated');
    } catch (e) {
      // storage.session might not be available in all contexts
    }
  },

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
        'security',
        'compactConfig',
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
      if (data.security) {
        updates.security = data.security;
      }
      if (data.compactConfig) {
        updates.compactConfig = data.compactConfig;
      }

      // Load session auth state (persists during browser session)
      try {
        const sessionData = await chrome.storage.session.get('isAuthenticated');
        if (sessionData.isAuthenticated !== undefined) {
          updates.isAuthenticated = sessionData.isAuthenticated;
        }
      } catch (e) {
        // storage.session might not be available in all contexts
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
          let messages = convData[`conv_${data.activeConversationId}`];

          // Hydrate gambar dari IndexedDB saat extension pertama dibuka
          try {
            messages = await hydrateMessages(messages);
          } catch (e) {
            console.warn('[Store] Failed to hydrate images on load:', e);
          }

          updates.messages = messages;
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
      // Jangan simpan conversation aktif yang masih kosong (belum pernah kirim pesan)
      const activeIsEmpty = state.messages.length === 0;
      const conversationsToSave = state.conversations.filter((c) => {
        if (c.id === state.activeConversationId) {
          return !activeIsEmpty;
        }
        return true;
      });

      await chrome.storage.local.set({
        providerConfig: state.providerConfig,
        providerKeys: state.providerKeys,
        customProviders: state.customProviders,
        mcpServers: state.mcpServers,
        enableGoogleSearch: state.enableGoogleSearch,
        conversations: conversationsToSave,
        // Jika aktif kosong, simpan null agar saat reload tidak coba load conversation ini
        activeConversationId: activeIsEmpty ? null : state.activeConversationId,
        memories: state.memories,
        memoryEnabled: state.memoryEnabled,
        security: state.security,
        compactConfig: state.compactConfig,
      });
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  },

  saveActiveConversation: async () => {
    const state = get();
    if (!state.activeConversationId) return;

    // Jangan simpan conversation yang masih kosong
    if (state.messages.length === 0) return;

    try {
      const convId = state.activeConversationId;

      // Simpan gambar ke IndexedDB, dapat kembali key map per message
      let imageKeyMap: string[][] = [];
      try {
        imageKeyMap = await saveImagesForConversation(convId, state.messages);
      } catch (e) {
        console.warn('[Store] IndexedDB save failed, images will not persist:', e);
      }

      // Buat messages untuk chrome.storage dengan imageRef menggantikan data base64
      const messagesToSave = state.messages.map((msg, msgIdx) => {
        if (!msg.generatedImages || msg.generatedImages.length === 0) {
          return msg;
        }

        const msgKeys = imageKeyMap[msgIdx] || [];
        const imagesWithRefs = msg.generatedImages.map((img, imgIdx) => {
          const key = msgKeys[imgIdx];
          if (key) {
            return { mimeType: img.mimeType, data: '', imageRef: key };
          }
          return { mimeType: img.mimeType, data: '[IMAGE_DATA_NOT_SAVED]' };
        });

        return { ...msg, generatedImages: imagesWithRefs };
      });

      await chrome.storage.local.set({
        [`conv_${convId}`]: messagesToSave,
      });
    } catch (e) {
      console.warn('Failed to save conversation:', e);
    }
  },

  updateConversationTimestamp: async () => {
    const state = get();
    if (!state.activeConversationId) return;

    try {
      const conv = state.conversations.find((c) => c.id === state.activeConversationId);
      if (conv) {
        conv.updatedAt = Date.now();
        await chrome.storage.local.set({
          conversations: state.conversations,
        });
      }
    } catch (e) {
      console.warn('Failed to update conversation timestamp:', e);
    }
  },
}));
