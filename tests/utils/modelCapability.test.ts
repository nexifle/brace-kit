import { describe, expect, it } from 'bun:test';
import {
  attachmentKindBlocked,
  composerAcceptAttribute,
  specAllowsImageInput,
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

  it('specAllowsImageInput follows the live spec snapshot', () => {
    expect(
      specAllowsImageInput({
        providerConfig: { providerId: 'custom', model: 'm' },
        customProviders: [
          {
            id: 'custom',
            name: 'c',
            apiUrl: '',
            apiKey: '',
            model: 'm',
            defaultModel: 'm',
            format: 'openai',
            models: ['m'],
            modelSpecs: {
              m: { id: 'm', modalities: { input: ['text'], output: ['text'] } },
            },
          },
        ],
        fetchedModels: {},
      }),
    ).toBe(false);
  });

  it('has copy for tools and reasoning alerts', () => {
    expect(CAPABILITY_ALERTS.tools.title.toLowerCase()).toContain('tool');
    expect(CAPABILITY_ALERTS.reasoning.title.toLowerCase()).toContain('reasoning');
  });
});
