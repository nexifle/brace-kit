import type { Preferences } from '../types/index.ts';

/** v2: Tool Message Display factory default is timeline (`compact`). */
export const PREFERENCES_VERSION = 2;

export const DEFAULT_PREFERENCES: Preferences = {
  toolMessageDisplay: 'compact',
  startOnWelcome: false,
  slideCreatorTabSuggestionDismissed: false,
  preferencesVersion: PREFERENCES_VERSION,
};

export function migratePreferences(
  loaded: Partial<Preferences> | undefined,
): { preferences: Preferences; dirty: boolean } {
  if (!loaded) {
    return { preferences: { ...DEFAULT_PREFERENCES }, dirty: false };
  }

  const version = loaded.preferencesVersion ?? 0;
  const rest = { ...loaded };
  delete (rest as Partial<Preferences> & { toolTimelineDefaultApplied?: boolean }).toolTimelineDefaultApplied;

  const preferences: Preferences = {
    ...DEFAULT_PREFERENCES,
    ...rest,
    preferencesVersion: PREFERENCES_VERSION,
  };

  if (version < PREFERENCES_VERSION) {
    preferences.toolMessageDisplay = 'compact';
    return { preferences, dirty: true };
  }

  return { preferences, dirty: false };
}
