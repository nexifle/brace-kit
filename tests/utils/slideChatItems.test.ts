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

  it('renders answered ask messages as ask_result cards, not user bubbles', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({
          id: 'ask1',
          role: 'ask',
          content: '4:5',
          createdAt: 1,
          ask: { questions: [{ id: 'q1', text: 'Which canvas?', field: 'canvas' }] },
        }),
      ],
      activity: [],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });
    const cards = items.filter((x) => x.type === 'ask_result');
    expect(cards.length).toBe(1);
    expect(cards[0]).toMatchObject({
      questions: [{ id: 'q1', text: 'Which canvas?', field: 'canvas' }],
      answer: '4:5',
    });
    expect(items.some((x) => x.type === 'user')).toBe(false);
  });

  it('omits the ask_answered action row (redundant with the ask_result card)', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({
          id: 'ask1',
          role: 'ask',
          content: '4:5',
          createdAt: 1,
          ask: { questions: [{ id: 'q1', text: 'Which canvas?', field: 'canvas' }] },
        }),
      ],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', ts: 1, status: 'running' }),
        ev({
          id: 'ask_ev',
          type: 'ask_answered',
          label: 'Answer received',
          ts: 3,
          status: 'completed',
        }),
      ],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });
    expect(
      items.some((x) => x.type === 'action' && x.event.label === 'Answer received'),
    ).toBe(false);
  });

  it('renders a multi-question ask_result and keeps ordinary user messages as bubbles', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({ id: 'u1', role: 'user', content: 'Make a deck', createdAt: 1 }),
        msg({
          id: 'ask2',
          role: 'ask',
          content: JSON.stringify({ q1: '16:9', q2: ['minimal', 'vibrant'] }),
          createdAt: 2,
          ask: {
            questions: [
              { id: 'q1', text: 'Canvas?', options: ['16:9', '4:5'] },
              { id: 'q2', text: 'Styles?', options: ['minimal', 'vibrant', 'neon'], multiple: true },
            ],
          },
        }),
      ],
      activity: [],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });
    const cards = items.filter((x) => x.type === 'ask_result');
    expect(cards.length).toBe(1);
    expect(cards[0].answer).toBe(JSON.stringify({ q1: '16:9', q2: ['minimal', 'vibrant'] }));
    expect(cards[0].questions).toHaveLength(2);
    expect(items.some((x) => x.type === 'user' && x.id === 'user_u1')).toBe(true);
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


  it('emits durable Thought-for rows only when completed rounds have reasoning body', () => {
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
          // no detail → empty thought must not render
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
          id: 'plan_round_2',
          type: 'model_round_started',
          round: 2,
          ts: 4000,
          status: 'completed',
          detail: 'All three files created. Now submit_plan.',
        }),
        ev({
          id: 't2',
          type: 'tool_started',
          toolName: 'submit_plan',
          label: 'Submitting plan',
          ts: 5500,
          status: 'completed',
        }),
        ev({
          id: 'pc',
          type: 'phase_completed',
          phase: 'plan',
          label: 'Plan ready',
          ts: 6000,
        }),
      ],
      sessionStatus: 'idle',
      phase: 'plan_ready',
      pendingAsk: false,
    });
    const thoughts = items.filter((x) => x.type === 'reasoning' && !x.live);
    expect(thoughts.length).toBe(1);
    if (thoughts[0]?.type === 'reasoning') {
      expect(thoughts[0].content).toContain('submit_plan');
      expect(thoughts[0].durationMs).toBeGreaterThanOrEqual(1000);
    }
    // tools still present; empty thought omitted so feed stays collapsible-only
    expect(items.some((x) => x.type === 'action' && x.event.toolName === 'list_files')).toBe(true);
    expect(items.some((x) => x.type === 'action' && x.event.toolName === 'submit_plan')).toBe(true);
  });

  it('does not show stale streamingText after tools commit the round', () => {
    // Round 1 text lingered in the store while tools ran; streamActive is false
    // so live_prose must not appear under the tool rows.
    const items = buildSlideChatItems({
      messages: [msg({ id: 'u', role: 'user', content: 'plan a deck', createdAt: 1 })],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'plan', ts: 10, status: 'running' }),
        ev({
          id: 'r1',
          type: 'model_round_started',
          round: 1,
          ts: 20,
          status: 'completed',
          detail: 'Need to list files first',
        }),
        ev({
          id: 't1',
          type: 'tool_started',
          toolName: 'list_files',
          label: 'Listing project files',
          ts: 30,
          status: 'running',
        }),
      ],
      streamingText: 'I will start by checking the workspace…',
      streamingReasoning: '',
      sessionStatus: 'running',
      phase: 'plan',
      pendingAsk: false,
    });

    expect(items.some((x) => x.type === 'prose' && x.live)).toBe(false);
    expect(items.some((x) => x.type === 'reasoning' && x.live)).toBe(false);
    expect(
      items.some((x) => x.type === 'reasoning' && !x.live && x.content?.includes('list files')),
    ).toBe(true);
    expect(items.some((x) => x.type === 'action' && x.event.toolName === 'list_files')).toBe(true);
  });

  it('does not duplicate a final response that is both round content and an assistant transcript message', () => {
    const finalText =
      'Done — the cover now uses the coffee-brown palette and the CTA is back on slide 8.';
    const items = buildSlideChatItems({
      messages: [
        msg({ id: 'u1', role: 'user', content: 'fix the cover', createdAt: 10 }),
        msg({ id: 'a1', role: 'assistant', content: finalText, createdAt: 900 }),
      ],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'edit', label: 'Editing', ts: 20, status: 'running' }),
        ev({
          id: 'edit_round_1',
          type: 'model_round_started',
          round: 1,
          ts: 100,
          status: 'completed',
          detail: 'Checking the cover template first.',
          content: finalText,
        }),
        ev({ id: 'pc', type: 'phase_completed', phase: 'edit', label: 'Updates applied', ts: 200 }),
      ],
      sessionStatus: 'idle',
      phase: 'ready',
      pendingAsk: false,
    });

    const prose = items.filter(
      (x) => x.type === 'prose' && x.content === finalText,
    );
    // The final response is rendered exactly once — from the transcript message,
    // not again from the completed round's content.
    expect(prose).toHaveLength(1);
    // Mid-round reasoning (round detail) stays durable regardless.
    expect(
      items.some((x) => x.type === 'reasoning' && !x.live && x.content?.includes('cover template')),
    ).toBe(true);
  });

  it('places mid-round assistant prose before later tools (chronological)', () => {
    const items = buildSlideChatItems({
      messages: [msg({ id: 'u', role: 'user', content: 'build deck', createdAt: 1 })],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 10, status: 'running' }),
        ev({
          id: 'r1',
          type: 'model_round_started',
          round: 1,
          ts: 20,
          status: 'completed',
          detail: 'Need research first',
          content: 'Workspace is empty — I will research then write plan files.',
        }),
        ev({
          id: 't1',
          type: 'tool_started',
          toolName: 'tavily_search',
          label: 'Running tavily_search',
          ts: 40,
          status: 'completed',
        }),
        ev({
          id: 'r2',
          type: 'model_round_started',
          round: 2,
          ts: 50,
          status: 'running',
        }),
      ],
      streamingText: 'Now writing the diffs…',
      streamingReasoning: 'Careful with + lines',
      sessionStatus: 'running',
      phase: 'build',
      pendingAsk: false,
    });

    const idx = (pred: (x: (typeof items)[number]) => boolean) => items.findIndex(pred);

    const thoughtIdx = idx(
      (x) => x.type === 'reasoning' && !x.live && !!x.content?.includes('research'),
    );
    const roundProseIdx = idx(
      (x) =>
        x.type === 'prose' &&
        !x.live &&
        !!x.content?.includes('Workspace is empty'),
    );
    const toolIdx = idx(
      (x) => x.type === 'action' && x.event.toolName === 'tavily_search',
    );
    const liveReasonIdx = idx((x) => x.type === 'reasoning' && !!x.live);
    const liveProseIdx = idx((x) => x.type === 'prose' && !!x.live);

    expect(thoughtIdx).toBeGreaterThanOrEqual(0);
    expect(roundProseIdx).toBeGreaterThan(thoughtIdx);
    expect(toolIdx).toBeGreaterThan(roundProseIdx);
    // Live tail only for the open round — after tools, not before them.
    expect(liveReasonIdx).toBeGreaterThan(toolIdx);
    expect(liveProseIdx).toBeGreaterThan(toolIdx);
  });

  it('does not duplicate final transcript assistant when only live/round prose exists', () => {
    // Final transcript message lands after phase; mid-round content is already
    // in activity — both may appear (activity chronological + final summary).
    // Ensure empty-content rounds don't create blank prose.
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({
          id: 'r1',
          type: 'model_round_started',
          round: 1,
          ts: 1,
          status: 'completed',
          content: '   ',
        }),
      ],
      sessionStatus: 'idle',
      phase: 'ready',
      pendingAsk: false,
    });
    expect(items.filter((x) => x.type === 'prose')).toHaveLength(0);
    expect(items.filter((x) => x.type === 'reasoning')).toHaveLength(0);
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


  it('does not emit Thinking until the API streams reasoning content', () => {
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
    // Open round with no reasoning/text yet → no fake "Thinking…" row.
    expect(items.some((x) => x.type === 'reasoning')).toBe(false);
    expect(items.some((x) => x.type === 'prose')).toBe(false);
  });

  it('shows live Thinking only after reasoning deltas arrive', () => {
    const base = {
      messages: [] as SlideMainMessage[],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 1, status: 'running' }),
        ev({
          id: 'build_round_1',
          type: 'model_round_started',
          round: 1,
          ts: 2,
          status: 'running' as const,
          label: 'Round 1',
        }),
      ],
      sessionStatus: 'running' as const,
      phase: 'build' as const,
      pendingAsk: false,
    };
    const before = buildSlideChatItems({
      ...base,
      streamingReasoning: '',
      streamingText: '',
    });
    expect(before.some((x) => x.type === 'reasoning' && x.live)).toBe(false);

    const after = buildSlideChatItems({
      ...base,
      streamingReasoning: 'Considering layout…',
      streamingText: '',
    });
    expect(
      after.some(
        (x) => x.type === 'reasoning' && x.live && x.content?.includes('layout'),
      ),
    ).toBe(true);
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
          id: 'sp1',
          type: 'tool_started',
          toolName: 'submit_plan',
          label: 'Submitting plan',
          ts: 2,
          status: 'running',
        }),
        ev({
          id: 'sp1',
          type: 'tool_finished',
          toolName: 'submit_plan',
          label: 'Submitting plan',
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

  it('renders assistant role as prose alongside retained file/tool activity', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({ id: 'u1', role: 'user', content: 'change fonts', createdAt: 10 }),
        msg({
          id: 'a1',
          role: 'assistant',
          content:
            'The font change is applied. Plus Jakarta Sans and Lora load from Google Fonts.',
          createdAt: 900,
        }),
      ],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'edit', label: 'Editing', ts: 20, status: 'running' }),
        ev({
          id: 't1',
          type: 'tool_started',
          toolName: 'apply_patch',
          toolCallId: 'tc_1',
          label: 'Updating /theme.css',
          ts: 40,
          status: 'completed',
        }),
        ev({
          id: 'f1',
          type: 'file_written',
          path: '/theme.css',
          patchOp: 'update_file',
          toolCallId: 'tc_1',
          label: 'Updated /theme.css',
          ts: 41,
        }),
        ev({
          id: 'pc',
          type: 'phase_completed',
          phase: 'edit',
          label: 'Updates applied',
          ts: 80,
        }),
      ],
      sessionStatus: 'idle',
      phase: 'ready',
      pendingAsk: false,
      modelLabel: 'test-model',
    });

    expect(items.some((x) => x.type === 'user' && x.content === 'change fonts')).toBe(true);
    expect(items.some((x) => x.type === 'file_card' && x.paths[0] === '/theme.css')).toBe(true);
    // apply_patch tool row collapsed when file_written shares toolCallId
    expect(
      items.some(
        (x) =>
          x.type === 'action' &&
          x.event.toolName === 'apply_patch' &&
          x.event.toolCallId === 'tc_1',
      ),
    ).toBe(false);

    const proseIdx = items.findIndex(
      (x) => x.type === 'prose' && x.content.includes('Jakarta Sans'),
    );
    const fileIdx = items.findIndex((x) => x.type === 'file_card');
    const footerIdx = items.findIndex((x) => x.type === 'turn_footer');
    expect(proseIdx).toBeGreaterThanOrEqual(0);
    expect(fileIdx).toBeGreaterThanOrEqual(0);
    expect(fileIdx).toBeLessThan(proseIdx);
    expect(footerIdx).toBeGreaterThan(proseIdx);
  });

  it('does not drop file cards when only an assistant message is present after phase', () => {
    const items = buildSlideChatItems({
      messages: [
        msg({
          id: 'a1',
          role: 'assistant',
          content: 'Deck updated with new theme tokens.',
          createdAt: 500,
        }),
      ],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'edit', ts: 1, status: 'running' }),
        ev({
          id: 'f1',
          type: 'file_written',
          path: '/theme.css',
          patchOp: 'update_file',
          ts: 2,
        }),
        ev({
          id: 'f2',
          type: 'file_written',
          path: '/slides/01.html',
          patchOp: 'update_file',
          ts: 3,
        }),
        ev({ id: 'pc', type: 'phase_completed', phase: 'edit', label: 'Updates applied', ts: 4 }),
      ],
      sessionStatus: 'idle',
      phase: 'ready',
      pendingAsk: false,
    });

    expect(items.filter((x) => x.type === 'file_card')).toHaveLength(2);
    expect(items.some((x) => x.type === 'prose' && /theme tokens/.test(x.content))).toBe(true);
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

