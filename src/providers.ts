// LLM Provider abstraction layer
// Each provider knows how to format requests and parse streaming responses

import type { ProviderPreset, Message, MCPTool } from './types/index.ts';

// Gemini models that do not support function calling or google search
export const GEMINI_NO_TOOLS_MODELS = ['gemini-2.5-flash-image'];
// Gemini models that support google search but not function calling
export const GEMINI_SEARCH_ONLY_MODELS = ['gemini-3-pro-image-preview'];
// Gemini image generation models that support aspect ratio selection
export const GEMINI_IMAGE_MODELS = ['gemini-2.5-flash-image', 'gemini-3-pro-image-preview'];
// xAI image generation models
export const XAI_IMAGE_MODELS = ['grok-2-image-1212', 'grok-imagine-image', 'grok-imagine-image-pro'];

// Models that support reasoning/thinking capabilities
// Note: For Anthropic, ALL Claude models support extended thinking
// For other providers, we check specific model patterns
export const REASONING_MODELS = {
  anthropic: ['claude', 'claude-sonnet', 'claude-opus', 'claude-haiku', 'glm'], // All Claude models + GLM models
  openai: ['o1', 'o3'], // o1-preview, o1-mini, o3-mini, o3
  gemini: ['thinking', 'gemini-2.5-pro'], // Thinking models
  deepseek: ['reasoner', 'r1'], // deepseek-reasoner, deepseek-r1
  xai: ['grok'], // Grok models have reasoning
};

// Helper to check if a model supports reasoning
export function supportsReasoning(providerId: string, model: string): boolean {
  const providerModels = REASONING_MODELS[providerId as keyof typeof REASONING_MODELS];
  if (!providerModels) return false;

  const modelLower = model.toLowerCase();
  return providerModels.some(m => modelLower.includes(m.toLowerCase()));
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    format: 'anthropic',
    models: [],
    supportsModelFetch: false,
    staticModels: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    format: 'gemini',
    models: [],
    supportsModelFetch: true,
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    apiUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4-1-fast-non-reasoning',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
    staticModels: ['grok-4-1-fast-non-reasoning', 'grok-2-image-1212', 'grok-imagine-image', 'grok-imagine-image-pro'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    apiUrl: '',
    defaultModel: '',
    format: 'openai',
    models: [],
    supportsModelFetch: false,
  },
};

export interface ChatOptions {
  enableGoogleSearch?: boolean;
  aspectRatio?: string;
  stream?: boolean;
  enableReasoning?: boolean;
}

export async function fetchModels(provider: ProviderPreset & { apiKey?: string }): Promise<{ models?: string[]; error?: string }> {
  const { format, apiUrl, apiKey } = provider;

  if (!apiKey) {
    return { error: 'API key required' };
  }

  try {
    switch (format) {
      case 'openai':
        return await fetchOpenAIModels(apiUrl, apiKey);
      case 'anthropic':
        return { models: PROVIDER_PRESETS.anthropic.staticModels || [] };
      case 'gemini':
        return await fetchGeminiModels(apiUrl, apiKey);
      default:
        return await fetchOpenAIModels(apiUrl, apiKey);
    }
  } catch (e) {
    return { error: (e as Error).message };
  }
}

async function fetchOpenAIModels(apiUrl: string, apiKey: string): Promise<{ models: string[] }> {
  let baseUrl = apiUrl.replace(/\/+$/, '');
  if (baseUrl.endsWith('/chat/completions')) {
    baseUrl = baseUrl.slice(0, -'/chat/completions'.length);
  }

  const url = `${baseUrl}/models`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  const models = (data.data || [])
    .map((m: { id: string }) => m.id)
    .filter((id: string) => {
      const excludePatterns = [
        /embedding/i,
        /tts/i,
        /whisper/i,
        /dall-e/i,
        /dall/i,
        /moderation/i,
        /audio/i,
        /realtime/i,
      ];
      return !excludePatterns.some(p => p.test(id));
    })
    .sort((a: string, b: string) => a.localeCompare(b));

  return { models };
}

