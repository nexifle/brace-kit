// ==================== US-048: black-box activity regression guard ====================
//
// Amendment A.0 / FR-38: a phase must NEVER run its tool loop as a silent
// black box. These tests treat each phase runner as a black box — driving it
// ONLY through its public params + an injected transport that returns simulated
// tool calls — and assert the invariant "if tools ran, the activity feed shows
// it" holds. They are deliberately cross-cutting (not tied to a single phase's
// internal emitter shape): if a future phase runner forgets to emit activity,
// the loop below fails.
//
// The activity sink mirrors the store's `pushActivity`/`patchActivity` in-place
// semantics, so once a `tool_started` row is dispatched (running) its live
// status reflects the resolved outcome (completed/failed) — or stays `running`
// when the tool suspends the session (ask).

import { describe, expect, it } from 'bun:test';
import {
  runPlanPhase,
  runBuildPhase,
  runEditPhase,
  type PlanPhaseParams,
  type BuildPhaseParams,
  type EditPhaseParams,
  type SlideActivitySink,
} from '../../src/services/slidePhases.ts';
import type { APIMessage, ProviderConfig, ToolCall } from '../../src/types/index.ts';
import type { SlideActivityEvent, SlideFile } from '../../src/types/slides.ts';
import type { AgentChatResponse } from '../../src/services/agentSession.ts';

const providerConfig: ProviderConfig = {
  providerId: 'custom',
  apiKey: '',
  apiUrl: 'http://localhost',
  model: 'test-model',
  format: 'openai',
  systemPrompt: '',
};

const userMsg: APIMessage = { role: 'user', content: 'a slide deck about coffee' };

function toolCall(name: string, argumentsStr: string): ToolCall {
  return { id: `tc_${Math.random().toString(36).slice(2, 8)}`, name, arguments: argumentsStr };
}

type Responder = () => AgentChatResponse;
function makeTransport(respondents: Responder[]) {
  let callCount = 0;
  const transport = (async () => {
    const respond = respondents[Math.min(callCount, respondents.length - 1)];
    callCount++;
    return respond();
  }) as PlanPhaseParams['transport'];
  return { transport, callCount: () => callCount };
}

/** Store-shaped activity sink: `events` holds live rows (patched in place). */
function captureActivity() {
  const events: SlideActivityEvent[] = [];
  const sink: SlideActivitySink = {
    push: (event) => {
      events.push(event);
    },
    patch: (id, partial) => {
      const idx = events.findIndex((e) => e.id === id);
      if (idx >= 0) events[idx] = { ...events[idx], ...partial, id };
    },
  };
  return { sink, events };
}

/**
 * The black-box invariant: when a phase dispatched tools, the feed must prove it.
 *  1. the phase announced itself (phase_started) — no silently running phase;
 *  2. every dispatched tool got a tool_started row;
 *  3. no tool_started row is dangling mid-flight (each is running or resolved);
 *  4. the phase reached a terminal marker (completed/stopped/failed) so the UI
 *     can never sit forever with only a connecting spinner.
 */
function assertBlackBoxFeed(events: SlideActivityEvent[]): void {
  const typeCount = (t: SlideActivityEvent['type']) => events.filter((e) => e.type === t).length;

  expect(typeCount('phase_started')).toBeGreaterThanOrEqual(1);
  expect(typeCount('tool_started')).toBeGreaterThanOrEqual(1);

  // Every dispatched tool must be reflected as running (not yet resolved —
  // e.g. a suspended ask) or a resolved terminal status. No row may be lost.
  for (const ev of events.filter((e) => e.type === 'tool_started')) {
    expect(['running', 'completed', 'failed', 'cancelled']).toContain(ev.status);
    expect(ev.toolName).toBeTruthy();
    expect(ev.toolCallId).toBeTruthy();
    expect(typeof ev.round).toBe('number');
  }

  // The phase must reach one terminal marker so the rail can never be stuck.
  const terminals = events.filter((e) =>
    ['phase_completed', 'phase_stopped', 'phase_failed'].includes(e.type)
  );
  expect(terminals.length).toBeGreaterThanOrEqual(1);
}

