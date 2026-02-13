// LLM Provider abstraction layer
// Each provider knows how to format requests and parse streaming responses

export const PROVIDER_PRESETS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    format: 'openai',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-sonnet-4-20250514',
    format: 'anthropic',
    models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    format: 'gemini',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  },
  xai: {
    id: 'xai',
    name: 'xAI (Grok)',
    apiUrl: 'https://api.x.ai/v1/chat/completions',
    defaultModel: 'grok-2',
    format: 'openai',
    models: ['grok-2', 'grok-2-mini', 'grok-beta'],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    format: 'openai',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  custom: {
    id: 'custom',
    name: 'Custom Endpoint',
    apiUrl: '',
    defaultModel: '',
    format: 'openai',
    models: [],
  },
};

// Format messages for the specific provider
export function formatRequest(provider, messages, tools = []) {
  const { format, apiUrl, defaultModel } = provider;
  const model = provider.model || defaultModel;

  switch (format) {
    case 'openai':
      return formatOpenAI(provider, messages, model, tools);
    case 'anthropic':
      return formatAnthropic(provider, messages, model, tools);
    case 'gemini':
      return formatGemini(provider, messages, model, tools);
    default:
      return formatOpenAI(provider, messages, model, tools);
  }
}

function formatOpenAI(provider, messages, model, tools) {
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

function formatAnthropic(provider, messages, model, tools) {
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

function formatGemini(provider, messages, model, tools) {
  // Convert OpenAI-style messages to Gemini format
  let systemInstruction = '';
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction += (systemInstruction ? '\n' : '') + msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  const body = { contents };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        })),
      },
    ];
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
      } catch (e) {
        // skip
      }
    }
  }
}