async function fetchGeminiModels(apiUrl: string, apiKey: string): Promise<{ models: string[] }> {
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/models?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  const models = (data.models || [])
    .filter((m: { supportedGenerationMethods?: string[] }) => {
      const supportedMethods = m.supportedGenerationMethods || [];
      return supportedMethods.includes('generateContent');
    })
    .map((m: { name?: string }) => {
      const name = m.name || '';
      return name.replace(/^models\//, '');
    })
    .filter((name: string) => name)
    .sort((a: string, b: string) => a.localeCompare(b));

  return { models };
}

interface RequestConfig {
  url: string;
  options: RequestInit;
}

export function formatRequest(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  tools: MCPTool[] = [],
  options: ChatOptions = {}
): RequestConfig {
  // xAI image generation uses a separate non-streaming endpoint
  if (provider.id === 'xai' && XAI_IMAGE_MODELS.includes(provider.model || '')) {
    return formatXAIImageRequest(provider, messages, options);
  }

  const { format } = provider;

  switch (format) {
    case 'openai':
      return formatOpenAI(provider, messages, tools, options);
    case 'anthropic':
      return formatAnthropic(provider, messages, tools, options);
    case 'gemini':
      return formatGemini(provider, messages, tools, options);
    default:
      return formatOpenAI(provider, messages, tools, options);
  }
}

function formatXAIImageRequest(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  options: ChatOptions
): RequestConfig {
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const rawContent = lastUserMessage?.content as unknown;
  let prompt = '';
  let imageUrl: string | undefined;
  if (typeof rawContent === 'string') {
    prompt = rawContent;
  } else if (Array.isArray(rawContent)) {
    const items = rawContent as Array<{ type: string; text?: string; image_url?: { url: string } }>;
    prompt = items
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text)
      .join(' ');
    const imageItem = items.find((item) => item.type === 'image_url' && item.image_url?.url);
    if (imageItem) {
      imageUrl = imageItem.image_url!.url;
    }
  }

  const body: Record<string, unknown> = {
    model: provider.model || 'grok-imagine-image',
    prompt,
    n: 1,
    response_format: 'b64_json',
  };

  if (imageUrl) {
    body.image = { url: imageUrl, type: 'image_url' };
  }

  if (options.aspectRatio) {
    body.aspect_ratio = options.aspectRatio;
  }

  const url = `${provider.apiUrl.replace(/\/+$/, '')}/images/generations`;

  return {
    url,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  };
}

function formatOpenAI(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  tools: MCPTool[],
  _options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;

  const processedMessages = messages.map(msg => {
    // Transform assistant messages with tool calls to OpenAI format
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: tc.arguments || '{}',
          },
        })),
      };
    }
    // Transform tool result messages to OpenAI format
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };
    }
    return msg;
  });

  const body: Record<string, unknown> = {
    model,
    messages: processedMessages,
    stream: _options.stream !== false,
  };

  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: cleanSchema(t.inputSchema) },
    }));
  }

  let url = provider.apiUrl;
  if (!url.endsWith('/chat/completions')) {
    url = url.replace(/\/+$/, '') + '/chat/completions';
  }

  return {
    url,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    },
  };
}

