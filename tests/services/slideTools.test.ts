import { describe, expect, test } from 'bun:test';
import {
  SLIDE_BUILTIN_TOOLS,
  getAllSlideTools,
  getToolsForPhase,
  getToolsForPhaseNames,
  isSlideVfsMutator,
  shouldEnableGoogleSearch,
  shouldEnableGrokWebSearch,
} from '../../src/services/slideTools.ts';
import type { MCPTool } from '../../src/types/index.ts';

const names = (tools: MCPTool[]): string[] => tools.map((t) => t.name);

describe('slideTools definitions', () => {
  test('exports the full PRD tool set', () => {
    const tools = getAllSlideTools();
    const toolNames = names(tools);
    expect(toolNames).toContain('list_files');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('load_skill');
    expect(toolNames).toContain('apply_patch');
    expect(toolNames).toContain('reorder_slides');
    expect(toolNames).toContain('ask');
    expect(toolNames).toContain('submit_plan');
  });

  test('every definition is a valid MCPTool with a name and schema', () => {
    for (const tool of Object.values(SLIDE_BUILTIN_TOOLS)) {
      expect(tool.name).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
      expect((tool.inputSchema as { type?: string }).type).toBe('object');
    }
  });

  test('only apply_patch and reorder_slides are VFS mutators', () => {
    for (const name of Object.keys(SLIDE_BUILTIN_TOOLS)) {
      expect(isSlideVfsMutator(name)).toBe(name === 'apply_patch' || name === 'reorder_slides');
    }
  });
});

describe('getToolsForPhase', () => {
  test('plan has read + load_skill + apply_patch + ask + submit_plan', () => {
    const tools = getToolsForPhase('plan');
    expect(getToolsForPhaseNames('plan')).toEqual([
      'list_files',
      'read_file',
      'load_skill',
      'apply_patch',
      'ask',
      'submit_plan',
    ]);
    expect(names(tools)).toEqual(getToolsForPhaseNames('plan'));
    // plan must still be able to ask a clarifying question
    expect(names(tools)).toContain('ask');
  });

  test('build has read + apply_patch + reorder_slides, without ask or submit_plan', () => {
    const tools = getToolsForPhase('build');
    expect(names(tools)).toEqual([
      'list_files',
      'read_file',
      'load_skill',
      'apply_patch',
      'reorder_slides',
    ]);
    expect(names(tools)).not.toContain('ask');
    expect(names(tools)).not.toContain('submit_plan');
  });

  test('edit has read + load_skill + apply_patch + reorder_slides', () => {
    const tools = getToolsForPhase('edit');
    expect(names(tools)).toEqual([
      'list_files',
      'read_file',
      'load_skill',
      'apply_patch',
      'reorder_slides',
    ]);
  });

  test('main is read-only (no mutator, no ask)', () => {
    const tools = getToolsForPhase('main');
    expect(names(tools)).toEqual(['list_files', 'read_file']);
    expect(tools.every((t) => !isSlideVfsMutator(t.name))).toBe(true);
  });

  test('unknown phase falls back to read-only', () => {
    expect(getToolsForPhaseNames('bogus' as never)).toEqual(['list_files', 'read_file']);
  });

  test('every allowlisted phase limits mutators to apply_patch + reorder_slides', () => {
    for (const phase of ['plan', 'build', 'edit'] as const) {
      const tools = getToolsForPhase(phase);
      const mutators = tools.filter((t) => isSlideVfsMutator(t.name));
      const expected = phase === 'plan' ? ['apply_patch'] : ['apply_patch', 'reorder_slides'];
      expect(mutators.map((t) => t.name)).toEqual(expected);
    }
  });
});

