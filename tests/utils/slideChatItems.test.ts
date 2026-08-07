import { describe, expect, it } from 'bun:test';
import {
  buildSlideChatItems,
  countPhaseStats,
  formatThoughtDuration,
  formatWorkedDuration,
} from '../../src/utils/slideChatItems.ts';
import type {
  SlideActivityEvent,
  SlideMainMessage,
} from '../../src/types/slides.ts';

function ev(partial: Partial<SlideActivityEvent> & Pick<SlideActivityEvent, 'type' | 'id'>): SlideActivityEvent {
  return {
    status: 'completed',
    ts: 1_000,
    phase: 'build',
    label: partial.label ?? partial.type,
    ...partial,
  };
}

function msg(
  partial: Partial<SlideMainMessage> & Pick<SlideMainMessage, 'id' | 'role' | 'content'>,
): SlideMainMessage {
  return {
    createdAt: 500,
    ...partial,
  };
}

describe('buildSlideChatItems — full step retention', () => {
  it('emits one file_card per file_written (10 files → 10 cards)', () => {
    const activity: SlideActivityEvent[] = [
      ev({ id: 'ps', type: 'phase_started', phase: 'build', label: 'Building', ts: 100, status: 'running' }),
    ];
    for (let i = 0; i < 10; i++) {
      activity.push(
        ev({
          id: `f${i}`,
          type: 'file_written',
          path: `/slides/${String(i).padStart(2, '0')}.html`,
          patchOp: 'create_file',
          label: `Creating /slides/${String(i).padStart(2, '0')}.html`,
          ts: 200 + i,
        }),
      );
    }
    activity.push(
      ev({
        id: 'pc',
        type: 'phase_completed',
        label: 'Deck ready — 10 slides',
        ts: 500,
        filesTouched: 10,
      }),
    );

    const items = buildSlideChatItems({
      messages: [],
      activity,
      sessionStatus: 'done',
      phase: 'ready',
      pendingAsk: false,
    });

    const files = items.filter((x) => x.type === 'file_card');
    expect(files.length).toBe(10);
    expect(files.map((f) => (f.type === 'file_card' ? f.paths[0] : ''))).toEqual([
      '/slides/00.html',
      '/slides/01.html',
      '/slides/02.html',
      '/slides/03.html',
      '/slides/04.html',
      '/slides/05.html',
      '/slides/06.html',
      '/slides/07.html',
      '/slides/08.html',
      '/slides/09.html',
    ]);
  });

  it('places turn_footer after summary prose, not before', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({ id: 'u1', role: 'user', content: 'edit title', createdAt: 10 }),
        msg({
          id: 's1',
          role: 'summary',
          content: 'Updated the title color.',
          createdAt: 5000,
        }),
      ],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'edit', ts: 20, status: 'running' }),
        ev({
          id: 'f1',
          type: 'file_written',
          path: '/slides/01.html',
          patchOp: 'update_file',
          ts: 100,
        }),
        ev({
          id: 'pc',
          type: 'phase_completed',
          phase: 'edit',
          label: 'Updates applied',
          ts: 200,
        }),
      ],
      sessionStatus: 'done',
      phase: 'ready',
      pendingAsk: false,
    });

    const proseIdx = items.findIndex(
      (x) => x.type === 'prose' && x.content.includes('Updated the title'),
    );
    const footerIdx = items.findIndex((x) => x.type === 'turn_footer');
    expect(proseIdx).toBeGreaterThanOrEqual(0);
    expect(footerIdx).toBeGreaterThan(proseIdx);
  });


  it('retains user messages when plan_card is appended', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({ id: 'u1', role: 'user', content: 'Make a pitch deck', createdAt: 10 }),
        msg({ id: 's1', role: 'summary', content: 'Plan ready', createdAt: 900 }),
      ],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', label: 'Planning', ts: 20, status: 'running' }),
        ev({
          id: 'fw',
          type: 'file_written',
          path: '/brief.md',
          patchOp: 'create_file',
          label: 'Creating /brief.md',
          ts: 50,
        }),
        ev({
          id: 'pc',
          type: 'phase_completed',
          phase: 'plan',
          label: 'Plan ready — review brief & design',
          ts: 80,
        }),
      ],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });

    expect(items.some((x) => x.type === 'user' && x.content === 'Make a pitch deck')).toBe(true);
    expect(items.some((x) => x.type === 'plan_card')).toBe(true);
    expect(items.some((x) => x.type === 'file_card')).toBe(true);
    // plan_card is last (stream-end)
    expect(items[items.length - 1]?.type).toBe('plan_card');
  });

  it('ask_card wins over plan_card', () => {
    const items = buildSlideChatItems({
      messages: [msg({ id: 'u1', role: 'user', content: 'hi', createdAt: 1 })],
      activity: [],
      sessionStatus: 'waiting_user',
      phase: 'plan_ready',
      pendingAsk: true,
    });
    expect(items.filter((x) => x.type === 'ask_card').length).toBe(1);
    expect(items.some((x) => x.type === 'plan_card')).toBe(false);
  });

  it('includes live running tool + live reasoning while session running', () => {
    // Live reasoning only while model_round is still open (last activity row).
    const openRound: SlideActivityEvent[] = [
      ev({ id: 'ps', type: 'phase_started', phase: 'edit', label: 'Editing', ts: 10, status: 'running' }),
      ev({
        id: 'r1',
        type: 'model_round_started',
        label: 'Round 1',
        round: 1,
        ts: 20,
        status: 'running',
      }),
    ];
    const liveItems = buildSlideChatItems({
      messages: [msg({ id: 'u', role: 'user', content: 'tweak colors', createdAt: 5 })],
      activity: openRound,
      streamingReasoning: 'Considering palette…',
      streamingText: '',
      sessionStatus: 'running',
      phase: 'edit',
      pendingAsk: false,
    });
    expect(liveItems.some((x) => x.type === 'reasoning' && x.live && x.content?.includes('palette'))).toBe(
      true,
    );

    // After tools start, round is no longer the open stream window — no live reasoning.
    const withTool: SlideActivityEvent[] = [
      ...openRound,
      ev({
        id: 't1',
        type: 'tool_started',
        toolName: 'list_files',
        label: 'Listing project files',
        ts: 30,
        status: 'running',
      }),
    ];
    // Mark round completed as the emitter does when tools begin.
    withTool[1] = { ...withTool[1], status: 'completed', detail: 'Considering palette…' };
    const afterTool = buildSlideChatItems({
      messages: [msg({ id: 'u', role: 'user', content: 'tweak colors', createdAt: 5 })],
      activity: withTool,
      streamingReasoning: 'Considering palette…',
      streamingText: '',
      sessionStatus: 'running',
      phase: 'edit',
      pendingAsk: false,
    });
    expect(afterTool.some((x) => x.type === 'action' && x.event.id === 't1')).toBe(true);
    expect(afterTool.some((x) => x.type === 'reasoning' && x.live)).toBe(false);
    expect(
      afterTool.some(
        (x) => x.type === 'reasoning' && !x.live && x.content?.includes('palette'),
      ),
    ).toBe(true);
    expect(afterTool.some((x) => x.type === 'turn_footer')).toBe(false);
  });


  it('emits durable Thought-for rows for completed model rounds', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', ts: 10, status: 'running' }),
        ev({
          id: 'plan_round_1',
          type: 'model_round_started',
          round: 1,
          ts: 20,
          status: 'completed',
          label: 'Round 1',
        }),
        ev({
          id: 't1',
          type: 'tool_started',
          toolName: 'list_files',
          label: 'Listing project files',
          ts: 3200,
          status: 'completed',
        }),
        ev({
          id: 'pc',
          type: 'phase_completed',
          phase: 'plan',
          label: 'Plan ready',
          ts: 4000,
        }),
      ],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });
    const thoughts = items.filter((x) => x.type === 'reasoning' && !x.live);
    expect(thoughts.length).toBe(1);
    if (thoughts[0]?.type === 'reasoning') {
      expect(thoughts[0].durationMs).toBeGreaterThanOrEqual(1000);
    }
  });

  it('surfaces reasoning body from completed round detail', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', ts: 10, status: 'running' }),
        ev({
          id: 'plan_round_1',
          type: 'model_round_started',
          round: 1,
          ts: 20,
          status: 'completed',
          label: 'Round 1',
          detail: 'I should draft a brief first.',
        }),
      ],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });
    const thought = items.find((x) => x.type === 'reasoning' && !x.live);
    expect(thought?.type).toBe('reasoning');
    if (thought?.type === 'reasoning') {
      expect(thought.content).toBe('I should draft a brief first.');
    }
  });


  it('does not emit permanent thought for still-running model rounds', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 1, status: 'running' }),
        ev({
          id: 'build_round_1',
          type: 'model_round_started',
          round: 1,
          ts: 2,
          status: 'running',
          label: 'Round 1',
        }),
      ],
      streamingReasoning: '',
      streamingText: '',
      sessionStatus: 'running',
      phase: 'build',
      pendingAsk: false,
    });
    // live empty-round thinking indicator only
    const thoughts = items.filter((x) => x.type === 'reasoning');
    expect(thoughts.every((t) => t.type === 'reasoning' && t.live)).toBe(true);
  });


  it('emits turn_footer only after terminal phase event', () => {
    const open = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 1, status: 'running' }),
        ev({
          id: 'f',
          type: 'file_written',
          path: '/deck.json',
          patchOp: 'update_file',
          ts: 2,
        }),
      ],
      sessionStatus: 'running',
      phase: 'build',
      pendingAsk: false,
    });
    expect(open.some((x) => x.type === 'turn_footer')).toBe(false);

    const closed = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 1, status: 'running' }),
        ev({
          id: 'f',
          type: 'file_written',
          path: '/deck.json',
          patchOp: 'update_file',
          ts: 2,
        }),
        ev({ id: 'pc', type: 'phase_completed', label: 'Deck ready — 1 slides', ts: 1000 }),
      ],
      sessionStatus: 'done',
      phase: 'ready',
      pendingAsk: false,
    });
    const footers = closed.filter((x) => x.type === 'turn_footer');
    expect(footers.length).toBe(1);
    if (footers[0]?.type === 'turn_footer') {
      expect(footers[0].fileCount).toBe(1);
      expect(footers[0].status).toBe('completed');
      expect(footers[0].filesUpdated + footers[0].filesCreated).toBeGreaterThanOrEqual(1);
      expect(footers[0].phaseLabel).toContain('Deck ready');
    }
  });

  it('does not drop action rows for non-file tools', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', ts: 1, status: 'running' }),
        ev({
          id: 'ask1',
          type: 'ask_started',
          label: 'Asking you a question',
          ts: 2,
          status: 'running',
        }),
        ev({
          id: 'ask1',
          type: 'ask_answered',
          label: 'Answer received',
          ts: 3,
          status: 'completed',
        }),
      ],
      sessionStatus: 'running',
      phase: 'plan',
      pendingAsk: false,
    });
    const actions = items.filter((x) => x.type === 'action');
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });


  it('omits model_round rows as standalone chat items', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', ts: 1, status: 'running' }),
        ev({ id: 'r', type: 'model_round_started', round: 1, ts: 2, status: 'completed' }),
        ev({ id: 'rc', type: 'model_round_completed', round: 1, ts: 3, status: 'completed' }),
      ],
      sessionStatus: 'idle',
      phase: 'plan',
      pendingAsk: false,
    });
    expect(items.every((x) => x.type !== 'action' || x.event.type !== 'model_round_started')).toBe(
      true,
    );
  });
});

