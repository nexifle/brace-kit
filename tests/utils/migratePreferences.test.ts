import { describe, expect, it } from 'bun:test';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  migratePreferences,
} from '../../src/utils/migratePreferences';

describe('migratePreferences', () => {
  it('returns defaults when nothing is stored', () => {
    const { preferences, dirty } = migratePreferences(undefined);
    expect(preferences).toEqual(DEFAULT_PREFERENCES);
    expect(dirty).toBe(false);
  });

  it('flips pre-v2 installs to timeline and marks dirty', () => {
    const { preferences, dirty } = migratePreferences({
      toolMessageDisplay: 'detailed',
      startOnWelcome: true,
      slideCreatorTabSuggestionDismissed: true,
    });
    expect(dirty).toBe(true);
    expect(preferences.toolMessageDisplay).toBe('compact');
    expect(preferences.startOnWelcome).toBe(true);
    expect(preferences.slideCreatorTabSuggestionDismissed).toBe(true);
    expect(preferences.preferencesVersion).toBe(PREFERENCES_VERSION);
  });

  it('keeps an explicit detailed choice after version is applied', () => {
    const { preferences, dirty } = migratePreferences({
      toolMessageDisplay: 'detailed',
      startOnWelcome: false,
      slideCreatorTabSuggestionDismissed: false,
      preferencesVersion: PREFERENCES_VERSION,
    });
    expect(dirty).toBe(false);
    expect(preferences.toolMessageDisplay).toBe('detailed');
  });
});