function formatAnthropic(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  tools: MCPTool[],
  _options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;
  let system = '';
  const filtered: Record<string, unknown>[] = [];

  // Check if reasoning is enabled and model supports it
  const shouldEnableReasoning = _options.enableReasoning && supportsReasoning('anthropic', model);
  console.log('[formatAnthropic] enableReasoning:', _options.enableReasoning, 'model:', model, 'shouldEnableReasoning:', shouldEnableReasoning);

  // First pass: batch consecutive tool results together
  // Anthropic expects all tool results in a single user message
  const batchedMessages: (Message | { role: 'tool_batch'; tools: Message[] })[] = [];
  let toolBatch: Message[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      toolBatch.push(msg);
    } else {
      // Flush any pending tool batch
      if (toolBatch.length > 0) {
        batchedMessages.push({ role: 'tool_batch', tools: toolBatch });
        toolBatch = [];
      }
      batchedMessages.push(msg);
    }
  }
  // Flush remaining tool batch
  if (toolBatch.length > 0) {
    batchedMessages.push({ role: 'tool_batch', tools: toolBatch });
  }

  // Second pass: format messages for Anthropic API
  for (const msg of batchedMessages) {
    if ('role' in msg && msg.role === 'tool_batch') {
      // Batch all tool results into a single user message
      const toolResults = (msg as { tools: Message[] }).tools;
      const content: Record<string, unknown>[] = toolResults.map((t) => ({
        type: 'tool_result',
        tool_use_id: t.toolCallId,
        content: typeof t.content === 'string' ? t.content : JSON.stringify(t.content),
        is_error: t.content?.startsWith('Error:') || t.content?.includes('[DUPLICATE_CALL_SKIPPED]'),
      }));
      filtered.push({ role: 'user', content });
    } else if ((msg as Message).role === 'system') {
      system += (system ? '\n' : '') + (msg as Message).content;
    } else if ((msg as Message).role === 'assistant' && (msg as Message).toolCalls && (msg as Message).toolCalls!.length > 0) {
      // Transform assistant messages with tool calls to Anthropic format
      const content: Record<string, unknown>[] = [];
      if ((msg as Message).content) {
        content.push({ type: 'text', text: (msg as Message).content });
      }
      for (const tc of (msg as Message).toolCalls!) {
        let input = {};
        try {
          input = JSON.parse(tc.arguments || '{}');
        } catch {
          input = {};
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input,
        });
      }
      filtered.push({ role: 'assistant', content });
    } else if ((msg as Message).role && Array.isArray((msg as Message).content)) {
      const m = msg as Message;
      // Convert OpenAI-style image_url format to Anthropic format
      const anthropicContent: Record<string, unknown>[] = [];
      const contentArray = m.content as unknown as Array<{ type: string; text?: string; image_url?: { url: string } }>;
      for (const part of contentArray) {
        if (part.type === 'text' && part.text) {
          anthropicContent.push({ type: 'text', text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            // Base64 data URL: data:image/jpeg;base64,....
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              anthropicContent.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: match[1],
                  data: match[2],
                },
              });
            }
          } else {
            // Regular URL
            anthropicContent.push({
              type: 'image',
              source: {
                type: 'url',
                url,
              },
            });
          }
        }
      }
      filtered.push({ role: m.role, content: anthropicContent });
    } else if ((msg as Message).role) {
      // Regular message (user or assistant without tool calls)
      const m = msg as Message;
      filtered.push({ role: m.role, content: m.content });
    }
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: _options.stream !== false,
    messages: filtered,
  };

  // Add thinking parameter for Anthropic models when reasoning is enabled
  if (shouldEnableReasoning) {
    body.thinking = {
      type: 'enabled',
      budget_tokens: 4096, // Minimum recommended for meaningful thinking
    };
  }

  if (system) body.system = system;
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));
  }

  let url = provider.apiUrl;
  if (!url.endsWith('/v1/messages') && !url.endsWith('/messages')) {
    url = url.replace(/\/+$/, '') + '/v1/messages';
  }

  return {
    url,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey || '',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    },
  };
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  inlineData?: { mimeType: string; data: string };
  functionResponse?: { name: string; response: unknown };
}

interface GeminiContent {
  role: string;
  parts: GeminiPart[];
}