describe('countPhaseStats / duration formatters', () => {
  it('counts unique files, ops, tools, and tool_started actions', () => {
    const activity = [
      ev({ id: 'ps', type: 'phase_started', ts: 0 }),
      ev({ id: 'r1', type: 'model_round_started', round: 1, ts: 1, status: 'completed' }),
      ev({ id: 't1', type: 'tool_started', toolName: 'apply_patch', ts: 2 }),
      ev({ id: 'f1', type: 'file_written', path: '/a', patchOp: 'create_file', ts: 3 }),
      ev({ id: 'f2', type: 'file_written', path: '/a', patchOp: 'update_file', ts: 4 }),
      ev({ id: 'f3', type: 'file_written', path: '/b', patchOp: 'create_file', ts: 5 }),
      ev({ id: 'f4', type: 'file_deleted', path: '/c', patchOp: 'delete_file', ts: 6 }),
    ];
    expect(countPhaseStats(activity, 0, 6)).toEqual({
      actionCount: 1,
      fileCount: 3,
      filesCreated: 1,
      filesUpdated: 1,
      filesDeleted: 1,
      roundCount: 1,
      toolNames: ['apply_patch'],
    });
  });


  it('formats durations', () => {
    expect(formatWorkedDuration(3_000)).toBe('3s');
    expect(formatWorkedDuration(125_000)).toBe('2m 5s');
    expect(formatThoughtDuration(2_400)).toBe('Thought for 2s');
  });
});
