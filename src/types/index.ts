// ==================== Message Types ====================

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  status: 'success' | 'error';
}

export interface Attachment {
  type: 'image' | 'text' | 'pdf';
  name: string;
  data: string;
}

export interface GeneratedImage {
  mimeType: string;
  data: string;
  imageRef?: string; // IndexedDB key, ada saat loaded dari storage sebelum hydration
}

export interface StoredImageRecord {
  key: string;             // Format: img_{conversationId}_{msgIndex}_{imgIndex}
  conversationId: string;
  messageIndex: number;
  imageIndex: number;
  mimeType: string;
  data: string;
  createdAt: number;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error';
  content: string;
  displayContent?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  attachments?: Attachment[];
  groundingMetadata?: GroundingMetadata;
  pageContext?: PageContext;
  selectedText?: SelectedText;
  // For tool role messages
  toolCallId?: string;
  name?: string;
  toolArguments?: Record<string, unknown>;
  generatedImages?: GeneratedImage[];
  isCompacted?: boolean;
  summary?: string;
  condenseId?: string;
  condenseParent?: string;
  isCachedResult?: boolean;
  // Reasoning/thinking content
  reasoningContent?: string;
}

export type MessageContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

export interface APIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: MessageContent;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface GroundingChunk {
  web?: {
    uri: string;
    title?: string;
  };
}

export interface GroundingSupport {
  segment?: {
    startIndex?: number;
    endIndex?: number;
    text?: string;
  };
  groundingChunkIndices?: number[];
}

export interface GroundingMetadata {
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  webSearchQueries?: string[];
}

// ==================== Context Types ====================

export interface PageContext {
  pageTitle: string;
  pageUrl: string;
  content: string;
  metaDescription?: string;
}

export interface SelectedText {
  selectedText: string;
  pageTitle: string;
  pageUrl: string;
}

// ==================== Provider Types ====================

export type ProviderFormat = 'openai' | 'anthropic' | 'gemini';

export interface ProviderPreset {
  id: string;
  name: string;
  apiUrl: string;
  defaultModel: string;
  format: ProviderFormat;
  models?: string[];
  staticModels?: string[];
  supportsModelFetch?: boolean;
  contextWindow?: number;
}

export interface CustomProvider {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  model: string;
  defaultModel: string;
  format: ProviderFormat;
  models: string[];
  staticModels?: string[];
  supportsModelFetch?: boolean;
  contextWindow?: number;
}

export interface ProviderConfig {
  providerId: string;
  apiKey: string;
  apiUrl: string;
  model: string;
  format: ProviderFormat;
  systemPrompt: string;
  contextWindow?: number; // Custom context window limit
}

export interface CompactConfig {
  enabled: boolean; // Auto-compact toggle (default true)
  threshold: number; // 0.0 to 1.0 (default 0.9)
  defaultContextWindow: number; // default 128000
  prompt: string; // Custom compact prompt (empty = use default)
}

export interface ProviderKeys {
  [providerId: string]: {
    apiKey: string;
    model: string;
  };
}

// ==================== MCP Types ====================

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
  connected?: boolean;
  enabled?: boolean;
  toolCount?: number;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  _serverId?: string;
}

// ==================== Memory Types ====================

export type MemoryCategory = 'style' | 'interests' | 'expertise' | 'preferences' | 'personal' | 'goals' | 'context' | 'habits' | 'dislikes';

export interface Memory {
  id: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  source: string;
  createdAt: number;
  updatedAt: number;
}

// ==================== Conversation Types ====================

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  branchedFromId?: string;
  pinned?: boolean;
  systemPrompt?: string;
  markdownImages?: string[];
}

// ==================== File Attachment Types ====================

export interface FileAttachment {
  id: string;
  file: File;
  type: 'image' | 'text' | 'pdf' | 'error';
  name: string;
  data?: string;
  width?: number;
  height?: number;
  error?: string;
}

// ==================== Fetched Models Cache ====================

export interface FetchedModelsCache {
  models: string[];
  fetchedAt: number;
}

// ==================== Security Settings ====================

export interface SecuritySettings {
  isLockEnabled: boolean;
  passwordHash: string | null;
}

// ==================== App State ====================

export interface AppState {
  // Messages
  messages: Message[];
  isStreaming: boolean;
  currentRequestId: string | null;
  streamingContent: string;
  streamingReasoningContent: string;

  // Context
  pageContext: PageContext | null;
  selectedText: SelectedText | null;

  // Provider
  providerConfig: ProviderConfig;
  providerKeys: ProviderKeys;
  customProviders: CustomProvider[];
  showCustomModel: boolean;
  fetchedModels: Record<string, FetchedModelsCache>;
  fetchingModels: boolean;

  // MCP
  mcpServers: MCPServer[];

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;