function formatGemini(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  tools: MCPTool[],
  options: ChatOptions
): RequestConfig {
  let systemInstruction = '';
  const contents: GeminiContent[] = [];

  const model = provider.model || provider.defaultModel;
  const shouldEnableReasoning = options.enableReasoning && supportsReasoning('gemini', model);

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          let args = {};
          try {
            args = JSON.parse(tc.arguments || '{}');
          } catch {
            args = {};
          }
          parts.push({
            functionCall: {
              name: tc.name,
              args,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name || 'unknown',
              response: typeof msg.content === 'string'
                ? { result: msg.content }
                : msg.content,
            },
          },
        ],
      });
    } else if (msg.role === 'user' && Array.isArray(msg.content)) {
      const parts: GeminiPart[] = [];
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url') {
          const imageUrl = item.image_url?.url || item.image_url;
          if (imageUrl) {
            const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const [, mimeType, base64Data] = match;
              parts.push({
                inlineData: {
                  mimeType,
                  data: base64Data,
                },
              });
            }
          }
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'user', parts });
      }
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const body: Record<string, unknown> = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Add thinking config for Gemini thinking models when reasoning is enabled
  if (shouldEnableReasoning) {
    body.generationConfig = {
      ...(body.generationConfig as Record<string, unknown> || {}),
      thinkingConfig: {
        thinkingBudget: 24576, // Allow up to 24k tokens for thinking
      },
    };
  }

  // Add aspect ratio for Gemini image generation models
  // Supported ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9
  if (options.aspectRatio && GEMINI_IMAGE_MODELS.includes(model)) {
    const aspectRatioMap: Record<string, string> = {
      '1:1': '1:1',
      '16:9': '16:9',
      '9:16': '9:16',
      '4:3': '4:3',
      '3:4': '3:4',
      '3:2': '3:2',
      '2:3': '2:3',
      '4:5': '4:5',
      '5:4': '5:4',
      '21:9': '21:9',
    };
    const geminiAspectRatio = aspectRatioMap[options.aspectRatio];
    if (geminiAspectRatio) {
      const existingConfig = (body.generationConfig as Record<string, unknown>) || {};
      body.generationConfig = {
        ...existingConfig,
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: {
          ...(existingConfig.imageConfig as Record<string, unknown> || {}),
          aspectRatio: geminiAspectRatio,
        },
      };
    }
  }

  const supportsGoogleSearch = !GEMINI_NO_TOOLS_MODELS.includes(model);
  const supportsFunctionCalling = !GEMINI_NO_TOOLS_MODELS.includes(model) && !GEMINI_SEARCH_ONLY_MODELS.includes(model);

  const geminiTools: Record<string, unknown>[] = [];

  if (options.enableGoogleSearch && supportsGoogleSearch) {
    geminiTools.push({ google_search: {} });
  } else if (tools.length > 0 && supportsFunctionCalling) {
    geminiTools.push({
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: cleanSchema(convertToGeminiSchema(t.inputSchema)),
      })),
    });
  }

  if (geminiTools.length > 0) {
    body.tools = geminiTools;
  }

  const isStreaming = options.stream !== false;
  const baseUrl = provider.apiUrl.replace(/\/+$/, '');
  let url: string;
  if (baseUrl.includes('/models/')) {
    url = `${baseUrl}?${isStreaming ? 'alt=sse&' : ''}key=${provider.apiKey}`;
  } else {
    const method = isStreaming ? ':streamGenerateContent' : ':generateContent';
    url = `${baseUrl}/models/${model}${method}?${isStreaming ? 'alt=sse&' : ''}key=${provider.apiKey}`;
  }

  return {
    url,
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  };
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_call_start' | 'tool_call_delta' | 'grounding_metadata' | 'image' | 'error' | 'reasoning';
  content?: string;
  id?: string;
  index?: number;
  name?: string;
  arguments?: string;
  groundingMetadata?: unknown;
  mimeType?: string;
  imageData?: string;
}

function cleanSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Deep clone
  const cleaned = JSON.parse(JSON.stringify(schema));

  const removeIncompatible = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    // Remove additionalProperties: false as it often breaks custom providers
    // only if it's explicitly false.
    if (obj.additionalProperties === false) {
      delete obj.additionalProperties;
    }

    // Recursively clean properties
    if (obj.properties) {
      for (const key in obj.properties) {
        removeIncompatible(obj.properties[key]);
      }
    }

    if (obj.items) {
      removeIncompatible(obj.items);
    }
  };

  removeIncompatible(cleaned);
  return cleaned;
}

export async function* parseXAIImageResponse(response: Response): AsyncGenerator<StreamChunk> {
  const data = await response.json();
  for (const item of data.data || []) {
    if (item.b64_json) {
      yield {
        type: 'image',
        mimeType: 'image/jpeg',
        imageData: item.b64_json,
      };
    }
  }
}

export async function* parseStream(provider: ProviderPreset, response: Response, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  switch (provider.format) {
    case 'openai':
      yield* parseOpenAIStream(response, signal);
      break;
    case 'anthropic':
      yield* parseAnthropicStream(response, signal);
      break;
    case 'gemini':
      yield* parseGeminiStream(response, signal);
      break;
    default:
      yield* parseOpenAIStream(response, signal);
  }
}

