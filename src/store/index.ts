import { create } from 'zustand';
import type {
  AppState,
  Message,
  ProviderConfig,
  ModelParameters,
  Conversation,
  ProviderKeys,
  CustomProvider,
  MCPServer,
  Memory,
  SecuritySettings,
  CompactConfig,
  Preferences,
  ConversationStreamingState,
} from '../types/index.ts';
import {
  saveImagesForConversation,
  hydrateMessages,
  deleteImagesByConversation,
} from '../utils/imageDB.ts';
import {
  saveConversationMessages,
  getConversationMessages,
  deleteConversationMessages,
  migrateOldConversations,
  saveConversationMetadata,
  deleteConversationMetadata,
  getAllConversationMetadata,
} from '../utils/conversationDB.ts';
import { sha256 } from '../utils/crypto.ts';
import { selectMemoriesForConversation } from '../utils/memorySampler.ts';
import { encryptApiKey, decryptApiKey, isEncrypted } from '../utils/keyEncryption.ts';

// Type for chrome.storage.local.get() return value
interface StorageData {
  providerConfig?: ProviderConfig;
  providerKeys?: ProviderKeys;
  customProviders?: CustomProvider[];
  mcpServers?: MCPServer[];
  activeConversationId?: string;
  memories?: Memory[];
  memoryEnabled?: boolean;
  enableGoogleSearch?: boolean;
  enableReasoning?: boolean;
  enableGoogleSearchTool?: boolean;
  googleSearchApiKey?: string;
  enableStreaming?: boolean;
  security?: SecuritySettings;
  compactConfig?: CompactConfig;
  theme?: 'light' | 'dark';
  preferences?: Preferences;
  textSelectionEnabled?: boolean;
  textSelectionMinLength?: number;
  customQuickActions?: unknown[];
  builtinActionOverrides?: unknown;
  conversations?: Conversation[];
  chatHistory?: Message[];
  fetchedModels?: Record<string, { models?: string[] }>;
}

