import { describe, expect, test } from 'bun:test';
import {
  SLIDE_BUILTIN_TOOLS,
  getAllSlideTools,
  getToolsForPhase,
  getToolsForPhaseNames,
  isSlideVfsMutator,
} from '../../src/services/slideTools.ts';
import type { MCPTool } from '../../src/types/index.ts';

const names = (tools: MCPTool[]): string[] => tools.map((t) => t.name);

describe('slideTools definitions', () => {
  test('exports the full PRD tool set', () => {
    const tools = getAllSlideTools();
    const toolNames = names(tools);
    expect(toolNames).toContain('list_files');
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('apply_patch');
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

  test('only apply_patch is a VFS mutator', () => {
    for (const name of Object.keys(SLIDE_BUILTIN_TOOLS)) {
      expect(isSlideVfsMutator(name)).toBe(name === 'apply_patch');
    }
  });
});

describe('getToolsForPhase', () => {
  test('plan has read + apply_patch + ask + submit_plan', () => {
    const tools = getToolsForPhase('plan');
    expect(getToolsForPhaseNames('plan')).toEqual([
      'list_files',
      'read_file',
      'apply_patch',
      'ask',
      'submit_plan',
    ]);
    expect(names(tools)).toEqual(getToolsForPhaseNames('plan'));
    // plan must still be able to ask a clarifying question
    expect(names(tools)).toContain('ask');
  });

  test('build has read + apply_patch, without ask or submit_plan', () => {
    const tools = getToolsForPhase('build');
    expect(names(tools)).toEqual(['list_files', 'read_file', 'apply_patch']);
    expect(names(tools)).not.toContain('ask');
    expect(names(tools)).not.toContain('submit_plan');
  });

  test('edit has read + apply_patch', () => {
    const tools = getToolsForPhase('edit');
    expect(names(tools)).toEqual(['list_files', 'read_file', 'apply_patch']);
  });

  test('main is read-only (no mutator, no ask)', () => {
    const tools = getToolsForPhase('main');
    expect(names(tools)).toEqual(['list_files', 'read_file']);
    expect(tools.every((t) => !isSlideVfsMutator(t.name))).toBe(true);
  });

  test('unknown phase falls back to read-only', () => {
    expect(getToolsForPhaseNames('bogus' as never)).toEqual(['list_files', 'read_file']);
  });

  test('every allowlisted phase keeps apply_patch as the sole mutator', () => {
    for (const phase of ['plan', 'build', 'edit'] as const) {
      const tools = getToolsForPhase(phase);
      const mutators = tools.filter((t) => isSlideVfsMutator(t.name));
      expect(mutators.map((t) => t.name)).toEqual(['apply_patch']);
    }
  });
});
