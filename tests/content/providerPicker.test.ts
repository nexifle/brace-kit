import { describe, test, expect } from 'bun:test';
import { getProviderMenuView, type ToolbarState } from '../../src/content/selection-ui/templates/toolbar.ts';

/**
 * Provider/model picker view logic — the floating toolbar's searchable,
 * collapsible model menu.
 */

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-5.6-sol', 'gpt-5.5', 'gpt-4o', 'gpt-oss-120b'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5'] },
  { id: 'gemini', name: 'Gemini', models: ['gemini-3.6-flash', 'gemini-3-pro'] },
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
];

function makeState(overrides: Partial<ToolbarState['providerState']> = {}): ToolbarState {
  return {
    isExpanded: true,
    isTranslateMode: false,
    selectedLang: 'English',
    position: { top: 0, left: 0, placement: 'bottom' },
    menuState: { isOpen: false, selectedCategory: null },
    providerState: {
      isOpen: true,
      currentProvider: 'openai',
      currentModel: 'gpt-5.6-sol',
      providers: PROVIDERS,
      search: '',
      expandedProviderId: 'openai',
      highlightIndex: 0,
      menuAlignRight: false,
      ...overrides,
    },
    actions: [],
  };
}

describe('getProviderMenuView — collapsed (accordion) mode', () => {
  test('empty query shows only the expanded provider\'s models', () => {
    const { groups, rows } = getProviderMenuView(makeState());
    expect(groups.map((g) => g.provider.id)).toEqual(['openai']);
    expect(rows.map((r) => r.model)).toEqual(PROVIDERS[0].models);
  });

  test('collapsing the expanded provider yields an empty list', () => {
    const { groups, rows } = getProviderMenuView(makeState({ expandedProviderId: null }));
    expect(groups).toEqual([]);
    expect(rows).toEqual([]);
  });

  test('expanding another provider swaps the visible models', () => {
    const { rows } = getProviderMenuView(makeState({ expandedProviderId: 'gemini' }));
    expect(rows.map((r) => r.providerId)).toEqual(['gemini', 'gemini']);
    expect(rows.map((r) => r.model)).toEqual(PROVIDERS[2].models);
  });
});

describe('getProviderMenuView — fuzzy search mode', () => {
  test('typing searches across every provider (fuzzy subsequence)', () => {
    const { rows } = getProviderMenuView(makeState({ search: 'claude' }));
    expect(rows.every((r) => r.model.includes('claude'))).toBe(true);
    expect(rows.map((r) => r.providerId)).toEqual(['anthropic', 'anthropic', 'anthropic']);
  });

  test('typo-tolerant fuzzy fallback ("gpt4" → gpt-4o)', () => {
    const { rows } = getProviderMenuView(makeState({ search: 'gpt4' }));
    expect(rows.map((r) => r.model)).toEqual(['gpt-4o']);
  });

  test('short queries (≤2 chars) stay strict substring', () => {
    const { rows } = getProviderMenuView(makeState({ search: 'gp' }));
    expect(rows.every((r) => r.model.includes('gp'))).toBe(true);
    expect(rows.map((r) => r.providerId)).toEqual(['openai', 'openai', 'openai', 'openai']);
  });

  test('provider-name match expands to that provider\'s full model list', () => {
    const { rows } = getProviderMenuView(makeState({ search: 'openai' }));
    expect(rows.map((r) => r.model)).toEqual(PROVIDERS[0].models);
  });

  test('abbreviation-style provider match ("oai" → OpenAI)', () => {
    const { rows } = getProviderMenuView(makeState({ search: 'oai' }));
    expect(rows.map((r) => r.providerId)).toEqual(['openai', 'openai', 'openai', 'openai']);
    expect(rows).toHaveLength(PROVIDERS[0].models.length);
  });

  test('active provider is pinned to the top of the results', () => {
    const providers = [
      { id: 'beta', name: 'Beta', models: ['beta-one'] },
      { id: 'alpha', name: 'Alpha', models: ['alpha-one', 'one-more'] },
    ];
    const { groups, rows } = getProviderMenuView(
      makeState({ providers, currentProvider: 'alpha', search: 'one' })
    );
    expect(groups.map((g) => g.provider.id)).toEqual(['alpha', 'beta']);
    expect(rows.map((r) => r.providerId)).toEqual(['alpha', 'alpha', 'beta']);
  });

  test('non-matching query yields an empty result set (empty state)', () => {
    const { groups, rows } = getProviderMenuView(makeState({ search: 'zzz-no-such-model' }));
    expect(groups).toEqual([]);
    expect(rows).toEqual([]);
  });
});
