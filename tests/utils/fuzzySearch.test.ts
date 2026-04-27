import { describe, test, expect } from 'bun:test';
import { fuzzyFilter, fuzzyFilterBy, fuzzySearchMulti, fuzzyHighlight } from '../../src/utils/fuzzySearch.ts';

// Realistic model list similar to what OpenRouter returns
const MODELS = [
  'qwen/qwen3.5-122b-a10b',
  'qwen/qwen3-235b-a22b',
  'qwen/qwen2.5-72b-instruct',
  'nvidia/nemotron-3-super-120b-a12b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'anthropic/claude-3-5-sonnet',
  'anthropic/claude-opus-4',
  'meta-llama/llama-3.3-70b-instruct',
  'meta-llama/llama-3.1-8b-instruct',
  'google/gemini-2.5-pro',
  'google/gemma-3-27b',
  'mistralai/mistral-7b-instruct',
  'deepseek/deepseek-r1',
];

describe('fuzzyFilter', () => {
  test('empty query returns all items', () => {
    expect(fuzzyFilter(MODELS, '')).toEqual(MODELS);
    expect(fuzzyFilter(MODELS, '   ')).toEqual(MODELS);
  });

  test('"qwen" should only match qwen models', () => {
    const results = fuzzyFilter(MODELS, 'qwen');
    console.log('[qwen results]', results);
    expect(results).toContain('qwen/qwen3.5-122b-a10b');
    expect(results).toContain('qwen/qwen3-235b-a22b');
    expect(results).toContain('qwen/qwen2.5-72b-instruct');
    // These must NOT appear
    expect(results).not.toContain('nvidia/nemotron-3-super-120b-a12b');
    expect(results).not.toContain('openai/gpt-oss-120b');
    expect(results).not.toContain('openai/gpt-oss-20b');
  });

  test('"claude" should only match anthropic models', () => {
    const results = fuzzyFilter(MODELS, 'claude');
    console.log('[claude results]', results);
    expect(results).toContain('anthropic/claude-3-5-sonnet');
    expect(results).toContain('anthropic/claude-opus-4');
    expect(results).not.toContain('openai/gpt-4o');
    expect(results).not.toContain('meta-llama/llama-3.3-70b-instruct');
  });

  test('"llama" should only match llama models', () => {
    const results = fuzzyFilter(MODELS, 'llama');
    console.log('[llama results]', results);
    expect(results).toContain('meta-llama/llama-3.3-70b-instruct');
    expect(results).toContain('meta-llama/llama-3.1-8b-instruct');
    expect(results).not.toContain('openai/gpt-4o');
    expect(results).not.toContain('nvidia/nemotron-3-super-120b-a12b');
  });

  test('"70b" should match models with 70b in the name', () => {
    const results = fuzzyFilter(MODELS, '70b');
    console.log('[70b results]', results);
    expect(results).toContain('meta-llama/llama-3.3-70b-instruct');
    expect(results).not.toContain('openai/gpt-4o');
  });

  // Reproduce exact bug from screenshot: "qwen" matching unrelated model IDs
  test('"qwen" must NOT match nvidia or openai models (screenshot regression)', () => {
    const realWorldModels = [
      'qwen/qwen3.5-122b-a10b',
      'qwen/qwen3-235b-a22b',
      'qwen/qwq-32b',
      'nvidia/nemotron-3-super-120b-a12b',
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'meta-llama/llama-3.3-70b-instruct',
    ];
    const results = fuzzyFilter(realWorldModels, 'qwen');
    console.log('[qwen real-world results]', results);
    // Only qwen models should appear
    expect(results.every(r => r.includes('qwen'))).toBe(true);
    expect(results).not.toContain('nvidia/nemotron-3-super-120b-a12b');
    expect(results).not.toContain('openai/gpt-oss-120b');
    expect(results).not.toContain('openai/gpt-oss-20b');
  });

  test('"gpt4" fuzzy matches gpt-4o variants', () => {
    const results = fuzzyFilter(MODELS, 'gpt4');
    console.log('[gpt4 results]', results);
    expect(results).toContain('openai/gpt-4o');
    expect(results).toContain('openai/gpt-4o-mini');
    expect(results).not.toContain('meta-llama/llama-3.3-70b-instruct');
  });

  test('short query (<=2 chars) uses includes fallback', () => {
    const results = fuzzyFilter(MODELS, 'gp');
    expect(results).toContain('openai/gpt-4o');
    expect(results).toContain('openai/gpt-oss-120b');
    expect(results).not.toContain('meta-llama/llama-3.3-70b-instruct');
  });
});

describe('fuzzyFilterBy', () => {
  const items = [
    { id: '1', name: 'OpenAI GPT-4o' },
    { id: '2', name: undefined as string | undefined },
    { id: '3', name: null as string | null },
    { id: '4', name: 'Anthropic Claude' },
  ];

  test('short query does not match undefined/null values via string coercion', () => {
    const results = fuzzyFilterBy(items, 'un', 'name');
    expect(results).toEqual([]);
  });

  test('long query skips undefined/null values and matches valid entries', () => {
    const results = fuzzyFilterBy(items, 'claude', 'name');
    expect(results).toEqual([{ id: '4', name: 'Anthropic Claude' }]);
  });
});

describe('fuzzySearchMulti', () => {
  const items = [
    { id: '1', title: 'Alpha guide', description: 'Setup steps' },
    { id: '2', title: 'Beta notes', description: 'Alpha fallback path' },
    { id: '3', title: 'Gamma doc', description: 'Misc reference' },
  ];

  test('returns multiple distinct items when getId is omitted', () => {
    const results = fuzzySearchMulti(items, 'alpha', [
      { key: 'title' },
      { key: 'description' },
    ]);
    expect(results.map(item => item.id)).toEqual(['1', '2']);
  });

  test('larger weight boosts the matching field instead of penalizing it', () => {
    const weightedItems = [
      { id: '1', title: 'alpha', description: 'zzz' },
      { id: '2', title: 'zzz', description: 'alpha' },
    ];

    const results = fuzzySearchMulti(weightedItems, 'alpha', [
      { key: 'title', weight: 3 },
      { key: 'description', weight: 1 },
    ], {
      getId: item => item.id,
    });

    expect(results[0]?.id).toBe('1');
    expect(results[1]?.id).toBe('2');
  });
});

describe('fuzzyHighlight', () => {
  test('returns original text for empty query', () => {
    expect(fuzzyHighlight('OpenAI GPT-4o', '   ')).toBe('OpenAI GPT-4o');
  });
});
