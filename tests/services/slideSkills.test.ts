import { describe, expect, it } from 'bun:test';
import {
  ALREADY_LOADED_SKILL_PREFIX,
  buildSlidePhaseStub,
  collectLoadedSkillIds,
  listSlideSkillCatalog,
  loadSlideSkill,
  loadSlideSkillResource,
  normalizeSlideSkillName,
} from '../../src/services/slideSkills.ts';

/** Serve skill resources from an in-memory map (no chrome/fetch). */
function fetcherFrom(store: Record<string, string>) {
  return async (url: string) => {
    const key = url.replace('skills://skills/slide-creator/', '');
    const text = store[key];
    if (text === undefined) throw new Error(`not found: ${key}`);
    return text;
  };
}

const PLAN_SKILL = `---
name: slide-creator-plan
description: Planning phase skill.
---

skill body here. Follow \`references/brief-template.md\` and \`references/design-template.md\`.
`;

describe('normalizeSlideSkillName', () => {
  it('accepts SKILL.md, skill, and references/*.md', () => {
    expect(normalizeSlideSkillName('SKILL.md')).toBe('SKILL.md');
    expect(normalizeSlideSkillName('skill')).toBe('SKILL.md');
    expect(normalizeSlideSkillName('references/brief-template.md')).toBe(
      'references/brief-template.md',
    );
    expect(normalizeSlideSkillName('slide-creator-plan', undefined, 'slide-creator-plan')).toBe(
      'SKILL.md',
    );
  });

  it('rejects traversal and URLs', () => {
    expect(normalizeSlideSkillName('../edit/SKILL.md')).toBeNull();
    expect(normalizeSlideSkillName('references/../../x.md')).toBeNull();
    expect(normalizeSlideSkillName('https://evil.example/x.md')).toBeNull();
    expect(normalizeSlideSkillName('')).toBeNull();
  });
});