const DEFAULT_SYSTEM_PROMPT = 'You are BraceKit, a helpful AI assistant. When the user shares page content or selected text, help them understand and work with it. Be concise and helpful.';

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
  streamingReasoningContent: '',
  streamingConversations: {} as Record<string, ConversationStreamingState>,

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

  // Reasoning options
  enableReasoning: false,

  // Google Search Tool (for non-Gemini providers)
  enableGoogleSearchTool: false,
  googleSearchApiKey: '',

  // Streaming options (default: true for backward compatibility)
  enableStreaming: true,

  // File attachments
  attachments: [],

  // Quote
  quotedText: null,

  // Auto Compact
  compactConfig: {
    enabled: true,
    threshold: 0.9,
    defaultContextWindow: 128000,
    prompt: '',
  },
  isCompacting: false,
  isRenaming: false,

  // Token Usage (for auto-compact with real API data)
  tokenUsage: null,

  // UI State
  view: 'chat',
  theme: 'dark',
  historyDrawerOpen: false,
  settingsSection: null,
  showSystemPromptEditor: false,

  // Security
  security: {
    isLockEnabled: false,
    passwordHash: null,
  },
  isAuthenticated: false,

  // Preferences
  preferences: {
    toolMessageDisplay: 'detailed',
    startOnWelcome: false,
  },

  // Text Selection UI Settings
  textSelectionEnabled: true,
  textSelectionMinLength: 10,
  customQuickActions: [],
  builtinActionOverrides: {},

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
  setStreamingReasoningContent: (streamingReasoningContent) => set({ streamingReasoningContent }),
  setConversationStreaming: (convId, state) => {
    if (state === null) {
      set((s) => {
        const newStreamingConversations = { ...s.streamingConversations };
        delete newStreamingConversations[convId];
        return { streamingConversations: newStreamingConversations };
      });
    } else {
      set((s) => ({
        streamingConversations: { ...s.streamingConversations, [convId]: state },
      }));
    }
  },

  setPageContext: (pageContext) => set({ pageContext }),
  setSelectedText: (selectedText) => set({ selectedText }),

  setProviderConfig: (config) =>
    set((state) => ({
      providerConfig: { ...state.providerConfig, ...config },
    })),

  setModelParameters: (params: Partial<ModelParameters>) =>
    set((state) => {
      const merged = { ...state.providerConfig.modelParameters, ...params };
      // Remove keys explicitly set to undefined to keep the object clean
      for (const key of Object.keys(merged) as (keyof ModelParameters)[]) {
        if (merged[key] === undefined) delete merged[key];
      }
      return {
        providerConfig: {
          ...state.providerConfig,
          modelParameters: Object.keys(merged).length > 0 ? merged : undefined,
        },
      };
    }),

  clearModelParameters: () =>
    set((state) => ({
      providerConfig: { ...state.providerConfig, modelParameters: undefined },
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

  setFetchedModels: (providerId, models) => {
    set((state) => ({
      fetchedModels: { ...state.fetchedModels, [providerId]: models },
    }));
    get().saveToStorage();
  },

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

  createConversation: (opts?: { title?: string; branchedFromId?: string; parentConvId?: string }) => {
    const id = `conv_${Date.now()}`;
    const now = Date.now();

    // Get current state for memory selection
    const state = get();

    // Select memories for this conversation (if memory feature is enabled)
    let selectedMemoryIds: string[] | undefined;
    if (state.memoryEnabled && state.memories.length > 0) {
      // If branching, inherit parent's memory selection for consistency
      if (opts?.parentConvId) {
        const parentConv = state.conversations.find((c) => c.id === opts.parentConvId);
        if (parentConv?.selectedMemoryIds) {
          selectedMemoryIds = parentConv.selectedMemoryIds;
        }
      }

      // Otherwise, select new random memories
      if (!selectedMemoryIds) {
        selectedMemoryIds = selectMemoriesForConversation(state.memories);
      }
    }

    // Create static timestamp for metadata (for prompt caching)
    const metadataTimestamp = new Date().toISOString();

    const conv: Conversation = {
      id,
      title: opts?.title ?? 'New Chat',
      createdAt: now,
      updatedAt: now,
      selectedMemoryIds,
      metadataTimestamp,
      ...(opts?.branchedFromId ? { branchedFromId: opts.branchedFromId } : {}),
    };
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
      messages: [],
    }));

    // Async save metadata to DB
    saveConversationMetadata(conv).catch((e) => console.warn('[Store] Failed to save conversation metadata:', e));

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
      deleteConversationMetadata(currentId).catch((e) => console.warn('[Store] Failed to delete empty conversation metadata:', e));
    } else {
      // Save current conversation first
      await state.saveActiveConversation();
    }

    // Snapshot streamingContent untuk conv yang sedang streaming sebelum switch away
    const currentConvId = state.activeConversationId;
    if (currentConvId && get().streamingConversations[currentConvId]) {
      set((s) => ({
        streamingConversations: {
          ...s.streamingConversations,
          [currentConvId]: {
            ...s.streamingConversations[currentConvId]!,
            streamingContent: s.streamingContent,
          },
        },
      }));
    }

    // Load target conversation – update isStreaming to reflect the target conv's streaming state
    const targetConvStreaming = get().streamingConversations[id];
    set({
      activeConversationId: id,
      // Reset messages segera agar saveActiveConversation yang berjalan paralel
      // tidak menyimpan messages conversation lama ke conversation ini
      messages: [],
      showSystemPromptEditor: false,
      isStreaming: !!targetConvStreaming,
      currentRequestId: targetConvStreaming?.requestId || null,
      // Restore snapshot jika conv tujuan masih streaming, atau kosongkan jika tidak
      streamingContent: targetConvStreaming?.streamingContent || '',
      streamingReasoningContent: '',
    });
    try {
      let messagesOrNull = await getConversationMessages(id);
      let messages: Message[] = [];

      // Fallback/migrate from local storage if not found in IndexedDB
      if (!messagesOrNull) {
        const data = await chrome.storage.local.get(`conv_${id}`) as Record<string, Message[] | undefined>;
        messages = data[`conv_${id}`] || [];
        if (messages.length > 0) {
          await saveConversationMessages(id, messages);
          await chrome.storage.local.remove(`conv_${id}`);
        }
      } else {
        messages = messagesOrNull;
      }

      // Hydrate gambar dari IndexedDB berdasarkan imageRef keys
      try {
        messages = await hydrateMessages(messages);
      } catch (e) {
        console.warn('[Store] Failed to hydrate images:', e);
      }

      // Guard: user mungkin sudah switch ke conversation lain selama async load/hydrate
      if (get().activeConversationId !== id) return;

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

    await deleteConversationMessages(id);
    await deleteConversationMetadata(id); // Delete metadata in IDB
    await chrome.storage.local.remove(`conv_${id}`); // just in case it was migrated lazily

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
    // Note: no longer saved in local storage array
  },

  updateConversationTitle: (id, title) => {
    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c.id === id) {
          const newConv = { ...c, title, updatedAt: Date.now() };
          saveConversationMetadata(newConv).catch(e => console.warn(e));
          return newConv;
        }
        return c;
      });
      return { conversations: updated };
    });
  },

  togglePinConversation: (id) => {
    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c.id === id) {
          const newConv = { ...c, pinned: !c.pinned };
          saveConversationMetadata(newConv).catch(e => console.warn(e));
          return newConv;
        }
        return c;
      });
      return { conversations: updated };
    });
  },

  updateConversationSystemPrompt: (id: string, systemPrompt: string) => {
    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c.id === id) {
          const newConv = { ...c, systemPrompt, updatedAt: Date.now() };
          saveConversationMetadata(newConv).catch(e => console.warn(e));
          return newConv;
        }
        return c;
      });
      return { conversations: updated };
    });
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

  refreshConversationMemories: (conversationId: string) => {
    const state = get();
    const conversation = state.conversations.find((c) => c.id === conversationId);
    if (!conversation) return;

    // Get current selected IDs or empty array
    const currentSelectedIds = conversation.selectedMemoryIds || [];

    // Generate new selection (will be different from current)
    const { refreshMemorySelection } = require('../utils/memorySampler.ts');
    const newSelectedIds = refreshMemorySelection(
      state.memories,
      currentSelectedIds
    );

    // Update conversation
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, selectedMemoryIds: newSelectedIds, updatedAt: Date.now() }
          : c
      ),
    }));

    // Save metadata
    const updatedConv = state.conversations.find((c) => c.id === conversationId);
    if (updatedConv) {
      saveConversationMetadata({
        ...updatedConv,
        selectedMemoryIds: newSelectedIds,
        updatedAt: Date.now(),
      }).catch((e) => console.warn('[Store] Failed to save refreshed memories:', e));
    }
  },

  setEnableGoogleSearch: (enableGoogleSearch) => {
    set({ enableGoogleSearch });
    get().saveToStorage();
  },
  setEnableReasoning: (enableReasoning) => {
    set({ enableReasoning });
    get().saveToStorage();
  },
  setEnableGoogleSearchTool: (enableGoogleSearchTool) => {
    set({ enableGoogleSearchTool });
    get().saveToStorage();
  },
  setGoogleSearchApiKey: (googleSearchApiKey) => {
    set({ googleSearchApiKey });
    get().saveToStorage();
  },
  setEnableStreaming: (enableStreaming) => {
    set({ enableStreaming });
    get().saveToStorage();
  },

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

  setTheme: (theme) => {
    set({ theme });
    get().saveToStorage();
  },

  setHistoryDrawerOpen: (historyDrawerOpen) => set({ historyDrawerOpen }),

  toggleHistoryDrawer: () =>
    set((state) => ({ historyDrawerOpen: !state.historyDrawerOpen })),

  setShowSystemPromptEditor: (showSystemPromptEditor) => set({ showSystemPromptEditor }),

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
  setIsRenaming: (isRenaming) => set({ isRenaming }),

  setTokenUsage: (tokenUsage) => set({ tokenUsage }),

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

  // Preferences Actions
  setPreferences: (prefs) => {
    set((state) => ({
      preferences: { ...state.preferences, ...prefs },
    }));
    get().saveToStorage();
  },

  // Text Selection UI Actions
  setTextSelectionEnabled: (textSelectionEnabled) => {
    set({ textSelectionEnabled });
    get().saveToStorage();
    // Notify content scripts about the change
    chrome.storage.local.set({ textSelectionEnabled });
  },
  setTextSelectionMinLength: (textSelectionMinLength) => {
    set({ textSelectionMinLength });
    get().saveToStorage();
    // Notify content scripts about the change
    chrome.storage.local.set({ textSelectionMinLength });
  },
  addCustomQuickAction: (action) => {
    const newAction = { ...action, id: 'custom_' + Date.now(), createdAt: Date.now() };
    set((state) => ({ customQuickActions: [...state.customQuickActions, newAction] }));
    chrome.storage.local.set({ customQuickActions: get().customQuickActions });
  },
  updateCustomQuickAction: (id, updates) => {
    set((state) => ({
      customQuickActions: state.customQuickActions.map((a) => a.id === id ? { ...a, ...updates } : a),
    }));
    chrome.storage.local.set({ customQuickActions: get().customQuickActions });
  },
  removeCustomQuickAction: (id) => {
    set((state) => ({ customQuickActions: state.customQuickActions.filter((a) => a.id !== id) }));
    chrome.storage.local.set({ customQuickActions: get().customQuickActions });
  },
  setBuiltinActionOverride: (id, override) => {
    set((state) => {
      const existing = state.builtinActionOverrides[id] ?? {};
      const merged: Record<string, unknown> = { ...existing };
      // undefined values mean "remove this override field" (revert to default)
      for (const [key, val] of Object.entries(override)) {
        if (val === undefined) {
          delete merged[key];
        } else {
          merged[key] = val;
        }
      }
      merged.id = id;
      return {
        builtinActionOverrides: {
          ...state.builtinActionOverrides,
          [id]: merged as unknown as import('../types/index.ts').BuiltinActionOverride,
        },
      };
    });
    chrome.storage.local.set({ builtinActionOverrides: get().builtinActionOverrides });
  },
  resetBuiltinActionOverride: (id) => {
    set((state) => {
      const { [id]: _removed, ...rest } = state.builtinActionOverrides;
      return { builtinActionOverrides: rest };
    });
    chrome.storage.local.set({ builtinActionOverrides: get().builtinActionOverrides });
  },

  // Persistence
  loadFromStorage: async () => {
    // Run full migration asynchronously in the background
    migrateOldConversations().catch((e) => console.warn('[Store] Background migration error:', e));

    try {
      const data = await chrome.storage.local.get([
        'providerConfig',
        'providerKeys',
        'customProviders',
        'mcpServers',
        'activeConversationId',
        'memories',
        'memoryEnabled',
        'enableGoogleSearch',
        'enableReasoning',
        'enableGoogleSearchTool',
        'googleSearchApiKey',
        'enableStreaming',
        'security',
        'compactConfig',
        'theme',
        'preferences',
        'textSelectionEnabled',
        'textSelectionMinLength',
        'customQuickActions',
        'builtinActionOverrides',
        'fetchedModels'
      ]) as StorageData;

      const updates: Partial<AppState> = {};

      // Load and decrypt providerConfig
      if (data.providerConfig) {
        let config = { ...initialProviderConfig, ...data.providerConfig };
        // Migrate apiKey: encrypt if plaintext, decrypt if encrypted
        if (config.apiKey) {
          if (isEncrypted(config.apiKey)) {
            config.apiKey = await decryptApiKey(config.apiKey);
          } else {
            // Migrate plaintext to encrypted
            const encrypted = await encryptApiKey(config.apiKey);
            config.apiKey = encrypted;
            // Persist migration immediately
            chrome.storage.local.set({ providerConfig: config }).catch(() => {});
            // Keep decrypted version in memory
            config.apiKey = data.providerConfig.apiKey;
          }
        }
        updates.providerConfig = config;
      }
      // Load and decrypt providerKeys
      if (data.providerKeys) {
        let needsMigration = false;
        const decrypted: ProviderKeys = {};
        for (const [id, keyData] of Object.entries(data.providerKeys)) {
          if (keyData.apiKey) {
            if (isEncrypted(keyData.apiKey)) {
              decrypted[id] = { apiKey: await decryptApiKey(keyData.apiKey), model: keyData.model };
            } else {
              // Migrate plaintext to encrypted - keep plaintext in memory, will encrypt on save
              decrypted[id] = { apiKey: keyData.apiKey, model: keyData.model };
              needsMigration = true;
            }
          } else {
            decrypted[id] = keyData;
          }
        }
        updates.providerKeys = decrypted;
        if (needsMigration) {
          // Re-encrypt and persist migrated keys
          const encrypted: ProviderKeys = {};
          for (const [id, keyData] of Object.entries(data.providerKeys)) {
            encrypted[id] = {
              apiKey: keyData.apiKey ? (isEncrypted(keyData.apiKey) ? keyData.apiKey : await encryptApiKey(keyData.apiKey)) : '',
              model: keyData.model
            };
          }
          chrome.storage.local.set({ providerKeys: encrypted }).catch(() => {});
        }
      }
      // Load and decrypt customProviders
      if (data.customProviders) {
        let needsMigration = false;
        const decrypted = await Promise.all(
          data.customProviders.map(async (p) => {
            if (p.apiKey) {
              if (isEncrypted(p.apiKey)) {
                return { ...p, apiKey: await decryptApiKey(p.apiKey) };
              } else {
                needsMigration = true;
                return p; // Keep plaintext in memory
              }
            }
            return p;
          })
        );
        updates.customProviders = decrypted;
        if (needsMigration) {
          // Re-encrypt and persist migrated providers
          const encrypted = await Promise.all(
            data.customProviders.map(async (p) => ({
              ...p,
              apiKey: p.apiKey ? (isEncrypted(p.apiKey) ? p.apiKey : await encryptApiKey(p.apiKey)) : ''
            }))
          );
          chrome.storage.local.set({ customProviders: encrypted }).catch(() => {});
        }
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
      if (data.enableReasoning !== undefined) {
        updates.enableReasoning = data.enableReasoning;
      }
      if (data.enableGoogleSearchTool !== undefined) {
        updates.enableGoogleSearchTool = data.enableGoogleSearchTool;
      }
      // Load and decrypt googleSearchApiKey
      if (data.googleSearchApiKey !== undefined) {
        if (data.googleSearchApiKey && isEncrypted(data.googleSearchApiKey)) {
          updates.googleSearchApiKey = await decryptApiKey(data.googleSearchApiKey);
        } else if (data.googleSearchApiKey) {
          // Migrate plaintext to encrypted
          const encrypted = await encryptApiKey(data.googleSearchApiKey);
          chrome.storage.local.set({ googleSearchApiKey: encrypted }).catch(() => {});
          updates.googleSearchApiKey = data.googleSearchApiKey; // Keep plaintext in memory
        } else {
          updates.googleSearchApiKey = data.googleSearchApiKey;
        }
      }
      if (data.enableStreaming !== undefined) {
        updates.enableStreaming = data.enableStreaming;
      }
      if (data.security) {
        updates.security = data.security;
      }
      if (data.compactConfig) {
        updates.compactConfig = data.compactConfig;
      }
      if (data.theme) {
        updates.theme = data.theme;
      }
      if (data.preferences) {
        updates.preferences = data.preferences;
      }
      if (data.textSelectionEnabled !== undefined) {
        updates.textSelectionEnabled = data.textSelectionEnabled;
      }
      if (data.textSelectionMinLength !== undefined) {
        updates.textSelectionMinLength = data.textSelectionMinLength;
      }
      if (data.customQuickActions) {
        updates.customQuickActions = data.customQuickActions as any;
      }
      if (data.builtinActionOverrides) {
        updates.builtinActionOverrides = data.builtinActionOverrides as any;
      }
      if (data.fetchedModels) {
        updates.fetchedModels = data.fetchedModels as any;
      }

      // Load session auth state (persists during browser session)
      try {
        const sessionData = await chrome.storage.session.get('isAuthenticated') as { isAuthenticated?: boolean };
        if (sessionData.isAuthenticated !== undefined) {
          updates.isAuthenticated = sessionData.isAuthenticated;
        }
      } catch (e) {
        // storage.session might not be available in all contexts
      }

      // Load conversations from IndexedDB
      try {
        const metadataArray = await getAllConversationMetadata();
        if (metadataArray && metadataArray.length > 0) {
          updates.conversations = metadataArray;
        } else if (data.conversations) { // fallback
          updates.conversations = data.conversations;
        }
      } catch (e) {
        if (data.conversations) updates.conversations = data.conversations;
      }

      // Migrate legacy chatHistory or load active conversation
      const startOnWelcome = updates.preferences?.startOnWelcome ?? false;
      const legacyData = await chrome.storage.local.get(['chatHistory']) as { chatHistory?: Message[] };
      if (legacyData.chatHistory && legacyData.chatHistory.length > 0 && !updates.conversations) {
        // Migrate legacy data (always migrate regardless of startOnWelcome)
        const id = `conv_${Date.now()}`;
        const firstUserMsg = legacyData.chatHistory.find((m: Message) => m.role === 'user');
        const title = firstUserMsg
          ? (firstUserMsg.displayContent || firstUserMsg.content).slice(0, 50)
          : 'Imported Chat';
        const now = Date.now();

        const conv: Conversation = { id, title, createdAt: now, updatedAt: now };
        updates.conversations = [conv];
        if (!startOnWelcome) {
          updates.activeConversationId = id;
          updates.messages = legacyData.chatHistory;
        }

        await saveConversationMessages(id, legacyData.chatHistory);
        await saveConversationMetadata(conv);
        if (!startOnWelcome) {
          await chrome.storage.local.set({ activeConversationId: id });
        }
        await chrome.storage.local.remove('chatHistory');
      } else if (data.activeConversationId && !startOnWelcome) {
        updates.activeConversationId = data.activeConversationId;

        let messagesOrNull = await getConversationMessages(data.activeConversationId);
        let messages: Message[] = [];

        // Fallback/migrate from local storage if not found
        if (!messagesOrNull) {
          const convData = await chrome.storage.local.get(`conv_${data.activeConversationId}`) as Record<string, Message[] | undefined>;
          messages = convData[`conv_${data.activeConversationId}`] || [];
          if (messages.length > 0) {
            await saveConversationMessages(data.activeConversationId, messages);
            await chrome.storage.local.remove(`conv_${data.activeConversationId}`);
          }
        } else {
          messages = messagesOrNull;
        }

        if (messages.length > 0) {
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

      // Encrypt API keys before storing
      const encryptedProviderConfig = {
        ...state.providerConfig,
        apiKey: await encryptApiKey(state.providerConfig.apiKey),
      };

      // Encrypt all providerKeys
      const encryptedProviderKeys: ProviderKeys = {};
      for (const [id, data] of Object.entries(state.providerKeys)) {
        encryptedProviderKeys[id] = {
          apiKey: await encryptApiKey(data.apiKey),
          model: data.model,
        };
      }

      // Encrypt customProviders API keys
      const encryptedCustomProviders = await Promise.all(
        state.customProviders.map(async (p) => ({
          ...p,
          apiKey: await encryptApiKey(p.apiKey),
        }))
      );

      // Encrypt googleSearchApiKey
      const encryptedGoogleSearchApiKey = await encryptApiKey(state.googleSearchApiKey);

      await chrome.storage.local.set({
        providerConfig: encryptedProviderConfig,
        providerKeys: encryptedProviderKeys,
        customProviders: encryptedCustomProviders,
        mcpServers: state.mcpServers,
        enableGoogleSearch: state.enableGoogleSearch,
        enableReasoning: state.enableReasoning,
        enableGoogleSearchTool: state.enableGoogleSearchTool,
        googleSearchApiKey: encryptedGoogleSearchApiKey,
        enableStreaming: state.enableStreaming,
        // Jika aktif kosong, simpan null agar saat reload tidak coba load conversation ini
        activeConversationId: activeIsEmpty ? null : state.activeConversationId,
        memories: state.memories,
        memoryEnabled: state.memoryEnabled,
        security: state.security,
        compactConfig: state.compactConfig,
        theme: state.theme,
        preferences: state.preferences,
        textSelectionEnabled: state.textSelectionEnabled,
        textSelectionMinLength: state.textSelectionMinLength,
        customQuickActions: state.customQuickActions,
        builtinActionOverrides: state.builtinActionOverrides,
        fetchedModels: state.fetchedModels,
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

      await saveConversationMessages(convId, messagesToSave);

      // Extract markdown images and update conversation metadata
      const MD_IMAGE_REGEX = /!\[.*?\]\((https?:\/\/[^)\s]+)\)/g;
      const mdImages = new Set<string>();
      messagesToSave.forEach((m) => {
        if (m.content) {
          let match;
          MD_IMAGE_REGEX.lastIndex = 0;
          while ((match = MD_IMAGE_REGEX.exec(m.content)) !== null) {
            mdImages.add(match[1]);
          }
        }
      });

      const newMdImages = Array.from(mdImages);
      set((s) => {
        const conv = s.conversations.find((c) => c.id === convId);
        if (conv) {
          // Update only if it changed
          if (JSON.stringify(conv.markdownImages || []) !== JSON.stringify(newMdImages)) {
            const updatedConv = { ...conv, markdownImages: newMdImages };
            saveConversationMetadata(updatedConv).catch((e) => console.warn(e));
            return {
              conversations: s.conversations.map((c) => (c.id === convId ? updatedConv : c)),
            };
          }
        }
        return s;
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
        await saveConversationMetadata(conv);
      }
    } catch (e) {
      console.warn('Failed to update conversation timestamp:', e);
    }
  },
}));
