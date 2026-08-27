import { describe, expect, it } from 'bun:test';
import {
  buildChatOptions,
  prepareChatRequest,
  type ChatOptionsState,
  type ChatOptionsStoreSnapshot,
} from '../../src/utils/chatOptions.ts';

function base(partial?: Partial<ChatOptionsState>): ChatOptionsState {
  return {
    providerConfig: {
      providerId: 'openai',
      format: 'openai',
      model: 'gpt-4o',
      modelParameters: { temperature: 0.2 },
    },
    enableGoogleSearch: false,
    enableReasoning: true,
    reasoningLevel: 'high',
    enableStreaming: true,
    groqEnabledBuiltinTools: [],
    ...partial,
  };
}

describe('buildChatOptions', () => {
  it('passes enableReasoning and reasoningLevel from state', () => {
    const opts = buildChatOptions(base());
    expect(opts.enableReasoning).toBe(true);
    expect(opts.reasoningLevel).toBe('high');
    expect(opts.stream).toBe(true);
    expect(opts.modelParameters).toEqual({ temperature: 0.2 });
  });

  it('allows overrides for reasoning and stream', () => {
    const opts = buildChatOptions(base({ enableReasoning: false }), {
      enableReasoning: true,
      reasoningLevel: 'low',
      stream: true,
    });
    expect(opts.enableReasoning).toBe(true);
    expect(opts.reasoningLevel).toBe('low');
    expect(opts.stream).toBe(true);
  });

  it('disables reasoning when state has it off', () => {
    const opts = buildChatOptions(base({ enableReasoning: false }));
    expect(opts.enableReasoning).toBe(false);
  });

  it('does not send reasoning when the model spec disables it', () => {
    const opts = buildChatOptions(
      base({
        enableReasoning: true,
        modelSpec: { id: 'gpt-4o', capabilities: { reasoning: false } },
      }),
    );
    expect(opts.enableReasoning).toBe(false);
  });

  it('clamps maxTokens to remaining context minus safety', () => {
    const opts = buildChatOptions(
      base({
        contextWindow: 128000,
        estimatedContextTokens: 120000,
        providerConfig: {
          providerId: 'openai',
          format: 'openai',
          model: 'gpt-4o',
          modelParameters: { maxTokens: 8192 },
        },
      }),
    );
    expect(opts.modelParameters?.maxTokens).toBe(3904);
  });

  it('uses a precomputed estimate that already includes prefix tokens', () => {
    const opts = buildChatOptions(
      base({
        contextWindow: 10000,
        estimatedContextTokens: 5000,
        providerConfig: {
          providerId: 'openai',
          format: 'openai',
          model: 'gpt-4o',
          modelParameters: { maxTokens: 8000 },
        },
      }),
    );
    expect(opts.modelParameters?.maxTokens).toBe(10000 - 5000 - 4096);
  });
});

function storeSnapshot(partial?: Partial<ChatOptionsStoreSnapshot>): ChatOptionsStoreSnapshot {
  return {
    providerConfig: {
      providerId: 'openai',
      format: 'openai',
      model: 'gpt-4o',
      modelParameters: { maxTokens: 8000 },
    },
    enableGoogleSearch: false,
    enableReasoning: false,
    reasoningLevel: 'high',
    enableStreaming: true,
    groqEnabledBuiltinTools: [],
    compactConfig: {
      enabled: true,
      threshold: 0.9,
      defaultContextWindow: 20000,
      prompt: '',
    },
    messages: [],
    conversations: [],
    activeConversationId: null,
    memoryEnabled: false,
    memories: [],
    ...partial,
  };
}

describe('prepareChatRequest', () => {
  const hugeTools = [{ name: 'web_fetch', description: 'x'.repeat(40000) }];

  it('sends the same filtered tools used to clamp maxTokens', () => {
    const dropped = prepareChatRequest({
      getState: () => storeSnapshot(),
      rawTools: hugeTools,
      supportsFunctionCalling: true,
      isXAIImageModel: true,
    });
    expect(dropped.tools).toEqual([]);

    const included = prepareChatRequest({
      getState: () => storeSnapshot(),
      rawTools: hugeTools,
      supportsFunctionCalling: true,
      isXAIImageModel: true,
      overrides: { aspectRatio: '1:1' },
    });
    expect(included.tools).toEqual(hugeTools);
    expect(included.estimatedContextTokens).toBeGreaterThan(dropped.estimatedContextTokens);
    expect(dropped.options.modelParameters?.maxTokens).toBeGreaterThan(
      included.options.modelParameters?.maxTokens ?? 0,
    );
  });

  it('drops tools entirely when function calling is unsupported', () => {
    const prepared = prepareChatRequest({
      getState: () => storeSnapshot(),
      rawTools: hugeTools,
      supportsFunctionCalling: false,
    });
    expect(prepared.tools).toEqual([]);
    expect(prepared.snapshot.toolsTokens).toBe(0);
  });
});
