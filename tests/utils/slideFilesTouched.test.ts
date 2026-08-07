import { describe, expect, it } from 'bun:test';
import type { SlideActivityEvent } from '../../src/types/slides.ts';
import {
  collectFilesTouched,
  collectPlanSummary,
  slideTouchSymbol,
  type SlideFileTouch,
} from '../../src/utils/slideFilesTouched.ts';

function row(partial: Partial<SlideActivityEvent>): SlideActivityEvent {
  return {
    id: 'x',
    type: 'info',
    status: 'completed',
    ts: 1,
    phase: 'build',
    label: 'x',
    ...partial,
  } as SlideActivityEvent;
}

describe('slideTouchSymbol', () => {
  it('maps create/update/delete to +/~/-', () => {
    expect(slideTouchSymbol('create_file')).toBe('+');
    expect(slideTouchSymbol('update_file')).toBe('~');
    expect(slideTouchSymbol('delete_file')).toBe('-');
  });
});

describe('collectFilesTouched', () => {
  it('returns [] for an empty feed', () => {
    expect(collectFilesTouched([])).toEqual([]);
  });

  it('collects file_written/file_deleted rows with path + patchOp, in first-touch order', () => {
    const activity = [
      row({ id: 'a', type: 'file_written', path: '/slides/01.html', patchOp: 'create_file' }),
      row({ id: 'b', type: 'file_written', path: '/slides/01.css', patchOp: 'create_file' }),
      row({ id: 'c', type: 'file_deleted', path: '/slides/03.css', patchOp: 'delete_file' }),
    ];
    expect(collectFilesTouched(activity)).toEqual([
      { path: '/slides/01.html', op: 'create_file' },
      { path: '/slides/01.css', op: 'create_file' },
      { path: '/slides/03.css', op: 'delete_file' },
    ] as SlideFileTouch[]);
  });

  it('dedupes repeated touches of the same path, keeping the first write', () => {
    const activity = [
      row({ id: 'a', type: 'file_written', path: '/theme.css', patchOp: 'update_file' }),
      row({ id: 'b', type: 'file_written', path: '/theme.css', patchOp: 'update_file' }),
    ];
    expect(collectFilesTouched(activity)).toEqual([
      { path: '/theme.css', op: 'update_file' },
    ] as SlideFileTouch[]);
  });

  it('drops rows before the latest phase_started marker (A.9 "until next phase start clears it")', () => {
    const prevRun = row({ id: 'p1', type: 'phase_started' });
    const prevFile = row({ id: 'p2', type: 'file_written', path: '/old.md', patchOp: 'create_file' });
    const newRun = row({ id: 'n1', type: 'phase_started' });
    const newFile = row({ id: 'n2', type: 'file_written', path: '/slides/01.html', patchOp: 'create_file' });
    const activity = [prevRun, prevFile, newRun, newFile];
    expect(collectFilesTouched(activity)).toEqual([
      { path: '/slides/01.html', op: 'create_file' },
    ] as SlideFileTouch[]);
  });

  it('ignores non-file event types even when they carry a path', () => {
    const activity = [
      row({ id: 'a', type: 'tool_started', path: '/slides/01.html' }),
      row({ id: 'b', type: 'file_written', path: '/slides/01.html', patchOp: 'update_file' }),
    ];
    expect(collectFilesTouched(activity)).toEqual([
      { path: '/slides/01.html', op: 'update_file' },
    ] as SlideFileTouch[]);
  });

  it('degrades a written row without patchOp to update_file', () => {
    const activity = [row({ id: 'a', type: 'file_written', path: '/theme.css' })];
    expect(collectFilesTouched(activity)).toEqual([
      { path: '/theme.css', op: 'update_file' },
    ] as SlideFileTouch[]);
  });
});

describe('collectPlanSummary', () => {
  it('returns empty created list + zero steps for an empty feed', () => {
    expect(collectPlanSummary([])).toEqual({ createdPaths: [], steps: 0 });
  });

  it('collects created files in first-touch order and counts tool steps', () => {
    const activity = [
      row({ id: 'ps', type: 'phase_started' }),
      row({ id: 't1', type: 'tool_started' }),
      row({ id: 'w1', type: 'file_written', path: '/brief.md', patchOp: 'create_file' }),
      row({ id: 't2', type: 'tool_started' }),
      row({ id: 'w2', type: 'file_written', path: '/design.md', patchOp: 'create_file' }),
      row({ id: 't3', type: 'tool_started' }),
    ];
    expect(collectPlanSummary(activity)).toEqual({
      createdPaths: ['/brief.md', '/design.md'],
      steps: 3,
    });
  });

  it('skips phase_started marker itself and only counts the current run', () => {
    const prevRun = row({ id: 'p1', type: 'phase_started' });
    const prevT = row({ id: 'p2', type: 'tool_started' });
    const prevW = row({ id: 'p3', type: 'file_written', path: '/old.md', patchOp: 'create_file' });
    const newRun = row({ id: 'n1', type: 'phase_started' });
    const newT = row({ id: 'n2', type: 'tool_started' });
    const newW = row({ id: 'n3', type: 'file_written', path: '/brief.md', patchOp: 'create_file' });
    expect(collectPlanSummary([prevRun, prevT, prevW, newRun, newT, newW])).toEqual({
      createdPaths: ['/brief.md'],
      steps: 1,
    });
  });

  it('dedupes repeated creates of the same path and excludes non-create writes', () => {
    const activity = [
      row({ id: 'ps', type: 'phase_started' }),
      row({ id: 'w1', type: 'file_written', path: '/brief.md', patchOp: 'create_file' }),
      row({ id: 'w2', type: 'file_written', path: '/brief.md', patchOp: 'update_file' }),
      row({ id: 'w3', type: 'file_written', path: '/deck.json', patchOp: 'update_file' }),
    ];
    expect(collectPlanSummary(activity)).toEqual({
      createdPaths: ['/brief.md'],
      steps: 0,
    });
  });
});