describe('buildSlideChatItems — Retry/Continue CTA', () => {
  it('marks latest failed footer canRetry with retry action by default', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 1, status: 'running' }),
        ev({
          id: 'pf',
          type: 'phase_failed',
          phase: 'build',
          label: 'Error: Build finished without producing a renderable deck.',
          ts: 10,
          status: 'failed',
        }),
      ],
      sessionStatus: 'idle',
      phase: 'error',
      pendingAsk: false,
    });
    const footers = items.filter((x) => x.type === 'turn_footer');
    expect(footers).toHaveLength(1);
    if (footers[0]?.type === 'turn_footer') {
      expect(footers[0].canRetry).toBe(true);
      expect(footers[0].continueAction).toBe('retry');
    }
  });

  it('uses continue action when the failed phase is a max-round stop', () => {
    const items = buildSlideChatItems({
      messages: [],
      activity: [
        ev({ id: 'ps', type: 'phase_started', phase: 'build', ts: 1, status: 'running' }),
        ev({
          id: 'pf',
          type: 'phase_failed',
          phase: 'build',
          label:
            'Error: Hit 24 model rounds with only 1 slide projectable — full deck not finished. Partial work was kept.',
          ts: 10,
          status: 'failed',
        }),
      ],
      sessionStatus: 'idle',
      phase: 'ready',
      pendingAsk: false,
    });
    const footers = items.filter((x) => x.type === 'turn_footer');
    expect(footers).toHaveLength(1);
    if (footers[0]?.type === 'turn_footer') {
      expect(footers[0].canRetry).toBe(true);
      expect(footers[0].continueAction).toBe('continue');
    }
  });
});