describe('US-048 black-box activity regression guard', () => {
  it('plan: a simulated tool loop emits phase_started + tool_started rows and a terminal', async () => {
    const { sink, events } = captureActivity();
    const { transport, callCount: calls } = makeTransport([
      () => ({
        content: 'writing the plan',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/brief.md', diff: '@@\n+title: Coffee for Teams\n' } })),
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/design.md', diff: '@@\n+dark theme\n' } })),
        ],
      }),
      () => ({ toolCalls: [toolCall('submit_plan', JSON.stringify({ summary: 'Done.', canvas: '16:9' }))] }),
      () => ({ content: 'Plan complete.' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(calls()).toBe(3);
    expect(result.status).toBe('plan_ready');
    assertBlackBoxFeed(events);
    // every dispatch resolved to completed
    expect(
      events.filter((e) => e.type === 'tool_started' && e.status === 'completed').length
    ).toBe(3);
    expect(events.filter((e) => e.type === 'phase_completed').length).toBe(1);
  });

  it('build: a simulated tool loop that writes slides emits the full feed', async () => {
    const { sink, events } = captureActivity();
    const buildFiles: SlideFile[] = [
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
    ];
    const { transport } = makeTransport([
      () => ({
        content: 'building',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'create_file', path: '/slides/01.html', diff: '@@\n+<section>Hello</section>\n' } })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runBuildPhase({
      systemPrompt: 'build skill',
      messages: [userMsg],
      providerConfig,
      files: buildFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    assertBlackBoxFeed(events);
    // only the slide is an apply_patch write; deck.json is code-generated, not a file_written row
    expect(events.filter((e) => e.type === 'file_written').length).toBe(1);
  });

  it('edit: a simulated follow-up that patches the deck emits the full feed', async () => {
    const { sink, events } = captureActivity();
    const editFiles: SlideFile[] = [
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
      { path: '/theme.css', content: 'body{}' },
      { path: '/slides/01.html', content: '<section>Hello</section>' },
      { path: '/slides/02.html', content: '<section>Bye</section>' },
      {
        path: '/deck.json',
        content: '{"title":"t","canvas":"16:9","theme":"/theme.css","slideOrder":["01","02"]}',
      },
    ];
    const { transport } = makeTransport([
      () => ({
        content: 'removing slide 01',
        toolCalls: [
          toolCall('apply_patch', JSON.stringify({ operation: { type: 'delete_file', path: '/slides/01.html' } })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'edit skill',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    assertBlackBoxFeed(events);
    const deleted = events.filter((e) => e.type === 'file_deleted');
    expect(deleted.length).toBe(1);
    expect(deleted[0].path).toBe('/slides/01.html');
  });

  it('edit: a reorder_slides call emits a started→completed row plus file_written rows', async () => {
    const { sink, events } = captureActivity();
    const editFiles: SlideFile[] = [
      { path: '/brief.md', content: '# brief' },
      { path: '/design.md', content: 'design' },
      { path: '/theme.css', content: 'body{}' },
      { path: '/slides/01.html', content: '<section>one</section>' },
      { path: '/slides/02.html', content: '<section>two</section>' },
      { path: '/slides/zz.html', content: '<section>new</section>' },
      {
        path: '/deck.json',
        content: JSON.stringify({ title: 't', canvas: '16:9', theme: '/theme.css', slideOrder: ['01', '02', 'zz'] }),
      },
    ];
    const { transport } = makeTransport([
      () => ({
        content: 'reordering',
        toolCalls: [
          toolCall('reorder_slides', JSON.stringify({ order: ['01', 'zz', '02'] })),
        ],
      }),
      () => ({ content: 'done.' }),
    ]);

    const result = await runEditPhase({
      systemPrompt: 'edit skill',
      messages: [userMsg],
      providerConfig,
      files: editFiles,
      transport,
      onActivity: sink,
    });

    expect(result.status).toBe('ready');
    assertBlackBoxFeed(events);
    const reorderRow = events.find((e) => e.type === 'tool_started' && e.toolName === 'reorder_slides');
    expect(reorderRow?.status).toBe('completed');
    // only slides whose path changed emit a rename row: 01 stays put, zz→02 and 02→03
    expect(events.filter((e) => e.type === 'file_written' && e.patchOp === 'rename_file').length).toBe(2);
  });

  it('plan ask: an unresolved tool stays running (waiting_user) yet the phase still emitted feeds', async () => {
    const { sink, events } = captureActivity();
    const { transport, callCount: calls } = makeTransport([
      () => ({
        toolCalls: [toolCall('ask', JSON.stringify({ question: 'Canvas?', options: ['16:9', '4:5'], field: 'canvas' }))],
      }),
      () => ({ content: 'SHOULD NOT RUN' }),
    ]);

    const result = await runPlanPhase({
      systemPrompt: 'plan skill',
      messages: [userMsg],
      providerConfig,
      files: [],
      transport,
      onActivity: sink,
    });

    expect(calls()).toBe(1);
    expect(result.status).toBe('waiting_user');
    expect(result.pendingAsk).toBeTruthy();
    // black box still fired: phase_started + a tool_started for the ask, whose
    // live status correctly reflects that it is UNRESOLVED (running) — the "or
    // running" branch of the guard.
    expect(events.filter((e) => e.type === 'phase_started').length).toBe(1);
    const askRow = events.find((e) => e.type === 'tool_started' && e.toolName === 'ask');
    expect(askRow?.status).toBe('running');
    // no terminal yet — the wait is legitimate (suspended), not a black box.
    expect(events.filter((e) => e.type === 'phase_completed').length).toBe(0);
  });
});
