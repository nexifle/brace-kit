// LLM Provider abstraction layer
// Each provider knows how to format requests and parse streaming responses

import type { ProviderFormat, Message, MCPTool } from './types/index.ts';

export interface ProviderPreset {
  id: string;
  name: string;
  apiUrl: string;
  defaultModel: string;
  format: ProviderFormat;
  models?: string[];
  staticModels?: string[];
  supportsModelFetch?: boolean;
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
    defaultModel: 'grok-2',
    format: 'openai',
    models: [],
    supportsModelFetch: true,
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

function formatOpenAI(
  provider: ProviderPreset & { apiKey?: string; model?: string },
  messages: Message[],
  tools: MCPTool[],
  _options: ChatOptions
): RequestConfig {
  const model = provider.model || provider.defaultModel;

  const processedMessages = messages.map(msg => {
    if (Array.isArray(msg.content)) {
      return msg;
    }
    return msg;
  });

  const body: Record<string, unknown> = {
    model,
    messages: processedMessages,
    stream: true,
  };

  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
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
  const filtered = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n' : '') + msg.content;
    } else {
      filtered.push(msg);
    }
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: 8192,
    stream: true,
    messages: filtered,
  };

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
              name: msg.toolCallId || 'unknown',
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

  const geminiTools: Record<string, unknown>[] = [];

  if (options.enableGoogleSearch) {
    geminiTools.push({ google_search: {} });
  } else if (tools.length > 0) {
    geminiTools.push({
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: convertToGeminiSchema(t.inputSchema),
      })),
    });
  }

  if (geminiTools.length > 0) {
    body.tools = geminiTools;
  }

  const baseUrl = provider.apiUrl.replace(/\/+$/, '');
  const model = provider.model || provider.defaultModel;
  let url: string;
  if (baseUrl.includes('/models/')) {
    url = `${baseUrl}?alt=sse&key=${provider.apiKey}`;
  } else {
    url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${provider.apiKey}`;
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
  type: 'text' | 'tool_call' | 'tool_call_start' | 'tool_call_delta' | 'grounding_metadata';
  content?: string;
  id?: string;
  index?: number;
  name?: string;
  arguments?: string;
  groundingMetadata?: unknown;
}

export async function* parseStream(provider: ProviderPreset, response: Response): AsyncGenerator<StreamChunk> {
  switch (provider.format) {
    case 'openai':
      yield* parseOpenAIStream(response);
      break;
    case 'anthropic':
      yield* parseAnthropicStream(response);
      break;
    case 'gemini':
      yield* parseGeminiStream(response);
      break;
    default:
      yield* parseOpenAIStream(response);
  }
}

async function* parseOpenAIStream(response: Response): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
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
}

async function* parseAnthropicStream(response: Response): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
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
          if (json.delta?.type === 'input_json_delta') {
            yield { type: 'tool_call_delta', content: json.delta.partial_json };
          }
        }
        if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
          yield {
            type: 'tool_call_start',
            id: json.content_block.id,
            name: json.content_block.name,
          };
        }
        if (json.type === 'message_stop') return;
      } catch {
        // skip
      }
    }
  }
}

async function* parseGeminiStream(response: Response): AsyncGenerator<StreamChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
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
          const parts = candidate.content?.parts;
          if (!parts) continue;
          for (const part of parts) {
            if (part.text) {
              yield { type: 'text', content: part.text };
            }
            if (part.functionCall) {
              yield {
                type: 'tool_call',
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args),
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
