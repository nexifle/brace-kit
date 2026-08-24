import { describe, expect, it } from 'bun:test';
import { buildChatOptions, type ChatOptionsState } from '../../src/utils/chatOptions.ts';

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
});
