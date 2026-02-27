/**
 * Settings Service for selection-ui
 * Manages settings storage and synchronization
 */

import { DEFAULT_MIN_SELECTION_LENGTH, STORAGE_KEYS } from '../constants.ts';
import { logger } from '../utils/logger.ts';
import { isExtensionContextInvalidated, isChromeRuntimeAvailable } from '../utils/chromeErrorHandler.ts';

// === Types ===

export interface SelectionSettings {
  enabled: boolean;
  minLength: number;
}

export type SettingsChangeListener = (settings: SelectionSettings) => void;

export interface SettingsService {
  getSettings(): SelectionSettings;
  loadSettings(): Promise<void>;
  updateSettings(partial: Partial<SelectionSettings>): void;
  subscribe(listener: SettingsChangeListener): () => void;
  cleanup(): void;
}

// === Settings Service Factory ===

export function createSettingsService(): SettingsService {
  let settings: SelectionSettings = {
    enabled: true,
    minLength: DEFAULT_MIN_SELECTION_LENGTH,
  };

  const listeners = new Set<SettingsChangeListener>();

  async function loadSettings(): Promise<void> {
    // Check if extension context is still valid
    if (!isChromeRuntimeAvailable()) {
      logger.warn('Extension context not available, using default settings');
      return;
    }

    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.ENABLED,
        STORAGE_KEYS.MIN_LENGTH,
      ]);

      settings = {
        enabled: (result[STORAGE_KEYS.ENABLED] as boolean | undefined) ?? true,
        minLength: (result[STORAGE_KEYS.MIN_LENGTH] as number | undefined) ?? DEFAULT_MIN_SELECTION_LENGTH,
      };

      notifyListeners();
    } catch (error) {
      if (isExtensionContextInvalidated(error)) {
        logger.warn('Extension context invalidated while loading settings');
        return;
      }
      logger.error('Failed to load settings', error);
      // Use default settings if storage access fails
    }
  }

  function getSettings(): SelectionSettings {
    return { ...settings };
  }

  function updateSettings(partial: Partial<SelectionSettings>): void {
    settings = { ...settings, ...partial };
    notifyListeners();
  }

  function subscribe(listener: SettingsChangeListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function notifyListeners(): void {
    const currentSettings = getSettings();
    listeners.forEach((listener) => {
      try {
        listener(currentSettings);
      } catch (error) {
        logger.error('Settings listener error', error);
      }
    });
  }

  function handleStorageChange(changes: { [key: string]: chrome.storage.StorageChange }): void {
    if (changes[STORAGE_KEYS.ENABLED]) {
      settings.enabled = (changes[STORAGE_KEYS.ENABLED].newValue as boolean | undefined) ?? true;
    }
    if (changes[STORAGE_KEYS.MIN_LENGTH]) {
      settings.minLength = (changes[STORAGE_KEYS.MIN_LENGTH].newValue as number | undefined) ?? DEFAULT_MIN_SELECTION_LENGTH;
    }
    notifyListeners();
  }

  function cleanup(): void {
    listeners.clear();
    // Safely remove listener - may fail if context invalidated
    try {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    } catch {
      // Context may already be invalidated
    }
  }

  // Safely add storage listener
  try {
    chrome.storage.onChanged.addListener(handleStorageChange);
  } catch {
    logger.warn('Could not add storage change listener - extension context may be invalid');
  }

  return {
    getSettings,
    loadSettings,
    updateSettings,
    subscribe,
    cleanup,
  };
}

// === Singleton Instance ===

let settingsServiceInstance: SettingsService | null = null;

export function getSettingsService(): SettingsService {
  if (!settingsServiceInstance) {
    settingsServiceInstance = createSettingsService();
  }
  return settingsServiceInstance;
}

export function resetSettingsService(): void {
  if (settingsServiceInstance) {
    settingsServiceInstance.cleanup();
    settingsServiceInstance = null;
  }
}
