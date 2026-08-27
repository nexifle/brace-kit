import { describe, expect, it, mock } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PendingAsk } from '../../../src/types/ask.ts';

/** SSR has no DOM event target; stub motion so markup tests don't attach listeners. */
function Pass({
  children,
  initial: _initial,
  animate: _animate,
  exit: _exit,
  transition: _transition,
  ...props
}: { children?: ReactNode } & Record<string, unknown>) {
  return createElement('div', props, children);
}
mock.module('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: ReactNode }) => children ?? null,
  motion: { div: Pass },
  useReducedMotion: () => false,
}));

const { AskPrompt } = await import('../../../src/components/slides/AskPrompt.tsx');

function ask(questions: PendingAsk['payload']['questions']): PendingAsk {
  return {
    id: 'ask_1',
    toolCallId: 't1',
    createdAt: 1,
    payload: { questions },
  };
}

function html(node: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(node);
}

describe('AskPrompt', () => {
  it('renders a single question without wizard chrome', () => {
    const markup = html(
      createElement(AskPrompt, {
        ask: ask([{ id: 'q1', text: 'What canvas?', options: ['16:9', '4:5'] }]),
        onSubmit: () => {},
      }),
    );
    expect(markup).toContain('What canvas?');
    expect(markup).toContain('16:9');
    expect(markup).not.toContain('Previous question');
    expect(markup).not.toContain('1/1');
  });

  it('shows one question at a time with prev/next for multi-question asks', () => {
    const markup = html(
      createElement(AskPrompt, {
        ask: ask([
          { id: 'q1', text: 'First question?', options: ['A', 'B'] },
          { id: 'q2', text: 'Second question?', options: ['C'] },
          { id: 'q3', text: 'Third question?' },
        ]),
        onSubmit: () => {},
      }),
    );
    expect(markup).toContain('First question?');
    expect(markup).not.toContain('Second question?');
    expect(markup).not.toContain('Third question?');
    expect(markup).toContain('1/3');
    expect(markup).toContain('Previous question');
    expect(markup).toContain('Next question');
    expect(markup).toContain('Answer');
    expect(markup).not.toContain('Submit anyway');
    expect(markup).toContain('Attach reference image');
  });

  it('does not use 64px attachment tiles', () => {
    const markup = html(
      createElement(AskPrompt, {
        ask: ask([{ id: 'q1', text: 'Notes?', freeText: true }]),
        onSubmit: () => {},
      }),
    );
    expect(markup).not.toContain('h-16 w-16');
    expect(markup).not.toContain('Reference images');
    expect(markup).toContain('Attach reference image');
  });
});