describe('listSlideSkillCatalog / loadSlideSkill', () => {
  it('lists SKILL.md plus mentioned references without concatenating bodies into the stub', async () => {
    const fetcher = fetcherFrom({
      'plan/SKILL.md': PLAN_SKILL,
      'plan/references/brief-template.md': '# brief template',
      'plan/references/design-template.md': '# design template',
    });

    const catalog = await listSlideSkillCatalog('plan', { fetcher });
    expect(catalog.map((e) => e.id)).toEqual([
      'SKILL.md',
      'references/brief-template.md',
      'references/design-template.md',
    ]);
    expect(catalog[0].description).toContain('Planning phase');
    expect(catalog[1].description).toBe('brief template');

    const prompt = await loadSlideSkill('plan', { fetcher });
    expect(prompt).toContain('Skill catalog');
    expect(prompt).toContain('`references/brief-template.md`');
    expect(prompt).toContain('Terse chat output (token-efficient)');
    expect(prompt).not.toContain('skill body here');
    expect(prompt).not.toContain('--- references/brief-template.md ---');
    expect(prompt).not.toMatch(/^# brief template$/m);
  });

  it('still catalogs a missing references file (load_skill errors later)', async () => {
    const catalog = await listSlideSkillCatalog('build', {
      fetcher: fetcherFrom({
        'build/SKILL.md': 'build skill. See `references/deck-file-contract.md`.',
      }),
    });
    expect(catalog.some((e) => e.id === 'references/deck-file-contract.md')).toBe(true);
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

    const catalog = await listSlideSkillCatalog('plan', { fetcher });
    expect(catalog.filter((e) => e.id.includes('element-palette')).length).toBe(1);
    const refFetches = fetchUrls.filter((u) => u.includes('element-palette'));
    expect(refFetches.length).toBe(1);
  });

  it('propagates a missing SKILL.md as an error when building the catalog', async () => {
    const fetcher = fetcherFrom({});
    await expect(loadSlideSkill('edit', { fetcher })).rejects.toThrow(/not found: edit\/SKILL\.md/);
  });

  it('appends the shared terse chat-output block to every phase stub', async () => {
    for (const phase of ['plan', 'build', 'edit'] as const) {
      const prompt = await loadSlideSkill(phase, {
        fetcher: fetcherFrom({ [`${phase}/SKILL.md`]: `${phase} skill body` }),
      });
      expect(prompt).toContain('Terse chat output (token-efficient)');
    }
  });
});

describe('loadSlideSkillResource', () => {
  const fetcher = fetcherFrom({
    'plan/SKILL.md': PLAN_SKILL,
    'plan/references/brief-template.md': '# brief template\nbody of template',
  });

  it('returns SKILL.md body', async () => {
    const text = await loadSlideSkillResource('plan', 'SKILL.md', { fetcher });
    expect(text).toContain('skill body here');
  });

  it('returns a reference body', async () => {
    const text = await loadSlideSkillResource('plan', 'references/brief-template.md', { fetcher });
    expect(text).toContain('body of template');
  });

  it('errors on traversal and unknown names without throwing', async () => {
    const bad = await loadSlideSkillResource('plan', '../edit/SKILL.md', { fetcher });
    expect(bad.startsWith('Error:')).toBe(true);
    const unknown = await loadSlideSkillResource('plan', 'references/nope.md', { fetcher });
    expect(unknown.startsWith('Error:')).toBe(true);
  });

  it('returns already-loaded notice and skips body on duplicate; clear allows reload', async () => {
    const alreadyLoaded = new Set<string>();
    const first = await loadSlideSkillResource('plan', 'SKILL.md', { fetcher, alreadyLoaded });
    expect(first).toContain('skill body here');
    expect(alreadyLoaded.has('SKILL.md')).toBe(true);

    const second = await loadSlideSkillResource('plan', 'skill', { fetcher, alreadyLoaded });
    expect(second.startsWith(ALREADY_LOADED_SKILL_PREFIX)).toBe(true);
    expect(second).toContain('SKILL.md');
    expect(second).not.toContain('skill body here');

    alreadyLoaded.clear();
    const third = await loadSlideSkillResource('plan', 'SKILL.md', { fetcher, alreadyLoaded });
    expect(third).toContain('skill body here');
  });

  it('does not mark failed loads as already loaded', async () => {
    const alreadyLoaded = new Set<string>();
    const bad = await loadSlideSkillResource('plan', 'references/nope.md', {
      fetcher,
      alreadyLoaded,
    });
    expect(bad.startsWith('Error:')).toBe(true);
    expect(alreadyLoaded.size).toBe(0);
  });
});

describe('collectLoadedSkillIds', () => {
  it('collects successful load_skill ids from a transcript', () => {
    const ids = collectLoadedSkillIds([
      { role: 'user', content: 'hi' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [
          { id: 'a', name: 'load_skill', arguments: '{"name":"SKILL.md"}' },
          { id: 'b', name: 'load_skill', arguments: '{"name":"references/brief-template.md"}' },
          { id: 'c', name: 'load_skill', arguments: '{"name":"SKILL.md"}' },
        ],
      },
      { role: 'tool', toolCallId: 'a', name: 'load_skill', content: 'skill body' },
      {
        role: 'tool',
        toolCallId: 'b',
        name: 'load_skill',
        content: 'Error: load_skill failed',
      },
      {
        role: 'tool',
        toolCallId: 'c',
        name: 'load_skill',
        content: `${ALREADY_LOADED_SKILL_PREFIX}SKILL.md. notice`,
      },
    ]);
    expect([...ids]).toEqual(['SKILL.md']);
  });
});

describe('buildSlidePhaseStub', () => {
  it('does not embed catalog bodies', () => {
    const stub = buildSlidePhaseStub('plan', [
      { id: 'SKILL.md', description: 'Planning' },
      { id: 'references/element-palette.md', description: 'Decorative Element Palette' },
    ]);
    expect(stub).toContain('`references/element-palette.md`');
    expect(stub).not.toContain('Think of the slide canvas as a blank workspace');
  });

  it('tells the agent to load each skill once and allow reload after compact', () => {
    const stub = buildSlidePhaseStub('plan', [{ id: 'SKILL.md', description: 'Planning' }]);
    expect(stub).toContain('**once**');
    expect(stub).toContain('Do **not** reload');
    expect(stub).toContain('already-loaded notice');
    expect(stub).toContain('context summary/compact');
  });
});
