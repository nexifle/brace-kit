import { describe, expect, it } from 'bun:test';
import {
  applyPatchOpDoneLabel,
  applyPatchOpLabel,
  askAnsweredLabel,
  askStartedLabel,
  cancelledLabel,
  connectingActivityLabel,
  fileDeletedLabel,
  fileWrittenLabel,
  googleSearchLabel,
  listFilesLabel,
  mcpToolLabel,
  modelRoundLabel,
  phaseCompletedLabel,
  phaseFailedLabel,
  phaseStartedLabel,
  phaseStoppedLabel,
  readFileLabel,
  submitPlanLabel,
  toolFailedLabel,
  toolStartedLabel,
  truncateLabel,
} from '../../src/utils/slideActivityLabels';

describe('slideActivityLabels (Amendment A.5)', () => {
  it('connecting', () => {
    expect(connectingActivityLabel()).toBe('Connecting to model…');
  });

  it('phase_started per phase', () => {
    expect(phaseStartedLabel('plan')).toBe('Planning your deck…');
    expect(phaseStartedLabel('build')).toBe('Building slides…');
    expect(phaseStartedLabel('edit')).toBe('Applying your changes…');
  });

  it('phase_completed per phase', () => {
    expect(phaseCompletedLabel('plan')).toBe('Plan ready — review brief & design');
    expect(phaseCompletedLabel('build', { slideCount: 5 })).toBe('Deck ready — 5 slides');
    expect(phaseCompletedLabel('build', { slideCount: 1 })).toBe('Deck ready — 1 slide');
    expect(phaseCompletedLabel('build')).toBe('Deck ready — 0 slides');
    expect(phaseCompletedLabel('edit')).toBe('Updates applied');
  });

  it('phase_stopped / phase_failed', () => {
    expect(phaseStoppedLabel()).toBe('Stopped');
    expect(phaseFailedLabel('boom')).toBe('Error: boom');
    // a message already prefixed with `Error: ` is not double-prefixed
    expect(phaseFailedLabel('Error: boom')).toBe('Error: boom');
    const long = 'x'.repeat(150);
    const failed = phaseFailedLabel(long);
    expect(failed.startsWith('Error: ')).toBe(true);
    // reason portion ≤100 chars (may include ellipsis)
    expect(failed.length).toBeLessThanOrEqual('Error: '.length + 100);
  });

  it('model rounds', () => {
    expect(modelRoundLabel(1)).toBe('Round 1');
    expect(modelRoundLabel(12)).toBe('Round 12');
  });

  it('apply_patch create/update/delete/rename labels', () => {
    expect(applyPatchOpLabel('create_file', '/brief.md')).toBe('Creating /brief.md');
    expect(applyPatchOpLabel('update_file', '/design.md')).toBe('Updating /design.md');
    expect(applyPatchOpLabel('delete_file', '/slides/a.html')).toBe('Deleting /slides/a.html');
    expect(applyPatchOpLabel('rename_file', '/slides/03.html')).toBe('Renaming /slides/03.html');
    expect(applyPatchOpDoneLabel('rename_file', '/slides/03.html')).toBe('Renamed /slides/03.html');
    expect(fileWrittenLabel('rename_file', '/slides/03.html')).toBe('Renamed /slides/03.html');
  });

  it('read_file / list_files / ask / submit_plan', () => {
    expect(readFileLabel('/deck.json')).toBe('Reading /deck.json');
    expect(listFilesLabel()).toBe('Listing project files');
    expect(askStartedLabel()).toBe('Asking you a question');
    expect(askAnsweredLabel()).toBe('Answer received');
    expect(submitPlanLabel()).toBe('Submitting plan');
  });

  it('google_search truncates query to 40 chars', () => {
    expect(googleSearchLabel('cats')).toBe('Searching: cats');
    const q = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEF'; // 42
    const label = googleSearchLabel(q);
    expect(label.startsWith('Searching: ')).toBe(true);
    const body = label.slice('Searching: '.length);
    expect(body.length).toBe(40);
    expect(body.endsWith('…')).toBe(true);
  });

  it('MCP / unknown tool', () => {
    expect(mcpToolLabel('browser_navigate')).toBe('Running browser_navigate');
    expect(toolStartedLabel('custom_mcp_thing')).toBe('Running custom_mcp_thing');
  });

  it('toolStartedLabel routes known tools', () => {
    expect(
      toolStartedLabel('apply_patch', { patchOp: 'create_file', path: '/theme.css' }),
    ).toBe('Creating /theme.css');
    expect(toolStartedLabel('read_file', { path: '/brief.md' })).toBe('Reading /brief.md');
    expect(toolStartedLabel('load_skill', { skillName: 'SKILL.md' })).toBe('Loading skill SKILL.md');
    expect(toolStartedLabel('list_files')).toBe('Listing project files');
    expect(toolStartedLabel('ask')).toBe('Asking you a question');
    expect(toolStartedLabel('submit_plan')).toBe('Submitting plan');
    expect(toolStartedLabel('reorder_slides')).toBe('Reordering slides');
    expect(toolStartedLabel('google_search', { query: 'react slides' })).toBe(
      'Searching: react slides',
    );
  });

  it('tool_finished failed prefix', () => {
    expect(toolFailedLabel('Invalid Context')).toBe('Failed: Invalid Context');
    const long = 'e'.repeat(120);
    const label = toolFailedLabel(long);
    expect(label.startsWith('Failed: ')).toBe(true);
    expect(label.length).toBeLessThanOrEqual('Failed: '.length + 80);
  });

  it('tool_finished cancelled label rewrites the ask label', () => {
    expect(cancelledLabel(askStartedLabel())).toBe('Question canceled');
    expect(cancelledLabel('Listing project files')).toBe('Canceled');
    expect(cancelledLabel()).toBe('Canceled');
  });

  it('file_written / file_deleted use past-tense card titles', () => {
    expect(fileWrittenLabel('create_file', '/slides/1.html')).toBe('Created /slides/1.html');
    expect(fileWrittenLabel('update_file', '/slides/1.css')).toBe('Updated /slides/1.css');
    expect(fileDeletedLabel('/slides/1.html')).toBe('Deleted /slides/1.html');
  });

  it('truncateLabel', () => {
    expect(truncateLabel('hi', 10)).toBe('hi');
    expect(truncateLabel('hello world', 5)).toBe('hell…');
    expect(truncateLabel('', 5)).toBe('');
  });
});
