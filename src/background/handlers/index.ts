/**
 * Handlers Index - Exports all message handlers
 * @module background/handlers
 */

// Chat handlers
export {
  handleChatRequest,
  handleStopStream,
  handleGoogleSearchToolDirect,
  chatService,
} from './chat.handler';

// MCP handlers
export {
  handleMCPConnect,
  handleMCPDisconnect,
  handleMCPListTools,
  handleMCPToolCall,
  restoreMCPServers,
  registerMCPHandlers,
  mcpManager,
} from './mcp.handler';

// Memory handlers
export { handleMemoryExtract, registerMemoryHandlers } from './memory.handler';

// Title handlers
export { handleTitleGenerate, registerTitleHandlers } from './title.handler';

// Models handlers
export { handleFetchModels, registerModelsHandlers } from './models.handler';

// Content handlers
export {
  handleGetPageContent,
  handleGetSelectedText,
  registerContentHandlers,
} from './content.handler';
