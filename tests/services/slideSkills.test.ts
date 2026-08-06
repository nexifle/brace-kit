import { describe, expect, it } from 'bun:test';
import { loadSlideSkill } from '../../src/services/slideSkills.ts';

/** Serve skill resources from an in-memory map (no chrome/fetch). */
function fetcherFrom(store: Record<string, string>) {
  return async (url: string) => {
    const key = url.replace('skills://skills/slide-creator/', '');
    const text = store[key];
    if (text === undefined) throw new Error(`not found: ${key}`);
    return text;
  };
}

describe('loadSlideSkill', () => {
  it('concatenates SKILL.md with every references/*.md it mentions', async () => {
    const prompt = await loadSlideSkill('plan', {
      fetcher: fetcherFrom({
        'plan/SKILL.md':
          'skill body here. Follow `references/brief-template.md` and `references/design-template.md`.',
        'plan/references/brief-template.md': '# brief template',
        'plan/references/design-template.md': '# design template',
      }),
    });

    expect(prompt).toContain('skill body here');
    expect(prompt).toContain('--- references/brief-template.md ---');
    expect(prompt).toContain('# brief template');
    expect(prompt).toContain('--- references/design-template.md ---');
    expect(prompt).toContain('# design template');
  });

  it('skips a missing references file non-fatally', async () => {
    const prompt = await loadSlideSkill('build', {
      // Only SKILL.md served; its references file is missing.
      fetcher: fetcherFrom({
        'build/SKILL.md': 'build skill. See `references/deck-file-contract.md`.',
      }),
    });

    expect(prompt).toContain('build skill');
    // The missing reference is ignored, not thrown.
    expect(prompt).not.toContain('--- references/deck-file-contract.md ---');
  });

  it('dedupes repeated references in the skill body', async () => {
    const fetchUrls: string[] = [];
    const fetcher = async (url: string) => {
      fetchUrls.push(url);
      const key = url.replace('skills://skills/slide-creator/', '');
      if (key === 'plan/SKILL.md') {
        return 'a `references/element-palette.md` and again `references/element-palette.md`';
      }
      if (key === 'plan/references/element-palette.md') return '# palette';
      throw new Error('missing ' + key);
    };

    const prompt = await loadSlideSkill('plan', { fetcher });
    expect(prompt).toContain('# palette');
    // only one fetch for the deduped reference
    const refFetches = fetchUrls.filter((u) => u.includes('element-palette'));
    expect(refFetches.length).toBe(1);
  });

  it('propagates a missing SKILL.md as an error', async () => {
    const fetcher = fetcherFrom({});
    await expect(loadSlideSkill('edit', { fetcher })).rejects.toThrow(/not found: edit\/SKILL\.md/);
  });
});
