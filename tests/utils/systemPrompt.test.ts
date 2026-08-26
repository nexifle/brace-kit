import { describe, expect, it } from 'bun:test';
import { buildSystemPrompt, INTERNAL_SYSTEM_PROMPT } from '../../src/utils/systemPrompt.ts';

describe('system prompt assembly', () => {
  it('includes the internal prompt exactly once when the custom prompt is empty', () => {
    const prompt = buildSystemPrompt('', '', '<metadata>{"currentTime":"now"}</metadata>');

    expect(prompt).toBe(`${INTERNAL_SYSTEM_PROMPT}\n\n<metadata>{"currentTime":"now"}</metadata>`);
    expect(prompt.match(/You are BraceKit/g)).toHaveLength(1);
  });

  it('keeps the internal prompt separate from the custom prompt', () => {
    const prompt = buildSystemPrompt('Use a friendly tone.');

    expect(prompt).toBe(`${INTERNAL_SYSTEM_PROMPT}\n\nUse a friendly tone.`);
    expect(prompt.match(/You are BraceKit/g)).toHaveLength(1);
  });

  it('requires GitHub callout blockquotes, not bare [!NOTE] labels', () => {
    expect(INTERNAL_SYSTEM_PROMPT).toContain('> [!NOTE]');
    expect(INTERNAL_SYSTEM_PROMPT).toContain('Every line of the callout must start with "> "');
    expect(INTERNAL_SYSTEM_PROMPT).toContain('not a bare [!NOTE] label');
  });
});
