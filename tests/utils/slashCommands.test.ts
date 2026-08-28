import { describe, expect, it } from 'bun:test';
import {
  parseSlashCommand,
  slashComposerGhost,
  slashGhostCmd,
  slashMatches,
  slashUsageGhost,
} from '../../src/utils/slashCommands.ts';

describe('slashMatches', () => {
  it('lists all commands for a lone slash', () => {
    expect(slashMatches('/').map((c) => c.cmd)).toEqual(['/compact', '/rename', '/help']);
  });

  it('filters by prefix', () => {
    expect(slashMatches('/c').map((c) => c.cmd)).toEqual(['/compact']);
    expect(slashMatches('/re').map((c) => c.cmd)).toEqual(['/rename']);
  });

  it('closes after a space', () => {
    expect(slashMatches('/compact extra')).toEqual([]);
    expect(slashMatches(' /compact')).toEqual([]);
    expect(slashMatches('hello')).toEqual([]);
  });
});

describe('slashGhostCmd', () => {
  it('returns the remaining command when the prefix is unique and incomplete', () => {
    expect(slashGhostCmd('/co')).toBe('/compact');
    expect(slashGhostCmd('/compact')).toBeNull();
    expect(slashGhostCmd('/')).toBe('/compact');
  });
});

describe('slashUsageGhost', () => {
  it('hints how to name or auto-generate after /rename', () => {
    expect(slashUsageGhost('/rename')).toBe(
      ' [conversation name] or /rename for auto generate',
    );
    expect(slashUsageGhost('/rename ')).toBe(
      '[conversation name] or /rename for auto generate',
    );
    expect(slashUsageGhost('/rename Verdant')).toBeNull();
    expect(slashUsageGhost('/ren')).toBeNull();
  });
});

describe('slashComposerGhost', () => {
  it('shows rename usage while completing the command', () => {
    expect(slashComposerGhost('/ren')).toBe(
      'ame [conversation name] or /rename for auto generate',
    );
    expect(slashComposerGhost('/rename')).toBe(
      ' [conversation name] or /rename for auto generate',
    );
    expect(slashComposerGhost('/rename ')).toBe(
      '[conversation name] or /rename for auto generate',
    );
  });
});

describe('parseSlashCommand', () => {
  it('parses compact with optional extra instructions', () => {
    expect(parseSlashCommand('/compact')).toEqual({ kind: 'compact', extra: '' });
    expect(parseSlashCommand('  /compact  keep files  ')).toEqual({
      kind: 'compact',
      extra: 'keep files',
    });
  });

  it('parses rename with optional explicit title', () => {
    expect(parseSlashCommand('/rename')).toEqual({ kind: 'rename', title: '' });
    expect(parseSlashCommand('  /rename  Verdant  ')).toEqual({ kind: 'rename', title: 'Verdant' });
    expect(parseSlashCommand('/help')).toEqual({ kind: 'help' });
    expect(parseSlashCommand('/helpp')).toBeNull();
    expect(parseSlashCommand('/foo')).toBeNull();
  });
});