describe('google_search injection (US-028)', () => {
  test('plan does not offer google_search by default', () => {
    const tools = getToolsForPhase('plan');
    expect(names(tools)).not.toContain('google_search');
  });

  test('plan offers google_search when enableGoogleSearch is true, appended last', () => {
    const tools = getToolsForPhase('plan', { enableGoogleSearch: true });
    expect(names(tools)).toEqual([
      'list_files',
      'read_file',
      'load_skill',
      'apply_patch',
      'ask',
      'submit_plan',
      'google_search',
    ]);
    // The injected tool keeps the external schema (a query input).
    const gs = tools.find((t) => t.name === 'google_search');
    expect((gs?.inputSchema as { required?: string[] })?.required).toContain('query');
  });

  test('build/edit can opt in to google_search via the options flag', () => {
    for (const phase of ['build', 'edit'] as const) {
      const tools = getToolsForPhase(phase, { enableGoogleSearch: true });
      expect(names(tools)).toContain('google_search');
    }
    // main stays read-only even when the flag is passed.
    expect(names(getToolsForPhase('main', { enableGoogleSearch: true }))).toEqual([
      'list_files',
      'read_file',
    ]);
  });

  test('google_search is never a VFS mutator', () => {
    expect(isSlideVfsMutator('google_search')).toBe(false);
  });

  test('shouldEnableGoogleSearch gates on non-Gemini + toggle + key', () => {
    const base = { format: 'openai' as const };
    expect(shouldEnableGoogleSearch({ ...base, enableGoogleSearchTool: true, googleSearchApiKey: '' })).toBe(false);
    expect(shouldEnableGoogleSearch({ ...base, enableGoogleSearchTool: false, googleSearchApiKey: 'key' })).toBe(false);
    expect(shouldEnableGoogleSearch({ ...base, enableGoogleSearchTool: true, googleSearchApiKey: 'key' })).toBe(true);
    // Gemini never uses the tool-call path for search.
    expect(
      shouldEnableGoogleSearch({
        providerId: 'gemini',
        format: 'gemini' as const,
        enableGoogleSearchTool: true,
        googleSearchApiKey: 'key',
      })
    ).toBe(false);
  });
});

describe('web_search (Grok) injection', () => {
  test('plan does not offer web_search by default', () => {
    expect(names(getToolsForPhase('plan'))).not.toContain('web_search');
  });

  test('plan offers web_search when enableGrokWebSearch is true, appended last', () => {
    const tools = getToolsForPhase('plan', { enableGrokWebSearch: true });
    expect(names(tools)).toEqual([
      'list_files',
      'read_file',
      'load_skill',
      'apply_patch',
      'ask',
      'submit_plan',
      'web_search',
    ]);
    const ws = tools.find((t) => t.name === 'web_search');
    expect((ws?.inputSchema as { required?: string[] })?.required).toContain('query');
  });

  test('build/edit can opt in to web_search via the options flag', () => {
    for (const phase of ['build', 'edit'] as const) {
      const tools = getToolsForPhase(phase, { enableGrokWebSearch: true });
      expect(names(tools)).toContain('web_search');
    }
    // main stays read-only even when the flag is passed.
    expect(names(getToolsForPhase('main', { enableGrokWebSearch: true }))).toEqual([
      'list_files',
      'read_file',
    ]);
  });

  test('google_search and web_search can both be injected', () => {
    const tools = getToolsForPhase('plan', { enableGoogleSearch: true, enableGrokWebSearch: true });
    expect(names(tools)).toContain('google_search');
    expect(names(tools)).toContain('web_search');
  });

  test('web_search is never a VFS mutator', () => {
    expect(isSlideVfsMutator('web_search')).toBe(false);
  });

  test('shouldEnableGrokWebSearch gates on the grok provider', () => {
    expect(shouldEnableGrokWebSearch({ providerId: 'grok' })).toBe(true);
    expect(shouldEnableGrokWebSearch({ providerId: 'openai' })).toBe(false);
    expect(shouldEnableGrokWebSearch({ providerId: 'gemini' })).toBe(false);
  });
});