  // Memory
  memories: Memory[];
  memoryEnabled: boolean;

  // Gemini options
  enableGoogleSearch: boolean;

  // Reasoning options
  enableReasoning: boolean;

  // Google Search Tool (for non-Gemini providers)
  enableGoogleSearchTool: boolean;
  googleSearchApiKey: string;

  // File attachments
  attachments: FileAttachment[];

  // Quote
  quotedText: string | null;

  // Auto Compact
  compactConfig: CompactConfig;
  isCompacting: boolean;

  // Token Usage (for auto-compact)
  tokenUsage: TokenUsageType | null;

  // UI State
  view: 'chat' | 'settings' | 'gallery';
  theme: 'light' | 'dark';
  historyDrawerOpen: boolean;
  settingsSection: string | null;
  showSystemPromptEditor: boolean;

  // Security
  security: SecuritySettings;
  isAuthenticated: boolean;

  // Actions
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  setIsStreaming: (isStreaming: boolean) => void;
  setCurrentRequestId: (requestId: string | null) => void;
  setStreamingContent: (content: string) => void;
  setStreamingReasoningContent: (content: string) => void;

  setPageContext: (context: PageContext | null) => void;
  setSelectedText: (text: SelectedText | null) => void;

  setProviderConfig: (config: Partial<ProviderConfig>) => void;
  setProviderKeys: (keys: ProviderKeys) => void;
  addCustomProvider: (provider: CustomProvider) => void;
  removeCustomProvider: (id: string) => void;
  updateCustomProvider: (id: string, updates: Partial<CustomProvider>) => void;
  setShowCustomModel: (show: boolean) => void;
  setFetchedModels: (providerId: string, models: FetchedModelsCache) => void;
  setFetchingModels: (fetching: boolean) => void;

  addMCPServer: (server: MCPServer) => void;
  removeMCPServer: (id: string) => void;
  updateMCPServer: (id: string, updates: Partial<MCPServer>) => void;
  toggleMCPServer: (id: string, enabled: boolean) => void;

  createConversation: (opts?: { title?: string; branchedFromId?: string }) => Conversation;
  switchConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
  updateConversationSystemPrompt: (id: string, prompt: string) => void;
  setActiveConversationId: (id: string | null) => void;

  addMemory: (memory: Memory) => void;
  removeMemory: (id: string) => void;
  updateMemory: (id: string, updates: Partial<Memory>) => void;
  setMemoryEnabled: (enabled: boolean) => void;
  clearMemories: () => void;

  setEnableGoogleSearch: (enabled: boolean) => void;
  setEnableReasoning: (enabled: boolean) => void;
  setEnableGoogleSearchTool: (enabled: boolean) => void;
  setGoogleSearchApiKey: (key: string) => void;

  addAttachment: (attachment: FileAttachment) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  setQuotedText: (text: string | null) => void;

  setView: (view: 'chat' | 'settings' | 'gallery') => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setHistoryDrawerOpen: (open: boolean) => void;
  toggleHistoryDrawer: () => void;
  setShowSystemPromptEditor: (show: boolean) => void;

  // Security Actions
  setSecurity: (security: Partial<SecuritySettings>) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  authenticate: (password: string) => Promise<boolean>;
  lock: () => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  saveActiveConversation: () => Promise<void>;
  updateConversationTimestamp: () => Promise<void>;

  // Auto Compact Actions
  setCompactConfig: (config: Partial<CompactConfig>) => void;
  setIsCompacting: (isCompacting: boolean) => void;
  compactConversation: (id: string) => Promise<void>;

  // Token Usage Actions
  setTokenUsage: (usage: TokenUsageType | null) => void;
}

// ==================== Constants ====================

export const MEMORY_CATEGORIES: MemoryCategory[] = ['personal', 'goals', 'interests', 'expertise', 'preferences', 'style', 'habits', 'context', 'dislikes'];

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  personal: '👤 Personal Info',
  goals: '🎯 Goals & Objectives',
  interests: '💡 Interests & Topics',
  expertise: '🧠 Expertise & Skills',
  preferences: '⚙️ Preferences',
  style: '🎨 Communication Style',
  habits: '🔄 Habits & Patterns',
  context: '📍 Context & Background',
  dislikes: '❌ Dislikes & Avoid',
};

export const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
export const MAX_IMAGE_DIMENSION = 1024;

export const ALLOWED_FILE_TYPES: Record<string, 'image' | 'text' | 'pdf'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'text/plain': 'text',
  'text/csv': 'text',
  'application/pdf': 'pdf',
};

// ==================== Token Usage Types ====================

// Import for use in AppState
import type { TokenUsage as TokenUsageType } from '../providers/types.ts';

/**
 * Token usage metadata from API responses
 * Re-exported from providers for convenience
 */
export type { TokenUsage } from '../providers/types.ts';
