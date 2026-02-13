// LLM Provider abstraction layer
// Each provider knows how to format requests and parse streaming responses

export const PROVIDER_PRESETS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    format: 'openai',
    models: [], // Will be fetched from API
    supportsModelFetch: true,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-20250514',
    format: 'anthropic',
    models: [], // Anthropic doesn't have a models list endpoint, use hardcoded
    supportsModelFetch: false,
    staticModels: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    format: 'gemini',
    models: [], // Will be fetched from API
    supportsModelFetch: true,
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    apiUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-2',
    format: 'openai',
    models: [], // Will be fetched from API (OpenAI-compatible)
    supportsModelFetch: true,
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    format: 'openai',
    models: [], // Will be fetched from API (OpenAI-compatible)
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

// Fetch available models from provider API
export async function fetchModels(provider) {
  const { format, apiUrl, apiKey } = provider;

  if (!apiKey) {
    return { error: 'API key required' };
  }

  try {
    switch (format) {
      case 'openai':
        return await fetchOpenAIModels(apiUrl, apiKey);
      case 'anthropic':
        // Anthropic doesn't have a models list API, return static list
        return { models: PROVIDER_PRESETS.anthropic.staticModels || [] };
      case 'gemini':
        return await fetchGeminiModels(apiUrl, apiKey);
      default:
        // Try OpenAI-compatible endpoint
        return await fetchOpenAIModels(apiUrl, apiKey);
    }
  } catch (e) {
    return { error: e.message };
  }
}

async function fetchOpenAIModels(apiUrl, apiKey) {
  // Get base URL without /chat/completions
  let baseUrl = apiUrl.replace(/\/+$/, '');
  if (baseUrl.endsWith('/chat/completions')) {
    baseUrl = baseUrl.slice(0, -('/chat/completions'.length));
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

  // Filter and sort models
  let models = (data.data || [])
    .map(m => m.id)
    .filter(id => {
      // Filter out embedding, tts, whisper, dall-e, moderation models
      // Keep only chat models
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
    .sort((a, b) => a.localeCompare(b));

  return { models };
}

async function fetchGeminiModels(apiUrl, apiKey) {
  const baseUrl = apiUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/models?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();

  // Filter to only generative models that support generateContent
  let models = (data.models || [])
    .filter(m => {
      // Only include models that support generateContent
      const supportedMethods = m.supportedGenerationMethods || [];
      return supportedMethods.includes('generateContent');
    })
    .map(m => {
      // Extract model name from full name (e.g., "models/gemini-2.0-flash" -> "gemini-2.0-flash")
      const name = m.name || '';
      return name.replace(/^models\//, '');
    })
    .filter(name => name)
    .sort((a, b) => a.localeCompare(b));

  return { models };
}

// Format messages for the specific provider
// options: { enableGoogleSearch: boolean }
export function formatRequest(provider, messages, tools = [], options = {}) {
  const { format, apiUrl, defaultModel } = provider;
  const model = provider.model || defaultModel;

  switch (format) {
    case 'openai':
      return formatOpenAI(provider, messages, model, tools, options);
    case 'anthropic':
      return formatAnthropic(provider, messages, model, tools, options);
    case 'gemini':
      return formatGemini(provider, messages, model, tools, options);
    default:
      return formatOpenAI(provider, messages, model, tools, options);
  }
}

function formatOpenAI(provider, messages, model, tools, options = {}) {
  const body = {
    model,
    messages,
    stream: true,
  };
  if (tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
  }
  // Auto-append /chat/completions for OpenAI-compatible endpoints
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

function formatAnthropic(provider, messages, model, tools, options = {}) {
  // Separate system message
  let system = '';
  const filtered = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n' : '') + msg.content;
    } else {
      filtered.push(msg);
    }
  }

  const body = {
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

  // Auto-append /v1/messages for Anthropic-compatible endpoints
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
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
    },
  };
}

function formatGemini(provider, messages, model, tools, options = {}) {
  // Convert OpenAI-style messages to Gemini format
  let systemInstruction = '';
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
    } else if (msg.role === 'assistant') {
      // Assistant message - may have tool_calls
      const parts = [];
      if (msg.content) {
        parts.push({ text: msg.content });
      }
      // Handle tool_calls from OpenAI format -> Gemini functionCall
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          let args = {};
          try {
            args = JSON.parse(tc.function?.arguments || '{}');
          } catch (e) {
            args = {};
          }
          parts.push({
            functionCall: {
              name: tc.function?.name || tc.name,
              args: args,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool') {
      // Tool result - convert to Gemini functionResponse format
      // In Gemini, function responses go in a 'user' role message
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: msg.name || msg.toolCallId || 'unknown',
              response: typeof msg.content === 'string'
                ? { result: msg.content }
                : msg.content,
            },
          },
        ],
      });
    } else {
      // Regular user message
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  // Build tools array - can include both function declarations and google_search
  const geminiTools = [];

  // Add Google Search grounding tool if enabled
  if (options.enableGoogleSearch) {
    geminiTools.push({ googleSearch: {} });
  }

  // Add function declarations from MCP/tools
  if (tools.length > 0) {
    geminiTools.push({
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    });
  }

  if (geminiTools.length > 0) {
    body.tools = geminiTools;
  }

  // Auto-append /models/{model}:streamGenerateContent for Gemini-compatible endpoints
  let baseUrl = provider.apiUrl.replace(/\/+$/, '');
  // If URL already contains /models/, use it as-is; otherwise append the path
  let url;
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

// Parse streaming response — returns async generator of text chunks or tool calls
export async function* parseStream(provider, response) {
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

async function* parseOpenAIStream(response) {
  const reader = response.body.getReader();
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
      } catch (e) {
        // skip malformed JSON
      }
    }
  }
}

async function* parseAnthropicStream(response) {
  const reader = response.body.getReader();
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
      } catch (e) {
        // skip
      }
    }
  }
}

async function* parseGeminiStream(response) {
  const reader = response.body.getReader();
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

        // Yield grounding metadata from the last candidate (usually there's only one)
        const groundingMetadata = candidates[0]?.groundingMetadata;
        if (groundingMetadata) {
          yield { type: 'grounding_metadata', groundingMetadata };
        }
      } catch (e) {
        // skip
      }
    }
  }
}