async function* parseOpenAIStream(response: Response, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      // Check for abort before each read
      if (signal?.aborted) {
        try { reader.cancel(); } catch {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;

      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          yield { type: 'text', content: delta.content };
        }
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            yield {
              type: 'tool_call',
              id: tc.id,
              index: tc.index,
              name: tc.function?.name,
              arguments: tc.function?.arguments,
            };
          }
        }
      } catch {
        // skip malformed JSON
      }
    }
  }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function* parseAnthropicStream(response: Response, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      // Check for abort before each read
      if (signal?.aborted) {
        try { reader.cancel(); } catch {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const json = JSON.parse(data);
          if (json.type === 'content_block_delta') {
            if (json.delta?.type === 'text_delta') {
              yield { type: 'text', content: json.delta.text };
            }
            if (json.delta?.type === 'thinking_delta') {
              yield { type: 'reasoning', content: json.delta.thinking };
            }
            if (json.delta?.type === 'input_json_delta') {
              yield { type: 'tool_call_delta', content: json.delta.partial_json };
            }
          }
          if (json.type === 'content_block_start') {
            if (json.content_block?.type === 'tool_use') {
              yield {
                type: 'tool_call_start',
                id: json.content_block.id,
                name: json.content_block.name,
              };
            }
            // Note: thinking blocks start with type: "thinking" but content comes in deltas
          }
          if (json.type === 'message_stop') return;
        } catch {
          // skip
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

async function* parseGeminiStream(response: Response, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      // Check for abort before each read
      if (signal?.aborted) {
        try { reader.cancel(); } catch {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const json = JSON.parse(data);
          const candidates = json.candidates;
          if (!candidates) continue;

          for (const candidate of candidates) {
            // Check for finishReason indicating image generation failure
            if (candidate.finishReason === 'IMAGE_SAFETY' || candidate.finishReason === 'IMAGE_OTHER') {
              const defaultMessage = candidate.finishReason === 'IMAGE_SAFETY'
                ? 'Unable to show the generated image. The image was filtered due to safety policies.'
                : 'Unable to show the generated image. The model could not generate the image based on the prompt provided.';
              const errorMessage = candidate.finishMessage || defaultMessage;
              yield { type: 'error', content: errorMessage };
              continue;
            }

            const parts = candidate.content?.parts;
            if (!parts) continue;
            for (const part of parts) {
              // Handle thinking/reasoning content from Gemini thinking models
              if (part.thought && part.text) {
                yield { type: 'reasoning', content: part.text };
              }
              if (part.text && !part.thought) {
                yield { type: 'text', content: part.text };
              }
              if (part.functionCall) {
                yield {
                  type: 'tool_call',
                  name: part.functionCall.name,
                  arguments: JSON.stringify(part.functionCall.args),
                };
              }
              if (part.inlineData && !part.thought) {
                yield {
                  type: 'image',
                  mimeType: part.inlineData.mimeType,
                  imageData: part.inlineData.data,
                };
              }
            }
          }

          const groundingMetadata = candidates[0]?.groundingMetadata;
          if (groundingMetadata) {
            yield { type: 'grounding_metadata', groundingMetadata };
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

function convertToGeminiSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} };
  }

  const converted = JSON.parse(JSON.stringify(schema));

  delete converted.$schema;
  delete converted.$ref;
  delete converted.$id;
  delete converted.$comment;
  delete converted.additionalItems;
  delete converted.default;
  delete converted.examples;
  delete converted.format;
  delete converted.additionalProperties;

  if (converted.properties && Object.keys(converted.properties).length === 0) {
    delete converted.properties;
  }

  if (!converted.type) {
    if (converted.properties) {
      converted.type = 'object';
    } else if (converted.items) {
      converted.type = 'array';
    } else {
      converted.type = 'string';
    }
  }

  if (converted.properties && typeof converted.properties === 'object') {
    for (const key of Object.keys(converted.properties)) {
      converted.properties[key] = convertToGeminiSchema(converted.properties[key]);
    }
  }

  if (converted.items) {
    converted.items = convertToGeminiSchema(converted.items);
  }

  if (converted.oneOf) {
    converted.anyOf = converted.oneOf;
    delete converted.oneOf;
  }

  if (converted.allOf) {
    const merged: Record<string, unknown> = { type: 'object', properties: {}, required: [] as string[] };
    for (const sub of converted.allOf as unknown[]) {
      const subSchema = convertToGeminiSchema(sub);
      if (subSchema.properties) {
        Object.assign(merged.properties as Record<string, unknown>, subSchema.properties);
      }
      if (subSchema.required) {
        (merged.required as string[]).push(...(subSchema.required as string[]));
      }
    }
    if ((merged.required as string[]).length === 0) {
      delete merged.required;
    }
    return merged;
  }

  if (converted.anyOf && Array.isArray(converted.anyOf)) {
    converted.anyOf = converted.anyOf.map((s: unknown) => convertToGeminiSchema(s));
  }

  if (converted.required && Array.isArray(converted.required) && converted.required.length === 0) {
    delete (converted as Record<string, unknown>).required;
  }
  if (converted.enum && Array.isArray(converted.enum) && converted.enum.length === 0) {
    delete (converted as Record<string, unknown>).enum;
  }

  return converted;
}
