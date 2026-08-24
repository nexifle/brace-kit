import { describe, expect, it } from 'bun:test';
import {
  attachmentKindBlocked,
  composerAcceptAttribute,
  CAPABILITY_ALERTS,
} from '../../src/utils/modelCapability.ts';

describe('modelCapability', () => {
  it('blocks image attach when input modalities omit image', () => {
    const spec = {
      id: 't',
      modalities: { input: ['text' as const], output: ['text' as const] },
    };
    expect(attachmentKindBlocked(spec, 'image')).toBe('image');
    expect(attachmentKindBlocked(spec, 'text')).toBeNull();
    expect(composerAcceptAttribute(spec)).not.toContain('image');
  });

  it('has copy for tools and reasoning alerts', () => {
    expect(CAPABILITY_ALERTS.tools.title.toLowerCase()).toContain('tool');
    expect(CAPABILITY_ALERTS.reasoning.title.toLowerCase()).toContain('reasoning');
  });
});
