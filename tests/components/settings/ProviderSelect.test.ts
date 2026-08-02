/**
 * Tests for ProviderSelect pure logic (flattening + popover placement).
 * DOM behavior (portal, keyboard nav) is exercised via the extension manually.
 */

import { describe, expect, it } from 'bun:test';
import {
  computePopoverPlacement,
  flattenSelectable,
  POPOVER_GAP,
} from '../../../src/components/settings/ProviderSelect.tsx';
import type { ProviderPreset, CustomProvider } from '../../../src/types/index.ts';

function preset(id: string, name: string): ProviderPreset {
  return {
    id,
    name,
    apiUrl: `https://api.${id}.com/v1`,
    defaultModel: 'm1',
    format: 'openai',
  };
}

function custom(id: string, name: string): CustomProvider {
  return {
    id,
    name,
    apiUrl: 'http://localhost:8080/v1',
    apiKey: '',
    model: '',
    defaultModel: '',
    format: 'openai',
    models: [],
  };
}

describe('flattenSelectable', () => {
  const openai = preset('openai', 'OpenAI');
  const anthropic = preset('anthropic', 'Anthropic');
  const myLLM = custom('custom_1', 'My LLM');

  it('places the pinned provider first, then built-ins, then customs', () => {
    const result = flattenSelectable(myLLM, [openai, anthropic], []);
    expect(result.map((p) => p.id)).toEqual(['custom_1', 'openai', 'anthropic']);
  });

  it('returns built-ins then customs when nothing is pinned', () => {
    const result = flattenSelectable(null, [openai, anthropic], [myLLM]);
    expect(result.map((p) => p.id)).toEqual(['openai', 'anthropic', 'custom_1']);
  });

  it('excludes the pinned provider from the rest lists (no duplicates)', () => {
    const result = flattenSelectable(openai, [], [myLLM]);
    expect(result.map((p) => p.id)).toEqual(['openai', 'custom_1']);
  });

  it('returns an empty array when there is nothing to show', () => {
    expect(flattenSelectable(null, [], [])).toEqual([]);
  });
});

describe('computePopoverPlacement', () => {
  // Trigger near the top of a tall viewport → open below
  it('opens below when there is enough room', () => {
    const rect = { top: 100, bottom: 148 };
    const p = computePopoverPlacement(rect, 800);
    expect(p.flipAbove).toBe(false);
    expect(p.top).toBe(148 + POPOVER_GAP);
    expect(p.maxHeight).toBeLessThanOrEqual(800 - POPOVER_GAP);
  });

  // Trigger near the bottom → flip above
  it('flips above when there is more room above', () => {
    const rect = { top: 600, bottom: 648 };
    const p = computePopoverPlacement(rect, 700);
    expect(p.flipAbove).toBe(true);
    expect(p.top).toBe(600 - POPOVER_GAP);
  });

  // Neither side fits → pick the larger side and clamp to the viewport
  it('clamps height to the viewport on very small displays', () => {
    const rect = { top: 60, bottom: 108 };
    const p = computePopoverPlacement(rect, 120);
    expect(p.maxHeight).toBeLessThanOrEqual(120 - POPOVER_GAP);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(120);
  });

  it('never lets the popover overflow the viewport bottom', () => {
    for (const viewport of [200, 300, 420, 600, 900]) {
      for (const top of [20, 80, 150, 300]) {
        const p = computePopoverPlacement({ top, bottom: top + 48 }, viewport);
        expect(p.top + p.maxHeight).toBeLessThanOrEqual(viewport);
      }
    }
  });

  it('keeps the floor only when it fits within the viewport', () => {
    // Small viewport: the 120px floor must not push the popover off-screen.
    const rect = { top: 30, bottom: 78 };
    const p = computePopoverPlacement(rect, 90);
    expect(p.maxHeight).toBeLessThanOrEqual(90 - POPOVER_GAP);
  });
});
